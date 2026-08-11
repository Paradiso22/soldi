/* gate.js - password d'ingresso: l'app si apre solo a chi la conosce.
   Chiesta una volta per dispositivo, poi ricordata (localStorage).

   VERIFICATORE: salt + hash PBKDF2 della password. NON e' la password e non
   permette di ricavarla: serve solo a controllare quella digitata. Sta nel
   codice pubblico, quindi la password dev'essere robusta e non riusata altrove.
   Barriera d'accesso onesta: ferma i visitatori, non chi sa leggere il codice. */
'use strict';

const Gate = (() => {
  const KEY = 'soldi-gate';
  const ITER = 310000;

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

  async function tryUnlock(pw) {
    if (!V) return true;
    const ok = (await derive(pw, unhex(V.salt))) === V.hash;
    if (ok) localStorage.setItem(KEY, V.hash); // ricordato: non la richiede piu'
    return ok;
  }

  function forget() { localStorage.removeItem(KEY); }

  function screen(resolve) {
    const el = document.createElement('div');
    el.id = 'gatescreen';
    el.innerHTML = `
      <form class="gate-inner" id="gate-form">
        <span class="brand-euro" style="width:56px;height:56px;border-radius:18px;font-size:1.8rem">€</span>
        <h2>Soldi</h2>
        <p>Inserisci la password per entrare.<br>Te la chiedo solo la prima volta su questo dispositivo.</p>
        <input type="password" id="gate-pw" autocomplete="current-password" placeholder="Password" aria-label="Password d'ingresso">
        <button class="btn primary" type="submit" id="gate-ok" style="width:100%;justify-content:center;padding:14px">Entra</button>
        <span class="gate-err" id="gate-err" hidden>Password sbagliata</span>
      </form>`;
    document.body.appendChild(el);
    const input = el.querySelector('#gate-pw');
    const err = el.querySelector('#gate-err');
    el.querySelector('#gate-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = el.querySelector('#gate-ok');
      btn.disabled = true; btn.textContent = 'Controllo…';
      const ok = await tryUnlock(input.value);
      if (ok) { el.remove(); resolve(true); return; }
      btn.disabled = false; btn.textContent = 'Entra';
      err.hidden = false;
      input.value = ''; input.focus();
    });
    setTimeout(() => input.focus(), 80);
  }

  // risolve solo quando si entra: senza password l'app non parte
  function boot() {
    if (unlocked()) return Promise.resolve(true);
    return new Promise(resolve => screen(resolve));
  }

  return { boot, configured, unlocked, makeVerifier, tryUnlock, forget };
})();
