/* db.js — IndexedDB, modello dati, calcoli */
'use strict';

const DB = (() => {
  const DB_NAME = 'soldi-db', DB_VER = 1;
  let db = null;

  // stato in memoria (piccolo: ~1-5k movimenti, tutto in RAM va benissimo)
  const state = {
    tx: [],            // movimenti
    accounts: [],
    categories: [],
    settings: {},
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
    const [tx, accounts, categories, settings, seeded] = await Promise.all([
      idbReq(tstore('tx', 'readonly').getAll()),
      idbReq(tstore('meta', 'readonly').get('accounts')),
      idbReq(tstore('meta', 'readonly').get('categories')),
      idbReq(tstore('meta', 'readonly').get('settings')),
      idbReq(tstore('meta', 'readonly').get('seeded')),
    ]);
    state.tx = tx || [];
    state.accounts = accounts || structuredClone(DEFAULT_ACCOUNTS);
    state.categories = categories || structuredClone(DEFAULT_CATEGORIES);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    state.seeded = !!seeded;
    sortTx();
  }

  function sortTx() {
    state.tx.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function saveMeta(key, val) { await idbReq(tstore('meta', 'readwrite').put(val, key)); }

  async function putTx(t) {
    if (!t.id) t.id = 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (!t.createdAt) t.createdAt = Date.now();
    await idbReq(tstore('tx', 'readwrite').put(t));
    const i = state.tx.findIndex(x => x.id === t.id);
    if (i >= 0) state.tx[i] = t; else state.tx.push(t);
    sortTx();
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
  }

  async function deleteTx(id) {
    await idbReq(tstore('tx', 'readwrite').delete(id));
    state.tx = state.tx.filter(t => t.id !== id);
  }

  async function saveAccounts() { await saveMeta('accounts', state.accounts); }
  async function saveCategories() { await saveMeta('categories', state.categories); }
  async function saveSettings() { await saveMeta('settings', state.settings); }
  async function markSeeded() { state.seeded = true; await saveMeta('seeded', true); }

  async function wipeAll() {
    await new Promise((res, rej) => {
      const trn = db.transaction(['tx', 'meta'], 'readwrite');
      trn.objectStore('tx').clear();
      trn.objectStore('meta').clear();
      trn.oncomplete = res; trn.onerror = () => rej(trn.error);
    });
    state.tx = [];
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
  // imponibile = (lordo − bollo) × coefficiente, netto = lordo − (imposta + inps)
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
    state, init, putTx, putTxBulk, deleteTx,
    saveAccounts, saveCategories, saveSettings, markSeeded, wipeAll,
    acc, cat, balances, sums, invoiceCalc, invoicesOfYear,
    DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_SETTINGS,
  };
})();
