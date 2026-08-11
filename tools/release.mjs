// release.mjs - alza la versione in TUTTI i punti in un colpo solo.
// Uso: node tools/release.mjs           (v23 -> v24)
//      node tools/release.mjs v30       (forza una versione)
//
// Perche' esiste: la versione vive in 4 posti (APP_VERSION, VERSION del service
// worker, ?v= negli URL di index.html, ASSETS del service worker). Dimenticarne
// uno = utente bloccato su una versione vecchia. Qui si sbaglia una volta sola.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = f => join(root, f);
const read = f => readFileSync(p(f), 'utf8');
const write = (f, s) => writeFileSync(p(f), s);

const cur = read('js/app.js').match(/const APP_VERSION = '(v\d+)'/)?.[1];
if (!cur) throw new Error('APP_VERSION non trovata in js/app.js');
const next = process.argv[2] || 'v' + (parseInt(cur.slice(1), 10) + 1);
const n = next.replace(/^v/, '');

write('js/app.js', read('js/app.js').replace(/const APP_VERSION = 'v\d+'/, `const APP_VERSION = '${next}'`));

// index.html: ?v= su ogni css/js locale
write('index.html', read('index.html').replace(/(href|src)="((?:css|js)\/[\w.-]+)(?:\?v=\d+)?"/g, `$1="$2?v=${n}"`));

// sw.js: nome cache + stessi URL versionati nel precache
let sw = read('sw.js')
  .replace(/const VERSION = 'soldi-v\d+'/, `const VERSION = 'soldi-${next}'`)
  .replace(/'((?:css|js)\/[\w.-]+)(?:\?v=\d+)?'/g, `'$1?v=${n}'`);
write('sw.js', sw);

// controllo: la versione deve comparire ovunque, altrimenti meglio saperlo subito
const checks = [
  ['js/app.js', new RegExp(`APP_VERSION = '${next}'`)],
  ['sw.js', new RegExp(`soldi-${next}'`)],
  ['sw.js', new RegExp(`js/app\\.js\\?v=${n}`)],
  ['index.html', new RegExp(`js/app\\.js\\?v=${n}`)],
  ['index.html', new RegExp(`css/app\\.css\\?v=${n}`)],
];
for (const [f, re] of checks) {
  if (!re.test(read(f))) throw new Error(`${f}: manca ${re}`);
}
console.log(`${cur} -> ${next} (app.js, sw.js, index.html)`);
