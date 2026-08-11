/* lock.js - blocco app con impronta (WebAuthn, autenticatore di sistema).
   Sul telefono: pannello impronta con ripiego automatico su PIN/sequenza.
   Impostazione per-dispositivo (localStorage), niente server. */
'use strict';

const AppLock = (() => {
  const KEY = 'soldi-lock';
  const RELOCK_MS = 60000; // in background per piu' di un minuto -> si riblocca

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const enabled = () => !!read()?.on;
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  let supported = false;
  let overlay = null;
  let hiddenAt = 0;

  async function detect() {
    try {
      supported = !!window.PublicKeyCredential
        && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { supported = false; }
    return supported;
  }

  async function enable() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Soldi', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'soldi', displayName: 'Soldi' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    });
    localStorage.setItem(KEY, JSON.stringify({ on: true, credId: b64(cred.rawId) }));
  }

  function disable() { localStorage.removeItem(KEY); }

  // se non lancia, il sistema ha verificato l'utente (impronta o codice di sblocco)
  async function verify() {
    const c = read();
    if (!c) return;
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(c.credId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
  }

  function show() {
    if (overlay || !enabled()) return;
    overlay = document.createElement('div');
    overlay.id = 'lockscreen';
    overlay.innerHTML = `
      <div class="lock-inner">
        <span class="brand-euro" style="width:56px;height:56px;border-radius:18px;font-size:1.8rem">€</span>
        <h2>Soldi</h2>
        <p>Sblocca con l'impronta o il codice del telefono</p>
        <button class="btn primary" id="lock-open" style="padding:14px 30px">Sblocca</button>
      </div>`;
    document.body.appendChild(overlay);
    const attempt = async () => {
      try { await verify(); hide(); }
      catch { /* annullato: resta bloccata, il bottone riprova */ }
    };
    overlay.querySelector('#lock-open').addEventListener('click', attempt);
    attempt(); // prova subito: sul telefono appare direttamente il pannello impronta
  }

  function hide() { overlay?.remove(); overlay = null; }

  async function boot() {
    await detect();
    if (enabled()) show();
    document.addEventListener('visibilitychange', () => {
      if (!enabled()) return;
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > RELOCK_MS) { hiddenAt = 0; show(); }
    });
  }

  // per spegnere il blocco serve sbloccare: nessuno lo disattiva di nascosto
  async function disableSecure() { await verify(); disable(); }

  return { boot, detect, enable, disable, disableSecure, enabled, isSupported: () => supported };
})();
