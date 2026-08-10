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

console.log('OK - fisco e parser combaciano col foglio');
