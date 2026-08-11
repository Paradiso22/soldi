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

// --- ricorrenze: matematica delle date ---
assert.equal(DB.nextRecurDate('2026-08-16', 'monthly'), '2026-09-16');
assert.equal(DB.nextRecurDate('2026-01-31', 'monthly'), '2026-02-28'); // clampa a fine mese
assert.equal(DB.nextRecurDate('2026-12-15', 'monthly'), '2027-01-15'); // cambio anno
assert.equal(DB.nextRecurDate('2024-02-29', 'yearly'), '2025-02-28');  // bisestile
assert.equal(DB.nextRecurDate('2026-03-31', 'monthly'), '2026-04-30');

console.log('OK - fisco, parser, merge di sync e ricorrenze combaciano');
