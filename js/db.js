/* db.js - IndexedDB, modello dati, calcoli */
'use strict';

const DB = (() => {
  const DB_NAME = 'soldi-db', DB_VER = 1;
  let db = null;

  // stato in memoria (piccolo: ~1-5k movimenti, tutto in RAM va benissimo)
  const state = {
    tx: [],            // movimenti
    gone: [],          // tombstone eliminazioni: {id, updatedAt} (per la sync)
    accounts: [],
    categories: [],
    settings: {},
    metaRev: {},       // ultima modifica di accounts/categories/settings (per la sync)
    seeded: false,
  };

  const DEFAULT_ACCOUNTS = [
    { id: 'contanti',    name: 'Contanti',                  icon: '💶', kind: 'cash', initial: 0, archived: false },
    { id: 'unicredit',   name: 'Conto Principale Unicredit', icon: '🏦', kind: 'bank', initial: 0, archived: false },
    { id: 'cointestato', name: 'Conto Cointestato Unicredit', icon: '🏦', kind: 'bank', initial: 0, archived: false },
    { id: 'carta',       name: 'Carta di credito',          icon: '💳', kind: 'card', initial: 0, archived: false },
  ];
  const DEFAULT_CATEGORIES = [
    { id: 'abbonamenti',  name: 'Abbonamenti',                icon: '📅', archived: false },
    { id: 'affitto',      name: 'Affitto',                    icon: '🏠', archived: false },
    { id: 'carburante',   name: 'Carburante',                 icon: '⛽', archived: false },
    { id: 'collaboratori',name: 'Collaboratori esterni',      icon: '🤝', archived: false },
    { id: 'extra',        name: 'Extra',                      icon: '💵', archived: false },
    { id: 'fatture',      name: 'Fatture',                    icon: '💰', archived: false },
    { id: 'pasti',        name: 'Pasti fuori o domicilio',    icon: '🍽️', archived: false },
    { id: 'regali',       name: 'Regali',                     icon: '🎁', archived: false },
    { id: 'sanita',       name: 'Sanità',                     icon: '🏥', archived: false },
    { id: 'shopping',     name: 'Shopping',                   icon: '🛍️', archived: false },
    { id: 'spesa-casa',   name: 'Spesa Casa',                 icon: '🛒', archived: false },
    { id: 'tasse',        name: 'Tasse e Contributi',         icon: '💸', archived: false },
    { id: 'viaggi',       name: 'Viaggi',                     icon: '🌍', archived: false },
    { id: 'utenze',       name: 'Utenze',                     icon: '💡', archived: false },
  ];
  const DEFAULT_SETTINGS = {
    imposta: 0.15,   // imposta sostitutiva
    inps: 0.24,      // gestione separata (verifica col commercialista: 2026 ~26,07%)
    coeff: 0.78,     // coefficiente di redditività
    rivalsa: 0.04,   // rivalsa 4% (opzionale per fattura)
    bollo: 200,      // marca da bollo in centesimi
    geminiKey: '',
  };

  function open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('tx')) d.createObjectStore('tx', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  function tstore(name, mode) { return db.transaction(name, mode).objectStore(name); }
  function idbReq(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  async function init() {
    db = await open();
    const [tx, accounts, categories, settings, seeded, gone, metaRev] = await Promise.all([
      idbReq(tstore('tx', 'readonly').getAll()),
      idbReq(tstore('meta', 'readonly').get('accounts')),
      idbReq(tstore('meta', 'readonly').get('categories')),
      idbReq(tstore('meta', 'readonly').get('settings')),
      idbReq(tstore('meta', 'readonly').get('seeded')),
      idbReq(tstore('meta', 'readonly').get('gone')),
      idbReq(tstore('meta', 'readonly').get('metaRev')),
    ]);
    state.tx = tx || [];
    state.accounts = accounts || structuredClone(DEFAULT_ACCOUNTS);
    state.categories = categories || structuredClone(DEFAULT_CATEGORIES);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    state.seeded = !!seeded;
    state.gone = (gone || []).filter(g => g.updatedAt > Date.now() - 90 * 864e5);
    state.metaRev = metaRev || {};
    sortTx();
  }

  function sortTx() {
    state.tx.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function saveMeta(key, val) { await idbReq(tstore('meta', 'readwrite').put(val, key)); }

  async function putTx(t) {
    if (!t.id) t.id = 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (!t.createdAt) t.createdAt = Date.now();
    t.updatedAt = Date.now();
    await idbReq(tstore('tx', 'readwrite').put(t));
    const i = state.tx.findIndex(x => x.id === t.id);
    if (i >= 0) state.tx[i] = t; else state.tx.push(t);
    sortTx();
    ping();
    return t;
  }

  async function putTxBulk(list) {
    await new Promise((res, rej) => {
      const trn = db.transaction('tx', 'readwrite');
      const st = trn.objectStore('tx');
      list.forEach(t => st.put(t));
      trn.oncomplete = res; trn.onerror = () => rej(trn.error);
    });
    const byId = new Map(state.tx.map(t => [t.id, t]));
    list.forEach(t => byId.set(t.id, t));
    state.tx = [...byId.values()];
    sortTx();
    ping();
  }

  async function deleteTx(id) {
    await idbReq(tstore('tx', 'readwrite').delete(id));
    state.tx = state.tx.filter(t => t.id !== id);
    state.gone.push({ id, updatedAt: Date.now() });
    await saveMeta('gone', state.gone);
    ping();
  }

  // avvisa la sync (se attiva) che i dati sono cambiati
  function ping() { if (typeof Sync !== 'undefined') Sync.schedule(); }

  async function bumpRev(k) { state.metaRev[k] = Date.now(); await saveMeta('metaRev', state.metaRev); }
  async function saveAccounts() { await saveMeta('accounts', state.accounts); await bumpRev('accounts'); ping(); }
  async function saveCategories() { await saveMeta('categories', state.categories); await bumpRev('categories'); ping(); }
  async function saveSettings() { await saveMeta('settings', state.settings); await bumpRev('settings'); ping(); }
  async function saveGone() { await saveMeta('gone', state.gone); }
  async function markSeeded() { state.seeded = true; await saveMeta('seeded', true); }

  // sostituisce tutti i movimenti (usato dalla sync dopo il merge)
  async function replaceAllTx(list) {
    await new Promise((res, rej) => {
      const trn = db.transaction('tx', 'readwrite');
      const st = trn.objectStore('tx');
      st.clear();
      list.forEach(t => st.put(t));
      trn.oncomplete = res; trn.onerror = () => rej(trn.error);
    });
    state.tx = [...list];
    sortTx();
  }

  /* ---------- ricorrenze ---------- */
  const isoOf = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

  // stesso giorno del mese/anno successivo (31 gennaio -> 28 febbraio)
  function nextRecurDate(dateISO, recur) {
    let [y, m, d] = dateISO.split('-').map(Number);
    if (recur === 'yearly') y += 1; else { m += 1; if (m > 12) { m = 1; y += 1; } }
    const last = new Date(y, m, 0).getDate();
    return isoOf(y, m, Math.min(d, last));
  }

  const eqKey = t => [String(t.desc || '').trim().toUpperCase(), t.amount, t.type, t.account || ''].join('|');

  // crea le occorrenze dovute fino a fine mese corrente. Il flag "recur" vive
  // sull'ultima occorrenza della catena: eliminarla (o togliere il flag) ferma
  // le successive; eliminare quelle vecchie non cambia nulla.
  async function materializeRecurring() {
    const now = new Date();
    const eom = isoOf(now.getFullYear(), now.getMonth() + 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    const goneIds = new Set(state.gone.map(g => g.id));
    const changed = new Map();
    let created = 0;
    for (const start of state.tx.filter(t => t.recur)) {
      let cur = changed.get(start.id) || start;
      let guard = 0;
      while (cur.recur && guard++ < 60) {
        const nd = nextRecurDate(cur.date, cur.recur);
        if (nd > eom) break;
        const root = cur.recurRoot || cur.id;
        const nid = root + '-r' + nd;
        if (goneIds.has(nid)) { // l'utente l'aveva eliminata: la catena si ferma
          const stop = { ...cur }; delete stop.recur; stop.updatedAt = Date.now();
          changed.set(stop.id, stop);
          break;
        }
        let succ = changed.get(nid) || state.tx.find(t => t.id === nid)
          || state.tx.find(t => t.id !== cur.id && t.date.slice(0, 7) === nd.slice(0, 7) && eqKey(t) === eqKey(cur));
        if (succ) {
          succ = { ...(changed.get(succ.id) || succ) };
          if (!succ.recur) { succ.recur = cur.recur; succ.recurRoot = root; succ.updatedAt = Date.now(); changed.set(succ.id, succ); }
        } else {
          succ = { ...cur, id: nid, date: nd, recurRoot: root, createdAt: Date.now(), updatedAt: Date.now() };
          delete succ.dayUnknown;
          changed.set(nid, succ);
          created++;
        }
        const prev = { ...(changed.get(cur.id) || cur) };
        delete prev.recur; prev.updatedAt = Date.now();
        changed.set(prev.id, prev);
        cur = succ;
      }
    }
    if (changed.size) await putTxBulk([...changed.values()]);
    return created;
  }

  // una tantum: le voci del foglio con nota "Ricorrente mensile/annuale" ancora
  // attive (recenti) diventano ricorrenti automatiche
  async function migrateRecurringNotes() {
    if (state.tx.length === 0) return 0;
    if (await idbReq(tstore('meta', 'readonly').get('migr-recur'))) return 0;
    const now = Date.now();
    const changed = [];
    for (const t of state.tx) {
      if (t.recur || !t.note) continue;
      const age = now - new Date(t.date).getTime();
      if (/ricorrente\s+mensile/i.test(t.note) && age < 40 * 864e5) changed.push({ ...t, recur: 'monthly', updatedAt: now });
      else if (/ricorrente\s+annuale/i.test(t.note) && age < 400 * 864e5) changed.push({ ...t, recur: 'yearly', updatedAt: now });
    }
    if (changed.length) await putTxBulk(changed);
    await saveMeta('migr-recur', true);
    return changed.length;
  }

  /* ---------- chiave di sync (CryptoKey non estraibile, salvata in locale) ---------- */
  async function getSyncKey() { return (await idbReq(tstore('meta', 'readonly').get('synckey'))) || null; }
  async function getSyncSalt() {
    const s = await idbReq(tstore('meta', 'readonly').get('syncsalt'));
    return s ? new Uint8Array(s) : null;
  }
  async function setSyncKey(key, salt) {
    if (key) {
      await saveMeta('synckey', key);
      await saveMeta('syncsalt', Array.from(salt));
    } else {
      await idbReq(tstore('meta', 'readwrite').delete('synckey'));
      await idbReq(tstore('meta', 'readwrite').delete('syncsalt'));
    }
  }

  async function wipeAll() {
    await new Promise((res, rej) => {
      const trn = db.transaction(['tx', 'meta'], 'readwrite');
      trn.objectStore('tx').clear();
      trn.objectStore('meta').clear();
      trn.oncomplete = res; trn.onerror = () => rej(trn.error);
    });
    state.tx = [];
    state.gone = [];
    state.metaRev = {};
    state.accounts = structuredClone(DEFAULT_ACCOUNTS);
    state.categories = structuredClone(DEFAULT_CATEGORIES);
    state.settings = structuredClone(DEFAULT_SETTINGS);
    state.seeded = false;
  }

  /* ---------- letture ---------- */
  const acc = id => state.accounts.find(a => a.id === id) || null;
  const cat = id => state.categories.find(c => c.id === id) || null;

  function balances() {
    const b = new Map(state.accounts.map(a => [a.id, a.initial || 0]));
    for (const t of state.tx) {
      if (t.type === 'in') { if (b.has(t.account)) b.set(t.account, b.get(t.account) + t.amount); }
      else if (t.type === 'out') { if (b.has(t.account)) b.set(t.account, b.get(t.account) - t.amount); }
      else if (t.type === 'transfer') {
        if (b.has(t.account)) b.set(t.account, b.get(t.account) - t.amount);
        if (b.has(t.toAccount)) b.set(t.toAccount, b.get(t.toAccount) + t.amount);
      }
    }
    return b;
  }

  // somme entrate/uscite per un filtro { ym: 'YYYY-MM' | y: 'YYYY', account, category }
  function sums(f = {}) {
    let inc = 0, out = 0;
    for (const t of state.tx) {
      if (f.ym && !t.date.startsWith(f.ym)) continue;
      if (f.y && !t.date.startsWith(f.y)) continue;
      if (f.account && t.account !== f.account && t.toAccount !== f.account) continue;
      if (f.category && t.category !== f.category) continue;
      if (t.type === 'in') inc += t.amount;
      else if (t.type === 'out') out += t.amount;
    }
    return { in: inc, out };
  }

  /* ---------- fisco (regime forfettario) ---------- */
  // replica la matematica del foglio: rivalsa = 4% del lordo,
  // imponibile = (lordo - bollo) × coefficiente, netto = lordo - (imposta + inps)
  function invoiceCalc(t, s = state.settings) {
    const lordo = t.amount;
    const inv = t.invoice || {};
    const bollo = inv.bollo ? s.bollo : 0;
    const base = lordo - bollo;
    const rivalsaAmt = inv.rivalsa ? Math.round(lordo * s.rivalsa) : 0;
    const onorario = base - rivalsaAmt;
    const imponibile = Math.round(base * s.coeff);
    const imposta = Math.round(imponibile * s.imposta);
    const inps = Math.round(imponibile * s.inps);
    const daParte = imposta + inps;
    return { lordo, bollo, rivalsaAmt, onorario, imponibile, imposta, inps, daParte, netto: lordo - daParte };
  }

  function invoicesOfYear(y) {
    return state.tx.filter(t => t.type === 'in' && t.invoice && t.date.startsWith(String(y)))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    state, init, putTx, putTxBulk, deleteTx, replaceAllTx,
    saveAccounts, saveCategories, saveSettings, saveGone, markSeeded, wipeAll,
    getSyncKey, getSyncSalt, setSyncKey,
    nextRecurDate, materializeRecurring, migrateRecurringNotes,
    acc, cat, balances, sums, invoiceCalc, invoicesOfYear,
    DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS,
  };
})();
