/* sync.js - sincronizzazione via Google Drive (appDataFolder), cifrata lato client.
   Su Drive viaggia SOLO un file AES-GCM: senza la password di sync e' illeggibile. */
'use strict';

const Sync = (() => {
  const MAGIC = 'SOLDIS1';
  const ITER = 310000;
  const FILE_NAME = 'soldi-sync.enc';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const te = new TextEncoder(), td = new TextDecoder();

  let tokenClient = null;
  let token = null, tokenExp = 0;
  let tokenPromise = null; // una sola richiesta token alla volta
  let timer = null;
  let syncing = false;
  let connecting = false;
  let applyingRemote = false;
  const listeners = new Set();

  const cfg = () => DB.state.settings.sync || null;
  const enabled = () => !!(cfg() && cfg().on);

  function notify() { listeners.forEach(fn => { try { fn(); } catch {} }); }

  /* ---------- Google Identity Services ---------- */
  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google?.accounts?.oauth2) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Impossibile caricare Google Sign-In (sei offline?).'));
      document.head.appendChild(s);
    });
  }

  /* Il permesso di Google dura un'ora, ma stava solo in memoria: a ogni ricarica
     ne serviva uno nuovo, e Google per darlo apre una sua finestra (non si puo'
     nascondere, la apre il browser). Tenendolo da parte la finestra compare al
     massimo una volta all'ora invece che a ogni apertura.
     Vale la pena: il permesso e' limitato alla cartella privata di questa app su
     Drive, dove c'e' solo il file cifrato - chi lo rubasse scaricherebbe roba che
     non sa leggere, perche' la password di sync non e' salvata da nessuna parte. */
  const TOK_KEY = 'soldi-gtoken';

  function ricordaToken() {
    try { localStorage.setItem(TOK_KEY, JSON.stringify({ t: token, exp: tokenExp })); } catch { /* spazio pieno: pazienza */ }
  }
  function scordaToken() {
    token = null; tokenExp = 0;
    try { localStorage.removeItem(TOK_KEY); } catch { /* niente da fare */ }
  }
  function riprendiToken() {
    try {
      const j = JSON.parse(localStorage.getItem(TOK_KEY) || 'null');
      if (j?.t && j.exp > Date.now() + 60000) { token = j.t; tokenExp = j.exp; }
    } catch { /* illeggibile: se ne chiede uno nuovo */ }
  }

  const tokenBuono = () => token && Date.now() < tokenExp - 60000;

  async function getToken(interactive) {
    if (!tokenBuono()) riprendiToken(); // magari e' avanzato dall'apertura precedente
    if (tokenBuono()) return token;
    if (tokenPromise) return tokenPromise; // non sovrapporre due richieste (ruberebbero il callback)
    await loadGis();
    const clientId = cfg()?.clientId;
    if (!clientId) throw new Error('Manca il Client ID Google.');
    // hint = account gia' scelto: evita il selettore account a ogni apertura
    const hint = cfg()?.hint || '';
    const key = clientId + '|' + hint;
    if (!tokenClient || tokenClient._key !== key) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE, callback: () => {},
        ...(hint ? { hint } : {}),
      });
      tokenClient._key = key;
    }
    tokenPromise = new Promise((res, rej) => {
      // senza gesto dell'utente il popup puo' essere bloccato in silenzio: non restare appesi
      const guard = interactive ? null : setTimeout(() => rej(new Error('SILENT_FAIL')), 8000);
      tokenClient.callback = (r) => {
        if (guard) clearTimeout(guard);
        if (r.error) return rej(new Error(interactive
          ? 'Accesso Google annullato o negato (' + r.error + ').'
          : 'SILENT_FAIL'));
        token = r.access_token;
        tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
        ricordaToken();
        res(token);
      };
      try {
        tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      } catch (e) { if (guard) clearTimeout(guard); rej(e); }
    });
    try {
      return await tokenPromise;
    } finally {
      tokenPromise = null;
    }
  }

  /* ---------- Drive API ---------- */
  async function api(path, opts = {}) {
    const t = await getToken(opts.interactive);
    const res = await fetch('https://www.googleapis.com' + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) },
    });
    if (res.status === 401) { scordaToken(); throw new Error('AUTH_EXPIRED'); }
    if (!res.ok) throw new Error('Errore Drive (' + res.status + ').');
    return res;
  }

  async function driveFind(interactive) {
    const res = await api(`/drive/v3/files?spaces=appDataFolder&q=name%3D%27${FILE_NAME}%27&fields=files(id,modifiedTime)`, { interactive });
    const j = await res.json();
    return j.files?.[0] || null;
  }

  async function driveDownload(id) {
    const res = await api(`/drive/v3/files/${id}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function driveUpload(id, bytes) {
    if (id) {
      await api(`/upload/drive/v3/files/${id}?uploadType=media`, {
        method: 'PATCH', body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      return id;
    }
    const boundary = 'soldi' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${boundary}--`,
    ]);
    const res = await api('/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', body,
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    });
    return (await res.json()).id;
  }

  /* ---------- crypto (chiave derivata dalla password di sync, salvata non-estraibile) ---------- */
  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encrypt(key, salt, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
    const out = new Uint8Array(7 + 16 + 12 + cipher.length);
    out.set(te.encode(MAGIC), 0); out.set(salt, 7); out.set(iv, 23); out.set(cipher, 35);
    return out;
  }

  async function decrypt(key, bytes) {
    if (td.decode(bytes.slice(0, 7)) !== MAGIC) throw new Error('File di sync non riconosciuto.');
    const iv = bytes.slice(23, 35), cipher = bytes.slice(35);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      return JSON.parse(td.decode(plain));
    } catch { throw new Error('WRONG_KEY'); }
  }

  const saltOf = bytes => bytes.slice(7, 23);

  /* ---------- payload e merge ---------- */
  function payload() {
    const s = DB.state;
    const settings = { ...s.settings };
    delete settings.geminiKey; // le chiavi restano sul dispositivo
    delete settings.sync;
    return {
      v: 1, at: Date.now(),
      tx: s.tx, gone: s.gone,
      accounts: s.accounts, categories: s.categories, settings,
      metaRev: s.metaRev,
    };
  }

  // fonde locale e remoto: per ogni movimento vince updatedAt piu' alto;
  // le eliminazioni (tombstone) vincono se piu' recenti dell'ultima modifica.
  function merge(loc, rem) {
    const ts = t => t.updatedAt || t.createdAt || 0;
    const byId = new Map();
    for (const t of rem.tx || []) byId.set(t.id, t);
    for (const t of loc.tx || []) {
      const r = byId.get(t.id);
      if (!r || ts(t) >= ts(r)) byId.set(t.id, t);
    }
    const gone = new Map();
    for (const g of [...(rem.gone || []), ...(loc.gone || [])]) {
      const prev = gone.get(g.id);
      if (!prev) { gone.set(g.id, { ...g }); continue; }
      const keep = { ...(g.updatedAt > prev.updatedAt ? g : prev) };
      // svuotare il cestino e' monotono: se una parte l'ha svuotato resta svuotato,
      // altrimenti i movimenti eliminati riapparivano al giro di sync successivo
      if (!g.tx || !prev.tx) delete keep.tx;
      gone.set(g.id, keep);
    }
    for (const [id, g] of gone) {
      const t = byId.get(id);
      if (t && g.updatedAt >= ts(t)) byId.delete(id);
    }
    // tieni solo i tombstone recenti (30 giorni: la finestra del cestino)
    const cutoff = Date.now() - 30 * 864e5;
    const goneOut = [...gone.values()].filter(g => g.updatedAt > cutoff);

    const revL = loc.metaRev || {}, revR = rem.metaRev || {};
    const pick = k => (revL[k] || 0) >= (revR[k] || 0) ? loc : rem;
    return {
      v: 1, at: Date.now(),
      tx: [...byId.values()],
      gone: goneOut,
      accounts: pick('accounts').accounts,
      categories: pick('categories').categories,
      settings: pick('settings').settings,
      metaRev: {
        accounts: Math.max(revL.accounts || 0, revR.accounts || 0),
        categories: Math.max(revL.categories || 0, revR.categories || 0),
        settings: Math.max(revL.settings || 0, revR.settings || 0),
      },
    };
  }

  /* ---------- sync ---------- */
  // manual = l'hai chiesto tu (tirando giu' o dal bottone): solo allora si mostra
  // la rotella. Le sincronizzazioni automatiche restano invisibili, se no lampeggia
  // ogni 15 secondi mentre giri per l'app.
  const state = { status: enabled() ? 'idle' : 'off', lastError: null, manual: false };

  async function applyMerged(m) {
    applyingRemote = true;
    try {
      const local = DB.state;
      const keepSync = local.settings.sync, keepGemini = local.settings.geminiKey;
      local.accounts = m.accounts;
      local.categories = m.categories;
      local.settings = Object.assign({}, DB.DEFAULT_SETTINGS, m.settings, { sync: keepSync, geminiKey: keepGemini });
      local.metaRev = m.metaRev;
      local.gone = m.gone;
      await Promise.all([DB.saveAccounts(), DB.saveCategories(), DB.saveSettings(), DB.saveGone(), DB.markSeeded()]);
      await DB.replaceAllTx(m.tx);
    } finally { applyingRemote = false; }
  }

  /* Se tiri giu' mentre una sincronizzazione automatica e' gia' partita, non si fa
     finta di niente: si mostra la rotella per quella e si aspetta che finisca, se no
     il "Aggiornato" comparirebbe prima che sia successo qualcosa. */
  let corrente = null;

  async function syncNow(opts = {}) {
    if (!enabled()) return;
    if (syncing) {
      if (opts.manual) { state.manual = true; notify(); }
      return corrente;
    }
    corrente = eseguiSync(opts);
    try { return await corrente; } finally { corrente = null; }
  }

  async function eseguiSync({ interactive = false, password = null, manual = false } = {}) {
    syncing = true;
    state.manual = manual;
    state.status = 'sync'; state.lastError = null; notify();
    try {
      const remote = await driveFind(interactive);
      let key = await DB.getSyncKey();
      let salt = await DB.getSyncSalt();

      if (remote) {
        const bytes = await driveDownload(remote.id);
        if (password) { // primo collegamento su questo dispositivo
          salt = saltOf(bytes);
          key = await deriveKey(password, salt);
          await DB.setSyncKey(key, salt);
        }
        if (!key) throw new Error('NEED_PASSWORD');
        const rem = await decrypt(key, bytes);
        const m = merge(payload(), rem);
        await applyMerged(m);
        await driveUpload(remote.id, await encrypt(key, salt, m));
        cfg().fileId = remote.id;
      } else {
        if (password) {
          salt = crypto.getRandomValues(new Uint8Array(16));
          key = await deriveKey(password, salt);
          await DB.setSyncKey(key, salt);
        }
        if (!key) throw new Error('NEED_PASSWORD');
        cfg().fileId = await driveUpload(null, await encrypt(key, salt, payload()));
      }
      cfg().lastSync = Date.now();
      // memorizza l'account usato: le prossime richieste token saranno davvero silenziose
      if (!cfg().hint) {
        try {
          const about = await (await api('/drive/v3/about?fields=user(emailAddress)')).json();
          if (about.user?.emailAddress) cfg().hint = about.user.emailAddress;
        } catch { /* non essenziale */ }
      }
      await DB.saveSettings();
      state.status = 'ok';
    } catch (e) {
      state.status = 'error';
      state.lastError = e.message;
      if (e.message === 'SILENT_FAIL' || e.message === 'AUTH_EXPIRED') state.status = 'reconnect';
      if (!interactive && state.status === 'error' && e.message !== 'WRONG_KEY' && e.message !== 'NEED_PASSWORD') {
        // errori di rete in background: silenzio, riprova alla prossima
        state.status = 'retry';
      }
      throw e;
    } finally {
      syncing = false; state.manual = false; notify();
    }
  }

  // chiamata dopo ogni modifica ai dati: sync quasi subito (1,2s di quiete)
  function schedule() {
    if (!enabled() || applyingRemote || connecting) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (!connecting) syncNow().catch(() => {}); }, 1200);
  }

  async function connect(clientId, password) {
    connecting = true;
    clearTimeout(timer);
    DB.state.settings.sync = { on: true, clientId: clientId.trim(), lastSync: 0 };
    await DB.saveSettings();
    try {
      await getToken(true);
      await syncNow({ interactive: true, password });
      if (!cfg().lastSync) throw new Error('La sincronizzazione non è partita, riprova.');
    } catch (e) {
      DB.state.settings.sync.on = false;
      await DB.saveSettings();
      throw e;
    } finally {
      connecting = false;
    }
  }

  async function disconnect() {
    scordaToken(); // prima di tutto: se qualcosa sotto fallisce, il permesso e' comunque via
    if (cfg()) { DB.state.settings.sync = { ...cfg(), on: false }; }
    await DB.saveSettings();
    await DB.setSyncKey(null, null);
    state.status = 'off'; notify();
  }

  function boot() {
    if (!enabled()) return;
    state.status = 'idle';
    syncNow().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && enabled()) syncNow().catch(() => {});
    });
    // controllo periodico mentre l'app e' in primo piano: senza, un dispositivo
    // gia' aperto non vedeva le modifiche fatte altrove finche' non lo si riapriva
    setInterval(() => {
      if (document.visibilityState === 'visible' && enabled() && !syncing) syncNow().catch(() => {});
    }, 15000);
  }

  return { schedule, syncNow, connect, disconnect, boot, merge, state, enabled, onChange: fn => listeners.add(fn) };
})();
