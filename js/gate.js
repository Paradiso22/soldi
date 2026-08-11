/* gate.js - password d'ingresso: l'app si apre solo a chi la conosce.
   Chiesta una volta per dispositivo, poi ricordata (localStorage).

   VERIFICATORE: salt + hash PBKDF2 della password. NON e' la password e non
   permette di ricavarla: serve solo a controllare quella digitata. Sta nel
   codice pubblico, quindi la password dev'essere robusta e non riusata altrove.
   Barriera d'accesso onesta: ferma i visitatori, non chi sa leggere il codice. */
'use strict';

const Gate = (() => {
  const KEY = 'soldi-gate';
  const FAILS = 'soldi-gate-fails';   // errori consecutivi
  const UNTIL = 'soldi-gate-until';   // istante in cui si potra' riprovare
  const SENT = 'soldi-gate-sent';     // ultimo avviso inviato
  const ITER = 310000;

  // avviso via email dopo ALERT_AT errori: web app Google Apps Script dell'utente.
  // Vuoto = nessun avviso. L'indirizzo email non sta qui: lo script lo manda a se stesso.
  const ALERT_URL = '';
  const ALERT_AT = 3;

  // 5 tentativi con attese crescenti, poi blocco di 24 ore.
  // Il blocco e' muto: chi tenta vede solo "troppi tentativi errati", non la durata.
  const MAX_FAILS = 5;
  const BLOCK_MS = 24 * 3600 * 1000;
  const WAITS = [5000, 20000, 60000, 300000]; // 5s, 20s, 1min, 5min
  const penalty = f => (f >= MAX_FAILS ? BLOCK_MS : WAITS[f - 1] || 0);

  const fails = () => +localStorage.getItem(FAILS) || 0;
  const waitLeft = () => Math.max(0, (+localStorage.getItem(UNTIL) || 0) - Date.now());
  const blocked = () => fails() >= MAX_FAILS && waitLeft() > 0;

  function fmtWait(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return s + ' second' + (s === 1 ? 'o' : 'i');
    const m = Math.ceil(s / 60);
    return m + ' minut' + (m === 1 ? 'o' : 'i');
  }

  // avvisa il proprietario: nessun dato personale, solo quando e da quale dispositivo
  async function alertOwner(n) {
    if (!ALERT_URL) return;
    if (Date.now() - (+localStorage.getItem(SENT) || 0) < 1800000) return; // max 1 ogni 30 min
    localStorage.setItem(SENT, String(Date.now()));
    try {
      await fetch(ALERT_URL, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        body: JSON.stringify({ fails: n, ua: navigator.userAgent, when: new Date().toISOString() }),
      });
    } catch { /* se non parte, pazienza: l'attesa progressiva regge comunque */ }
  }

  // null = nessuna protezione (l'app si apre e mostra il setup nelle impostazioni)
  const V = { salt: 'a0a65c294d3c165cb6f0cda3c411b686', hash: '48e8f6c3eaeea1696b265342039a072377c3bbbf865dba9d4a76098c188fe1e0' };

  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  const unhex = s => Uint8Array.from(s.match(/../g).map(h => parseInt(h, 16)));

  async function derive(pw, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 256));
  }

  const configured = () => !!V;
  const unlocked = () => !V || localStorage.getItem(KEY) === V.hash;

  // usato dal setup nelle impostazioni: la password resta nel dispositivo,
  // esce solo questo verificatore da incollare nel codice
  async function makeVerifier(pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { salt: hex(salt), hash: await derive(pw, salt) };
  }

  // { ok } oppure { ok:false, wait } / { ok:false, blocked }
  async function tryUnlock(pw) {
    if (!V) return { ok: true };
    if (blocked()) return { ok: false, blocked: true };
    if (waitLeft() > 0) return { ok: false, wait: waitLeft() };
    // blocco scaduto: si riparte da capo con altri 5 tentativi
    if (fails() >= MAX_FAILS) { localStorage.removeItem(FAILS); localStorage.removeItem(UNTIL); }

    const ok = (await derive(pw, unhex(V.salt))) === V.hash;
    if (ok) {
      localStorage.setItem(KEY, V.hash); // ricordato: non la richiede piu'
      localStorage.removeItem(FAILS);
      localStorage.removeItem(UNTIL);
      return { ok: true };
    }
    const n = fails() + 1;
    localStorage.setItem(FAILS, String(n));
    const p = penalty(n);
    if (p) localStorage.setItem(UNTIL, String(Date.now() + p));
    if (n >= ALERT_AT) alertOwner(n);
    return n >= MAX_FAILS ? { ok: false, blocked: true } : { ok: false, wait: p, fails: n };
  }

  function forget() { [KEY, FAILS, UNTIL].forEach(k => localStorage.removeItem(k)); }

  function screen(resolve) {
    const el = document.createElement('div');
    el.id = 'gatescreen';
    el.innerHTML = `
      <form class="gate-inner" id="gate-form">
        <span class="brand-euro" style="width:56px;height:56px;border-radius:18px;font-size:1.8rem">€</span>
        <h2>Soldi</h2>
        <p>Inserisci la password per entrare.</p>
        <input type="password" id="gate-pw" autocomplete="current-password" placeholder="Password" aria-label="Password d'ingresso">
        <button class="btn primary" type="submit" id="gate-ok" style="width:100%;justify-content:center;padding:14px">Entra</button>
        <span class="gate-err" id="gate-err" hidden>Password sbagliata</span>
      </form>`;
    document.body.appendChild(el);
    const input = el.querySelector('#gate-pw');
    const err = el.querySelector('#gate-err');
    const btn = el.querySelector('#gate-ok');

    let timer = null;

    // blocco: niente durata, niente conto alla rovescia. Chi tenta non deve
    // sapere quanto dura ne' se sta aspettando qualcosa di preciso.
    function showBlocked() {
      clearInterval(timer);
      input.disabled = true;
      input.value = '';
      input.placeholder = '';
      btn.disabled = true;
      btn.textContent = 'Troppi tentativi errati';
      err.textContent = 'Troppi tentativi errati';
      err.hidden = false;
    }

    // attese brevi: il conto alla rovescia resta, serve a chi ha solo sbagliato a digitare
    function countdown() {
      clearInterval(timer);
      const tick = () => {
        if (blocked()) { showBlocked(); return; }
        const left = waitLeft();
        if (left > 0) {
          btn.disabled = true;
          btn.textContent = 'Riprova tra ' + fmtWait(left);
        } else {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = 'Entra';
          input.focus();
        }
      };
      tick();
      timer = setInterval(tick, 1000);
    }

    if (blocked()) showBlocked();
    else if (waitLeft() > 0) { err.textContent = 'Troppi tentativi errati'; err.hidden = false; countdown(); }

    el.querySelector('#gate-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = 'Controllo…';
      const r = await tryUnlock(input.value);
      if (r.ok) { clearInterval(timer); el.remove(); resolve(true); return; }
      input.value = '';
      if (r.blocked) { showBlocked(); return; }
      err.textContent = r.wait ? 'Password sbagliata: aspetta ' + fmtWait(r.wait) : 'Password sbagliata';
      err.hidden = false;
      if (r.wait) countdown();
      else { btn.disabled = false; btn.textContent = 'Entra'; input.focus(); }
    });
    setTimeout(() => { if (!btn.disabled) input.focus(); }, 80);
  }

  // risolve solo quando si entra: senza password l'app non parte
  function boot() {
    if (unlocked()) return Promise.resolve(true);
    return new Promise(resolve => screen(resolve));
  }

  return { boot, configured, unlocked, makeVerifier, tryUnlock, forget };
})();
