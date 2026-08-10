/* parser.js — "12 pizza contanti" → movimento. Tutto locale, zero rete. */
'use strict';

const Parser = (() => {

  const KW_CAT = [
    [/\bFATTUR/i, 'fatture'],
    [/\bF24\b|\bTASSE\b|\bINPS\b|AGENZIA ENTRATE|TRIBUT/i, 'tasse'],
    [/CARBURANT|BENZIN|DIESEL|RIFORNIMENT/i, 'carburante'],
    [/BOLLETT|\bENEL\b|\bENI\b|\bHERA\b|\bLUCE\b|\bGAS\b|ACQUEDOTT/i, 'utenze'],
    [/SUPERMERC|\bLIDL\b|\bCONAD\b|EUROSPIN|ESSELUNGA|CARREFOUR|\bSPESA\b/i, 'spesa-casa'],
    [/ABBONAMENT|NETFLIX|SPOTIFY|CHAT ?GPT|SEOZOOM|IONOS|PALESTR|\bTIM\b|VODAFONE|ILIAD|PRIME\b/i, 'abbonamenti'],
    [/\bCENA\b|\bPRANZO\b|SUSHI|RAMEN|PIZZ|JUST ?EAT|GLOVO|DELIVEROO|COLAZION|APERITIV|RISTORANT|POKE|KEBAB|BURGER/i, 'pasti'],
    [/REGAL/i, 'regali'],
    [/FARMAC|MEDIC|OSPEDAL|DOTT|DENTIST|ANALISI|VISITA/i, 'sanita'],
    [/\bZARA\b|H\s*&\s*M|ALCOTT|PRIMARK|ZALANDO|SHOPPING|SCARPE|ABBIGLIAMENT|VESTIT|AMAZON/i, 'shopping'],
    [/VIAGGI|HOTEL|B&B|\bVOLO\b|RYANAIR|EASYJET|TRENITALIA|ITABUS|FLIXBUS|AIRBNB|BOOKING/i, 'viaggi'],
    [/AFFITT/i, 'affitto'],
    [/COLLABORAT/i, 'collaboratori'],
  ];

  const IN_WORDS = /\b(entrata|incasso|incassat[oa]|ricevut[oa]|guadagnat[oa]|stipendio|accredito|\+)\b/i;
  const TRANSFER_WORDS = /\b(giroconto|trasferiment|sposta|versament)\b/i;

  // "12", "12,50", "12.50", "12€", "€12", "12 euro"
  const AMOUNT_RE = /(?:€\s*)(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro\b|eur\b)|(?<![\d,.])(\d+(?:[.,]\d{1,2})?)(?![\d,.]?\s*(?:gb|kg|km|%|x\b))/i;

  function toCents(s) {
    return Math.round(parseFloat(String(s).replace(',', '.')) * 100);
  }

  function matchAccount(text, accounts) {
    const t = ' ' + text.toLowerCase() + ' ';
    // alias fissi + nomi conto dinamici
    const aliases = [];
    for (const a of accounts.filter(a => !a.archived)) {
      const words = a.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      aliases.push({ id: a.id, keys: [a.name.toLowerCase(), ...words] });
    }
    const fixed = { contanti: ['contanti', 'cash', 'contante'], carta: ['carta', 'credito'], unicredit: ['banca', 'conto'], };
    for (const [id, keys] of Object.entries(fixed)) {
      const found = aliases.find(x => x.id === id);
      if (found) found.keys.push(...keys);
    }
    let best = null;
    for (const a of aliases) {
      for (const k of a.keys) {
        if (k.length < 4 && !['cash'].includes(k)) continue;
        const idx = t.indexOf(' ' + k);
        if (idx >= 0 && (!best || k.length > best.len)) best = { id: a.id, len: k.length, word: k };
      }
    }
    return best;
  }

  // sempre in ora locale: toISOString è UTC e sbaglia giorno vicino a mezzanotte
  function localISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function matchDate(text) {
    const now = new Date();
    let m;
    if ((m = text.match(/\baltro\s?ieri\b/i))) { const d = new Date(now); d.setDate(d.getDate() - 2); return { date: localISO(d), word: m[0] }; }
    if (/\bieri\b/i.test(text)) { const d = new Date(now); d.setDate(d.getDate() - 1); return { date: localISO(d), word: 'ieri' }; }
    if ((m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/))) {
      let [, dd, mm, yy] = m;
      let y = yy ? (yy.length === 2 ? 2000 + +yy : +yy) : now.getFullYear();
      const d = new Date(y, mm - 1, dd);
      if (!isNaN(d) && d.getDate() === +dd) {
        // se la data risulta futura di molto e l'anno era implicito, è probabilmente dell'anno scorso
        if (!yy && d - now > 40 * 864e5) d.setFullYear(y - 1);
        return { date: localISO(d), word: m[0] };
      }
    }
    return { date: localISO(now), word: null };
  }

  function parse(text, { accounts, categories }) {
    const raw = text.trim();
    if (!raw) return null;
    let rest = raw;

    // importo
    const am = rest.match(AMOUNT_RE);
    if (!am) return { error: 'Non trovo l\'importo. Scrivi ad esempio: "12,50 pizza contanti".' };
    const amountStr = am[1] || am[2] || am[3];
    const amount = toCents(amountStr);
    if (!amount || amount <= 0) return { error: 'Importo non valido.' };
    rest = rest.replace(am[0], ' ');

    // tipo
    let type = 'out';
    if (IN_WORDS.test(rest)) { type = 'in'; rest = rest.replace(IN_WORDS, ' '); }
    if (TRANSFER_WORDS.test(rest)) type = 'transfer';

    // fattura → entrata con calcolo fiscale
    let invoice = null;
    if (/\bfattur/i.test(rest)) { type = 'in'; invoice = { bollo: true, rivalsa: false }; }

    // data
    const dm = matchDate(rest);
    if (dm.word) rest = rest.replace(dm.word, ' ');

    // conto
    const accM = matchAccount(rest, accounts);
    let account = accM ? accM.id : null;
    if (accM) rest = rest.replace(new RegExp(accM.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');

    // categoria: prima nome esatto, poi keyword
    let category = null;
    for (const c of categories.filter(c => !c.archived)) {
      const re = new RegExp('\\b' + c.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(rest)) { category = c.id; break; }
    }
    if (!category) {
      for (const [re, id] of KW_CAT) if (re.test(rest)) { category = id; break; }
    }
    if (invoice) category = 'fatture';
    if (!category && type === 'out') category = null; // resta senza categoria, l'utente conferma

    // descrizione = quello che resta
    let desc = rest.replace(/\s+/g, ' ').trim().replace(/^[-–,.;:]+|[-–,.;:]+$/g, '').trim();
    if (!desc) {
      const c = categories.find(x => x.id === category);
      desc = c ? c.name : (type === 'in' ? 'Entrata' : 'Spesa');
    }
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    return { amount, type, account, category, desc, date: dm.date, invoice };
  }

  /* ---------- Gemini (opzionale, foto scontrino / testo complesso) ---------- */
  const GEMINI_MODEL = 'gemini-2.5-flash';

  async function geminiParse({ apiKey, text, imageBase64, mimeType, accounts, categories }) {
    const accList = accounts.filter(a => !a.archived).map(a => a.id + ' = ' + a.name).join('; ');
    const catList = categories.filter(c => !c.archived).map(c => c.id + ' = ' + c.name).join('; ');
    const today = localISO(new Date());
    const sys = `Estrai un movimento di denaro. Rispondi SOLO con JSON valido:
{"amount": <euro, numero>, "type": "in"|"out", "date": "YYYY-MM-DD", "desc": "<descrizione breve MAIUSCOLA>", "account": <id conto o null>, "category": <id categoria o null>}
Conti: ${accList}. Categorie: ${catList}. Oggi è ${today}. Se è uno scontrino usa il totale. Se non sei sicuro di conto o categoria metti null.`;
    const parts = [];
    if (imageBase64) parts.push({ inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } });
    parts.push({ text: text ? text : 'Estrai il movimento dallo scontrino in foto.' });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0, response_mime_type: 'application/json' },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(res.status === 400 && /API_KEY/i.test(err) ? 'API key non valida.' : 'Errore Gemini (' + res.status + ').');
    }
    const data = await res.json();
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Risposta vuota da Gemini.');
    const j = JSON.parse(out);
    const amount = Math.round(Number(j.amount) * 100);
    if (!amount || amount <= 0) throw new Error('Gemini non ha trovato un importo.');
    return {
      amount,
      type: j.type === 'in' ? 'in' : 'out',
      date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : localISO(new Date()),
      desc: String(j.desc || 'Spesa').slice(0, 80),
      account: accounts.some(a => a.id === j.account) ? j.account : null,
      category: categories.some(c => c.id === j.category) ? j.category : null,
      invoice: null,
    };
  }

  return { parse, geminiParse };
})();
