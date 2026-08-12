// test.mjs - self-check: matematica fiscale vs foglio Google + parser. Esegui: node test/test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = f => readFileSync(join(root, f), 'utf8');

// db.js e parser.js sono script browser senza dipendenze a livello modulo: basta eval
(0, eval)(load('js/db.js') + '\n;globalThis.DB = DB;');
(0, eval)(load('js/parser.js') + '\n;globalThis.Parser = Parser;');
const { DB, Parser } = globalThis;

const S = { imposta: 0.15, inps: 0.24, coeff: 0.78, rivalsa: 0.04, bollo: 200 };

// --- fisco: valori presi dal foglio "Riepilogo Annuale" 2026 ---
// Gennaio: lordo 1200, bollo 2, rivalsa sì → imposta 140,17 · INPS 224,27 · da parte 364,44 · netto 835,56
let c = DB.invoiceCalc({ amount: 120000, invoice: { bollo: true, rivalsa: true } }, S);
assert.equal(c.imposta, 14017);
assert.equal(c.inps, 22427);
assert.equal(c.daParte, 36444);
assert.equal(c.netto, 83556);
assert.equal(c.rivalsaAmt, 4800); // 4% del lordo, come nel foglio

// Marzo: lordo 707 → da parte 214,47 · netto 492,53
c = DB.invoiceCalc({ amount: 70700, invoice: { bollo: true, rivalsa: true } }, S);
assert.equal(c.daParte, 21447);
assert.equal(c.netto, 49253);

// Senza bollo né rivalsa: imponibile pieno
c = DB.invoiceCalc({ amount: 100000, invoice: { bollo: false, rivalsa: false } }, S);
assert.equal(c.imponibile, 78000);
assert.equal(c.daParte, Math.round(78000 * 0.15) + Math.round(78000 * 0.24));

// --- parser ---
const env = {
  accounts: [
    { id: 'contanti', name: 'Contanti' }, { id: 'unicredit', name: 'Conto Principale Unicredit' },
    { id: 'carta', name: 'Carta di credito' },
  ],
  categories: [
    { id: 'pasti', name: 'Pasti fuori o domicilio' }, { id: 'carburante', name: 'Carburante' },
    { id: 'fatture', name: 'Fatture' }, { id: 'regali', name: 'Regali' },
  ],
};
let p = Parser.parse('12,50 pizza contanti', env);
assert.equal(p.amount, 1250);
assert.equal(p.type, 'out');
assert.equal(p.account, 'contanti');
assert.equal(p.category, 'pasti');

p = Parser.parse('fattura 800 cliente MB', env);
assert.equal(p.type, 'in');
assert.equal(p.category, 'fatture');
assert.equal(p.amount, 80000);
assert.ok(p.invoice && p.invoice.bollo === true && p.invoice.rivalsa === false);

p = Parser.parse('80€ cena 05/08', env);
assert.equal(p.date.slice(5), '08-05'); // giorno giusto, niente slittamenti UTC

p = Parser.parse('senza importo qui', env);
assert.ok(p.error);

// --- Fiscozen: la pagina "Tasse" copiata cosi' com'e' ---
{
  const pagina = `Mostra
Tasse da pagare
Tasse da pagare
€ 4.099,59

Da pagare

16 settembre 2026

732,09 €

Scarica e paga l'F24 relativo a:
Imposta sostitutiva sul regime forfetario - Acconto - I Rata

Da pagare

30 novembre 2026

1.892,50 €

Scarica e paga l'F24 relativo a:

Pagata

16 maggio 2026

300,00 €

Scarica e paga l'F24 relativo a:

Tasse future
1.320-1.460 €

Prevista

30 novembre 2026

10-20 €

Imposta di bollo sulle fatture elettroniche - I/II/III trimestre

Prevista

30 giugno 2027

0 €

Saldo imposta sostitutiva (rif. 2026) - GS INPS

Prevista

30 giugno 2027

260-280 €

Primo acconto imposta sostitutiva (rif. 2027) - GS INPS`;

  const v = Parser.fiscozen(pagina);
  assert.equal(v.length, 5);                       // la "Pagata" resta fuori
  assert.deepEqual(v[0], {
    date: '2026-09-16', amount: 73209, prevista: false,
    desc: 'F24 · imposta sostitutiva', key: 'f24', // il dettaglio finisce nel nome
  });
  assert.equal(v[1].desc, 'F24');                  // senza dettaglio resta il nome nudo
  assert.equal(v[1].key, 'f24');                   // ma la chiave e' sempre la stessa
  assert.equal(v[1].amount, 189250);               // il punto separa le migliaia
  assert.equal(v[2].amount, 2000);                 // "10-20 €" -> il massimo, per prudenza
  assert.equal(v[2].desc, 'Imposta di bollo sulle fatture elettroniche - I/II/III trimestre');
  assert.equal(v[2].prevista, true);
  assert.equal(v[3].amount, 0);                    // "0 €" letto, poi scartato dall'import
  assert.equal(v[4].amount, 28000);
  // i totali di testata non hanno una data davanti e non devono entrare
  assert.ok(!v.some(x => x.amount === 409959 || x.amount === 146000));
  assert.deepEqual(Parser.fiscozen(''), []);
  assert.deepEqual(Parser.fiscozen('roba a caso senza date'), []);
}

// --- sync: merge tra dispositivi ---
(0, eval)(load('js/sync.js') + '\n;globalThis.Sync = Sync;');
const { Sync } = globalThis;

const mk = (id, updatedAt, desc) => ({ id, updatedAt, desc, amount: 100, type: 'out', date: '2026-08-01' });
const local = {
  tx: [mk('a', 10, 'A-vecchio'), mk('b', 50, 'B-locale-nuovo'), mk('l', 5, 'solo-locale')],
  gone: [{ id: 'x', updatedAt: 90 }],
  accounts: [{ id: 'acc1', name: 'Locale' }], categories: [], settings: { imposta: 0.15 },
  metaRev: { accounts: 100, categories: 0, settings: 0 },
};
const remote = {
  tx: [mk('a', 20, 'A-remoto-nuovo'), mk('b', 30, 'B-vecchio'), mk('r', 5, 'solo-remoto'), mk('x', 50, 'eliminato-in-locale')],
  gone: [],
  accounts: [{ id: 'acc1', name: 'Remoto' }], categories: [], settings: { imposta: 0.05 },
  metaRev: { accounts: 40, categories: 0, settings: 200 },
};
const m = Sync.merge(local, remote);
const byId = Object.fromEntries(m.tx.map(t => [t.id, t]));
assert.equal(byId.a.desc, 'A-remoto-nuovo');   // vince il piu' recente
assert.equal(byId.b.desc, 'B-locale-nuovo');   // vince il piu' recente
assert.ok(byId.l && byId.r);                   // gli esclusivi restano entrambi
assert.equal(byId.x, undefined);               // il tombstone piu' recente elimina
assert.equal(m.accounts[0].name, 'Locale');    // metaRev locale piu' alto
assert.equal(m.settings.imposta, 0.05);        // metaRev remoto piu' alto
assert.equal(m.metaRev.settings, 200);

// --- cestino: svuotarlo su un dispositivo non deve far riapparire i movimenti ---
{
  const base = { accounts: [], categories: [], settings: {}, metaRev: {} };
  const ora = Date.now();
  // il telefono ha svuotato il cestino (tombstone senza copia), il pc ce l'ha ancora
  const locale = { ...base, tx: [], gone: [{ id: 'x', updatedAt: ora }] };
  const remoto = { ...base, tx: [], gone: [{ id: 'x', updatedAt: ora, tx: { id: 'x', amount: 500 } }] };
  const m1 = Sync.merge(locale, remoto);
  assert.equal(m1.gone.length, 1);                 // il tombstone resta (serve alla sync)
  assert.equal(m1.gone[0].tx, undefined);          // ma la copia ripristinabile no
  const m2 = Sync.merge(remoto, locale);           // e vale in entrambi i versi
  assert.equal(m2.gone[0].tx, undefined);
  // un movimento eliminato non deve tornare in vita
  const conTx = { ...base, tx: [{ id: 'x', amount: 500, updatedAt: ora - 1000 }], gone: [] };
  assert.equal(Sync.merge(conTx, locale).tx.length, 0);
}

// --- sync: il permesso di Google deve sopravvivere alla ricarica ---
// Google, per dare il permesso, apre una sua finestra. Se il permesso vive solo in
// memoria la finestra si riapre a ogni apertura dell'app: qui si conta che non succeda.
{
  const src = load('js/sync.js');
  const store = new Map();
  let aperture = 0; // quante volte Google aprirebbe la finestra

  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const oauth2 = {
    initTokenClient: () => ({
      requestAccessToken() { aperture++; this.callback({ access_token: 'tok', expires_in: 3600 }); },
    }),
  };
  globalThis.window = { google: { accounts: { oauth2 } } };
  globalThis.google = globalThis.window.google;
  const DBvero = globalThis.DB; // i test dopo lo usano: va rimesso a posto
  globalThis.DB = {
    state: { settings: { sync: { on: true, clientId: 'cid', hint: 'gio@example.com', lastSync: 0 } } },
    getSyncKey: async () => null, getSyncSalt: async () => null, saveSettings: async () => {},
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ files: [] }) });

  // ogni istanza e' come una nuova apertura dell'app: memoria pulita, stesso localStorage
  const apriApp = () => (0, eval)('(function(){' + src + '\n; return Sync; })()');

  await apriApp().syncNow().catch(() => {}); // si ferma su NEED_PASSWORD, ma il token l'ha chiesto
  assert.equal(aperture, 1);

  await apriApp().syncNow().catch(() => {});
  assert.equal(aperture, 1, 'alla riapertura non deve richiedere il permesso a Google');

  // permesso scaduto: allora si', la finestra ci vuole
  store.set('soldi-gtoken', JSON.stringify({ t: 'tok', exp: Date.now() - 1000 }));
  await apriApp().syncNow().catch(() => {});
  assert.equal(aperture, 2, 'scaduto il permesso lo deve richiedere');

  // scollegando, il permesso non deve restare in giro nemmeno se il resto fallisce
  const rotto = apriApp();
  DB.setSyncKey = async () => { throw new Error('disco pieno'); };
  await rotto.disconnect().catch(() => {});
  assert.equal(store.get('soldi-gtoken'), undefined);

  for (const k of ['localStorage', 'window', 'google', 'fetch']) delete globalThis[k];
  globalThis.DB = DBvero;
}

// --- ricorrenze: matematica delle date ---
assert.equal(DB.nextRecurDate('2026-08-16', 'monthly'), '2026-09-16');
assert.equal(DB.nextRecurDate('2026-01-31', 'monthly'), '2026-02-28'); // clampa a fine mese
assert.equal(DB.nextRecurDate('2026-12-15', 'monthly'), '2027-01-15'); // cambio anno
assert.equal(DB.nextRecurDate('2024-02-29', 'yearly'), '2025-02-28');  // bisestile
assert.equal(DB.nextRecurDate('2026-03-31', 'monthly'), '2026-04-30');

// --- carta collegata al conto: il netto della carta conta sul conto ---
DB.state.accounts = [
  { id: 'conto', name: 'Conto', kind: 'bank', initial: 10000 },
  { id: 'carta', name: 'Carta', kind: 'card', initial: 0, linkedTo: 'conto' },
];
DB.state.tx = [
  { id: 't1', date: '2026-08-01', type: 'out', amount: 3000, account: 'carta' },
  { id: 't2', date: '2026-08-02', type: 'transfer', amount: 2000, account: 'conto', toAccount: 'carta' },
];
const b = DB.balances();
assert.equal(b.get('conto'), 7000); // 100 - 30 di carta; il giroconto interno si annulla
assert.equal(b.get('carta'), 0);    // la carta non va in negativo per conto suo

// i movimenti futuri non contano finche' non arriva il loro giorno
DB.state.tx.push({ id: 't3', date: '2099-01-01', type: 'out', amount: 99999, account: 'conto' });
assert.equal(DB.balances().get('conto'), 7000);
assert.equal(DB.sums({ y: '2099' }).out, 0);
assert.equal(DB.sums({ y: '2099', includeFuture: true }).out, 99999);

// --- ponte Batti: parsing del link e mappatura categorie ---
(0, eval)(load('js/batti.js') + '\n;globalThis.Batti = Batti;');
const { Batti } = globalThis;
assert.equal(Batti.parseGroupId('https://paradiso22.github.io/batti/#/g/123e4567-e89b-12d3-a456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
assert.equal(Batti.parseGroupId('123e4567-e89b-12d3-a456-426614174000'), '123e4567-e89b-12d3-a456-426614174000');
DB.state.categories = [
  { id: 'spesa-casa', name: 'Spesa Casa' }, { id: 'pasti', name: 'Pasti fuori o domicilio' },
  { id: 'utenze', name: 'Utenze' }, { id: 'extra', name: 'Extra' },
];
assert.equal(Batti.mapCategory('Spesa'), 'spesa-casa');
assert.equal(Batti.mapCategory('Fuori casa'), 'pasti');
assert.equal(Batti.mapCategory('Bollette'), null); // nessun match: resta da assegnare

console.log('OK - fisco, parser, sync (merge e permesso Google), ricorrenze, carta collegata e ponte Batti combaciano');
