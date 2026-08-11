/* batti.js - ponte con Batti (spese condivise): le spese pagate da te
   arrivano da sole in Soldi, con nota. Lettura via REST Firestore col
   codice-gruppo segreto (modello Splid, config client pubblica). */
'use strict';

const Batti = (() => {
  const API = 'https://firestore.googleapis.com/v1/projects/spese-condivise-c1017/databases/(default)/documents';
  const KEY = 'AIzaSyAMpIiSe9aIRuGgGEiHFIlOnm07-DYWRUg';
  const cfg = () => DB.state.settings.batti || null;
  const enabled = () => !!(cfg() && cfg().on);

  /* ---------- Firestore REST ---------- */
  function uv(v) {
    if (v == null) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return +v.integerValue;
    if (v.doubleValue !== undefined) return +v.doubleValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.nullValue !== undefined) return null;
    if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, uv(x)]));
    if (v.arrayValue) return (v.arrayValue.values || []).map(uv);
    return null;
  }
  function docToObj(d) {
    const o = {};
    for (const [k, val] of Object.entries(d.fields || {})) o[k] = uv(val);
    o.id = d.name.split('/').pop();
    return o;
  }

  function parseGroupId(text) {
    const m = String(text || '').match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (m) return m[0];
    const t = String(text || '').trim().split(/[/#?]/).filter(Boolean).pop();
    return t && t.length >= 8 ? t : null;
  }

  async function fetchMeta(gid) {
    const r = await fetch(`${API}/groups/${encodeURIComponent(gid)}?key=${KEY}`);
    if (r.status === 404) throw new Error('Gruppo non trovato: controlla il link o il codice.');
    if (!r.ok) throw new Error('Errore Batti (' + r.status + ').');
    return docToObj(await r.json());
  }

  async function fetchExpenses(gid) {
    let out = [], token = '';
    do {
      const r = await fetch(`${API}/groups/${encodeURIComponent(gid)}/expenses?pageSize=300&key=${KEY}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      if (!r.ok) throw new Error('Errore Batti (' + r.status + ').');
      const j = await r.json();
      out = out.concat((j.documents || []).map(docToObj));
      token = j.nextPageToken || '';
    } while (token);
    return out;
  }

  /* ---------- mappatura categorie per nome ---------- */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // punteggio per parole in comune: la prima parola del nome Batti pesa doppio
  function mapCategory(battiName) {
    if (!battiName) return null;
    const bn = norm(battiName);
    const bw = bn.split(/\W+/).filter(w => w.length > 3);
    let best = null, bestScore = 0;
    for (const c of DB.state.categories.filter(x => !x.archived)) {
      const cn = norm(c.name);
      if (cn === bn) return c.id;
      let score = 0;
      bw.forEach((w, i) => { if (cn.includes(w)) score += i === 0 ? 2 : 1; });
      cn.split(/\W+/).forEach(w => { if (w.length > 3 && bn.includes(w)) score += 1; });
      if (score > bestScore) { bestScore = score; best = c.id; }
    }
    return best;
  }

  /* ---------- import ---------- */
  let importing = false;
  async function importNow() {
    const c = cfg();
    if (!c || !c.on || importing) return 0;
    importing = true;
    try {
      const [meta, expenses] = await Promise.all([fetchMeta(c.groupId), fetchExpenses(c.groupId)]);
      const catName = Object.fromEntries((meta.categories || []).map(x => [x.id, x.name]));
      let created = 0;
      for (const e of expenses) {
        if (e.paidBy !== c.memberId) continue;           // solo le spese pagate da te
        if (!e.amount || e.amount <= 0) continue;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : null;
        if (!date || date < (c.fromDate || '0000')) continue; // dal collegamento in poi
        const id = 'batti-' + e.id;                       // id deterministico: niente doppioni
        if (DB.state.tx.some(t => t.id === id)) continue;
        if (DB.state.gone.some(g => g.id === id)) continue; // eliminata a mano: non torna
        await DB.putTx({
          id, date,
          desc: e.desc || catName[e.catId] || 'Spesa condivisa',
          amount: e.amount, type: 'out',
          account: c.account || null,
          category: mapCategory(catName[e.catId]) || mapCategory(e.desc)
            || (typeof Parser !== 'undefined' ? (Parser.parse('1 ' + (e.desc || ''), DB.state)?.category ?? null) : null),
          note: 'Importata automaticamente da Batti',
        });
        created++;
      }
      c.lastImport = Date.now();
      await DB.saveSettings();
      return created;
    } finally {
      importing = false;
    }
  }

  function boot() {
    if (!enabled()) return;
    const run = () => importNow().then(n => {
      if (n > 0) { toast(n === 1 ? '1 spesa importata da Batti' : n + ' spese importate da Batti'); render(); }
    }).catch(() => { /* offline o gruppo momentaneamente irraggiungibile */ });
    run();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && enabled()) run();
    });
  }

  return { parseGroupId, fetchMeta, fetchExpenses, mapCategory, importNow, enabled, cfg, boot };
})();
