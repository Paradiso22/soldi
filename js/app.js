/* app.js - Soldi. Router, viste, dialog. */
'use strict';

const APP_VERSION = 'v49';

/* ---------- helpers ---------- */
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/* Modalita' riservata: nasconde solo come i numeri vengono mostrati.
   Vive in localStorage (per dispositivo) e non tocca mai i dati ne' la sync. */
const PRIVACY_KEY = 'soldi-privacy';
let privacyOn = localStorage.getItem(PRIVACY_KEY) === '1';
const privacyEnabled = () => privacyOn;
function setPrivacy(on) {
  privacyOn = on;
  if (on) localStorage.setItem(PRIVACY_KEY, '1'); else localStorage.removeItem(PRIVACY_KEY);
}

const fmt = c => (privacyOn ? '••••' : EUR.format(c / 100));
const fmtS = c => (privacyOn ? '••••' : (c > 0 ? '+' : c < 0 ? '-' : '') + EUR.format(Math.abs(c) / 100));
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESI_S = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ricarica pulita: svuota le cache (e opzionalmente il service worker) poi riparte da rete
async function hardRefresh(nukeSw) {
  try {
    if (nukeSw && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* si prova comunque */ }
  // la query unica scavalca sia la cache del browser sia quella della CDN
  location.href = location.pathname + '?r=' + Date.now() + location.hash;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function parseAmountInput(v) {
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace('€', '').trim());
  return isNaN(n) ? null : Math.round(n * 100);
}
function amountToInput(c) { return (c / 100).toFixed(2).replace('.', ','); }

function fmtDate(iso, dayUnknown) {
  const [y, m, d] = iso.split('-').map(Number);
  return dayUnknown ? `${MESI[m - 1]} ${y}` : `${d} ${MESI[m - 1]} ${y}`;
}

// colore stabile per categoria: le 8 categorie con più uscite di sempre
// hanno il loro slot fisso; le altre confluiscono in "Altro" (grigio).
function catColorSlots(flow = 'out') {
  const tot = new Map();
  for (const t of DB.state.tx) {
    if (t.type !== flow || !t.category) continue;
    tot.set(t.category, (tot.get(t.category) || 0) + t.amount);
  }
  const slots = new Map();
  // ogni categoria ha il suo posto: nessuna finisce in un calderone "Altro"
  [...tot.entries()].sort((a, b) => b[1] - a[1]).forEach(([id], i) => slots.set(id, i));
  return slots;
}

/* Colore per posizione: le prime 8 sono la palette validata per il daltonismo,
   dalla nona in poi la stessa palette schiarita (secondo giro) o scurita (terzo),
   cosi' restano tutte distinguibili senza ripetere lo stesso identico colore. */
function slotColor(i) {
  const base = Charts.SERIES_CSS[i % 8];
  const giro = Math.floor(i / 8);
  if (giro === 0) return base;
  if (giro === 1) return `color-mix(in srgb, ${base} 52%, #ffffff)`;
  return `color-mix(in srgb, ${base} 62%, #1c1b1a)`;
}

/* Barre del periodo scelto: giorni se il periodo e' corto, mesi se e' medio,
   anni se e' lungo. Cosi' il grafico di destra risponde al filtro come quello
   di sinistra, invece di restare fermo sull'anno. */
function barBuckets(range) {
  const oggi = todayISO();
  const to = range.to > oggi ? oggi : range.to;   // niente futuro nelle statistiche
  const from = range.from;
  const giorni = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
  const out = [];
  const add = (label, f, t) => { const s = DB.sums({ from: f, to: t }); out.push({ label, in: s.in, out: s.out, from: f, to: t }); };

  if (giorni <= 0) return out;
  if (giorni <= 62) {
    for (let i = 0; i < giorni; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i);
      const iso = todayISOof(d);
      add(giorni <= 14 ? d.getDate() + '/' + (d.getMonth() + 1) : String(d.getDate()), iso, iso);
    }
  } else if (giorni <= 750) {
    let d = new Date(from.slice(0, 7) + '-01');
    const last = to.slice(0, 7);
    while (true) {
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const fine = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      add(MESI_S[d.getMonth()], ym + '-01', todayISOof(fine));
      if (ym >= last) break;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  } else {
    for (let a = +from.slice(0, 4); a <= +to.slice(0, 4); a++) add(String(a), a + '-01-01', a + '-12-31');
  }
  return out;
}
const todayISOof = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// fette del donut per un filtro periodo: colori stabili, resto in "Altro".
// flow: 'out' (uscite) o 'in' (entrate). I movimenti futuri non contano.
function donutSlices(filt, flow = 'out') {
  const byCat = new Map();
  const today = todayISO();
  for (const t of DB.state.tx) {
    if (t.type !== flow) continue;
    if (t.date > today) continue;
    if (filt.ym && !t.date.startsWith(filt.ym)) continue;
    if (filt.y && !t.date.startsWith(filt.y)) continue;
    if (filt.from && t.date < filt.from) continue;
    if (filt.to && t.date > filt.to) continue;
    const k = t.category || '__none__';
    byCat.set(k, (byCat.get(k) || 0) + t.amount);
  }
  // gli slot di colore sono per flusso: le categorie di incasso (es. Fatture)
  // hanno il loro posto, e ogni categoria resta visibile e selezionabile
  const slots = catColorSlots(flow);
  const out = [];
  for (const [id, v] of byCat) {
    if (id === '__none__') { out.push({ id, label: 'Senza categoria', value: v, color: 'var(--s-none)' }); continue; }
    out.push({ id, label: DB.cat(id)?.name || id, value: v, color: slotColor(slots.get(id) ?? 0) });
  }
  return out.filter(s => s.value > 0).sort((a, b) => b.value - a.value);
}

/* ---------- stato UI ---------- */
const UI = {
  route: 'home',
  mov: { scope: 'month', anchor: todayISO(), custom: null, account: null, category: null, search: '', type: null },
  fatYear: new Date().getFullYear(),
  stat: { scope: 'month', anchor: todayISO(), custom: null, flow: 'out', table: false },
  home: { scope: 'month', anchor: todayISO(), custom: null },
  homeFlow: 'out',
  lastAdded: null,
};

/* ---------- periodi: giorno / settimana / mese / anno / personalizzato ---------- */
const isoD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fmtShort = iso => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MESI_S[m - 1].toLowerCase() + ' ' + y; };

function rangeFor(scope, anchor, custom) {
  const [y, m, d] = anchor.split('-').map(Number);
  if (scope === 'day') return { from: anchor, to: anchor, label: d + ' ' + MESI[m - 1] + ' ' + y };
  if (scope === 'week') {
    const dt = new Date(y, m - 1, d);
    const start = new Date(y, m - 1, d - ((dt.getDay() + 6) % 7)); // lunedi'
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: isoD(start), to: isoD(end), label: start.getDate() + ' ' + MESI_S[start.getMonth()].toLowerCase() + ' - ' + end.getDate() + ' ' + MESI_S[end.getMonth()].toLowerCase() };
  }
  if (scope === 'month') {
    const last = new Date(y, m, 0).getDate();
    return { from: anchor.slice(0, 7) + '-01', to: anchor.slice(0, 7) + '-' + String(last).padStart(2, '0'), label: MESI[m - 1] + ' ' + y };
  }
  if (scope === 'year') return { from: y + '-01-01', to: y + '-12-31', label: String(y) };
  if (scope === 'custom' && custom?.from && custom?.to) return { from: custom.from, to: custom.to, label: fmtShort(custom.from) + ' - ' + fmtShort(custom.to) };
  return { from: null, to: null, label: 'Tutto' };
}

function shiftAnchor(scope, anchor, dir) {
  const [y, m, d] = anchor.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (scope === 'day') dt.setDate(d + dir);
  else if (scope === 'week') dt.setDate(d + 7 * dir);
  else if (scope === 'month') { dt.setDate(1); dt.setMonth(m - 1 + dir); }
  else if (scope === 'year') dt.setFullYear(y + dir);
  return isoD(dt);
}

/* ---------- router ---------- */
const ROUTES = { '': 'home', '#/': 'home', '#/movimenti': 'movimenti', '#/fatture': 'fatture', '#/statistiche': 'statistiche', '#/impostazioni': 'impostazioni' };

function navigate() {
  UI.route = ROUTES[location.hash] || 'home';
  render();
}

// slot colore per categoria, ricalcolati a ogni render (usati per dischi e donut)
let CAT_SLOTS = new Map();
function catDisc(catId) {
  const slot = CAT_SLOTS.get(catId);
  return slot != null ? `background: color-mix(in srgb, var(--s${slot + 1}) 16%, white)` : '';
}

function render() {
  Charts.hideTip();
  document.body.dataset.route = UI.route;
  const view = $('#view');
  const needsWelcome = !DB.state.seeded && DB.state.tx.length === 0;
  $$('.tabbar a, .sidenav a').forEach(a => {
    const isCur = a.dataset.nav === UI.route;
    if (isCur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (needsWelcome) { view.innerHTML = Views.welcome(); Views.bindWelcome(view); return; }
  CAT_SLOTS = catColorSlots();
  const v = Views[UI.route];
  view.innerHTML = v();
  const bind = Views['bind' + UI.route[0].toUpperCase() + UI.route.slice(1)];
  if (bind) bind(view);
  UI.lastAdded = null;
}

/* ---------- viste ---------- */
const Views = {

  /* ===== benvenuto / prima esecuzione ===== */
  welcome() {
    return `<div class="welcome">
      <h2><span style="color:var(--brand)">€</span> Soldi</h2>
      <p>Spese, entrate e fatture del forfettario, tutto salvato <strong>solo su questo dispositivo</strong>.</p>
      <button class="btn primary" id="w-import"><svg class="ic"><use href="#i-down"/></svg> Importa i movimenti dal foglio Google (1.036)</button>
      <button class="btn" id="w-file"><svg class="ic"><use href="#i-up"/></svg> Importa un backup (.soldi)</button>
      <button class="btn" id="w-empty">Parti da zero</button>
      <input type="file" id="w-fileinput" accept=".soldi" hidden>
      <p class="mut" style="font-size:.8rem;margin-top:14px">Sul telefono? Esporta il backup cifrato dal PC, passalo via Drive e importalo qui: i dati non toccano mai un server.</p>
    </div>`;
  },
  bindWelcome(root) {
    // online il file seed non esiste (privacy): nascondi il pulsante
    fetch('seed/seed-data.json', { method: 'HEAD' }).then(r => {
      if (!r.ok) $('#w-import', root)?.remove();
    }).catch(() => $('#w-import', root)?.remove());
    $('#w-import', root).addEventListener('click', async () => {
      const btn = $('#w-import', root);
      btn.disabled = true; btn.textContent = 'Importo…';
      try {
        const res = await fetch('seed/seed-data.json');
        const seed = await res.json();
        const now = Date.now();
        seed.tx.forEach((t, i) => { t.createdAt = now - (seed.tx.length - i); });
        await DB.putTxBulk(seed.tx);
        await DB.markSeeded();
        await DB.migrateRecurringNotes();
        await DB.materializeRecurring();
        toast('Importati ' + seed.tx.length + ' movimenti ✓');
        render();
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = '<svg class="ic"><use href="#i-down"/></svg> Importa i movimenti dal foglio Google (1.036)';
        toast('Import non riuscito: ' + e.message);
      }
    });
    $('#w-empty', root).addEventListener('click', async () => { await DB.markSeeded(); render(); });
    $('#w-file', root).addEventListener('click', () => $('#w-fileinput', root).click());
    $('#w-fileinput', root).addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) Dialogs.passwordFlow('import', f);
      e.target.value = '';
    });
  },

  /* ===== home / lavagna ===== */
  home() {
    const bal = DB.balances();
    const total = [...bal.values()].reduce((a, b) => a + b, 0);
    const range = rangeFor(UI.home.scope, UI.home.anchor, UI.home.custom);
    const hasNav = ['day', 'week', 'month', 'year'].includes(UI.home.scope);
    const filt = { from: range.from, to: range.to };
    const m = DB.sums(filt);
    // scadenze fiscali vere (quelle che ti dice il commercialista), non piu' una stima.
    // Le "previste" restano fuori dal numero grande: sono stime che cambiano a ogni fattura.
    // Seguono il periodo scelto: se guardi agosto vedi cosa scade in agosto.
    const dentro = t => (!range.from || t.date >= range.from) && (!range.to || t.date <= range.to);
    const scad = scadenzeFiscali().filter(dentro);
    const dovute = scad.filter(t => !t.fisco?.prevista);
    const previste = scad.filter(t => t.fisco?.prevista);
    const daPagare = dovute.reduce((s, t) => s + t.amount, 0);
    const stimate = previste.reduce((s, t) => s + t.amount, 0);
    const prossima = dovute[0];
    // gli F24 escono da un conto solo: e' quel saldo che deve bastare
    const saldoF24 = bal.get(contoTasse()) || 0;
    const today = todayISO();
    const recent = DB.state.tx.filter(t => t.date <= today).slice(0, matchMedia('(min-width: 920px)').matches ? 11 : 6);
    const upcoming = DB.state.tx.filter(t => t.date > today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const noCat = DB.state.tx.filter(t => !t.category && t.type !== 'transfer').length;

    return `<div class="home-grid"><div class="colA">
      <div class="periodnav">
        <button class="iconbtn" id="h-prev" aria-label="Periodo precedente" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${range.label}</span>
        <button class="iconbtn" id="h-next" aria-label="Periodo successivo" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-right"/></svg></button>
      </div>
      <div class="chip-row scroll">
        ${[['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno']].map(([s2, l]) =>
          `<button class="chip" data-hscope="${s2}" aria-pressed="${UI.home.scope === s2}">${l}</button>`).join('')}
        <button class="chip" data-hscope="all" aria-pressed="${UI.home.scope === 'all'}">Tutto</button>
      </div>

      <section class="hero">
        <div class="label">In cassa adesso</div>
        <div class="total money">${fmt(total)}</div>
        <div class="underline" aria-hidden="true"></div>
        <div class="monthline">
          <span>${range.label}:</span>
          <span class="m-eq">
            <span class="pos money"><svg class="ic tri" aria-hidden="true"><use href="#i-tri-up"/></svg> ${fmt(m.in)}</span>
            <span class="neg money"><svg class="ic tri" aria-hidden="true"><use href="#i-tri-down"/></svg> ${fmt(m.out)}</span>
            <span class="money ${m.in - m.out >= 0 ? 'pos' : 'neg'}">= ${fmtS(m.in - m.out)}</span>
          </span>
        </div>
      </section>

      <div class="tags-row" role="list">
        ${DB.state.accounts.filter(a => !a.archived && !(a.linkedTo && DB.acc(a.linkedTo))).map(a => `
          <button class="tag-card" role="listitem" data-acc="${a.id}">
            <span class="t-name">${esc(a.icon)} ${esc(a.name)}</span>
            <span class="t-amount money ${bal.get(a.id) < 0 ? 'neg' : ''}">${fmt(bal.get(a.id) || 0)}</span>
          </button>`).join('')}
      </div>

      <button class="setaside ${daPagare > saldoF24 ? 'allarme' : ''}" data-goto="fatture">
        <svg class="ic"><use href="#i-invoice"/></svg>
        <span style="flex:1">
          <span class="s-label">${daPagare ? 'Tasse da pagare' : 'Nessuna scadenza fiscale'} · ${esc(range.label)}</span><br>
          <span class="s-val money">${fmt(daPagare)}</span>
          ${prossima ? `<br><span class="s-label">La prossima ${fmtShort(prossima.date)}, ${fraQuanto(prossima.date)}</span>` : ''}
          ${daPagare > saldoF24 ? `<br><span class="s-label" style="color:var(--neg)">Su ${esc(DB.acc(contoTasse())?.name || 'quel conto')} hai ${fmt(saldoF24)}: ti mancano ${fmt(daPagare - saldoF24)}</span>` : ''}
          ${stimate ? `<br><span class="s-label">+ ${fmt(stimate)} previsti nel periodo (stima Fiscozen)</span>` : ''}
        </span>
        <svg class="ic" style="width:18px;color:var(--chalk-3)"><use href="#i-right"/></svg>
      </button>

      ${noCat ? `<button class="badge warn" id="fix-nocat" style="margin-top:12px;cursor:pointer;font-family:inherit">
        <svg class="ic" style="width:14px;height:14px"><use href="#i-alert"/></svg> ${noCat} movimenti senza categoria - sistemali</button>` : ''}

      ${(m.out > 0 || m.in > 0) ? (() => {
        const slices = donutSlices(filt, UI.homeFlow);
        return `<div class="chartcard" id="home-chart" style="margin-top:16px;cursor:pointer">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <h4>${UI.homeFlow === 'out' ? 'Dove vanno' : 'Da dove arrivano'}</h4>
          <div class="segment" style="flex:0 0 auto;padding:3px">
            <button type="button" data-hflow="out" data-t="out" aria-pressed="${UI.homeFlow === 'out'}" style="padding:6px 12px">Uscite</button>
            <button type="button" data-hflow="in" data-t="in" aria-pressed="${UI.homeFlow === 'in'}" style="padding:6px 12px">Entrate</button>
          </div>
        </div>
        <div class="c-sub">${range.label} · tocca per tutte le statistiche</div>
        <div id="home-donut"></div>
        <div class="legend">
          ${slices.slice(0, 4).map(s2 => `<span class="lg-row">
            <span class="swatch" style="background:${s2.color}"></span>
            <span class="lg-name">${esc(s2.label)}</span>
            <span class="lg-val money">${fmt(s2.value)}</span>
          </span>`).join('')}
        </div>
      </div>`;
      })() : ''}

      <form class="quickbar" id="quickform">
        <input id="quickinput" type="text" placeholder='Scrivi qui: "12,50 pizza contanti"…' autocomplete="off" aria-label="Aggiunta veloce">
        <button type="button" class="iconbtn" id="quickmic" aria-label="Detta a voce"><svg class="ic"><use href="#i-mic"/></svg></button>
        <button type="button" class="iconbtn" id="quickphoto" aria-label="Foto scontrino"><svg class="ic"><use href="#i-camera"/></svg></button>
        <button type="submit" class="iconbtn primary" aria-label="Aggiungi"><svg class="ic"><use href="#i-send"/></svg></button>
      </form>
      </div><div class="colB">

      ${upcoming.length ? `
      <h3 class="rule">In arrivo</h3>
      <ul class="txlist">${upcoming.map(t => Views.txRow(t)).join('')}</ul>` : ''}

      <h3 class="rule">Ultimi movimenti</h3>
      <ul class="txlist">${recent.length ? recent.map(t => Views.txRow(t)).join('') : `
        <li class="empty"><div class="e-marker">Tutto in ordine</div>Scrivi la prima spesa qui sotto.</li>`}
      </ul>

      <div class="mut" style="font-size:.68rem;text-align:center;padding:10px 0 2px">Soldi ${APP_VERSION}</div>
      </div></div>`;
  },
  bindHome(root) {
    $('#h-prev', root).addEventListener('click', () => { UI.home.anchor = shiftAnchor(UI.home.scope, UI.home.anchor, -1); render(); });
    $('#h-next', root).addEventListener('click', () => { UI.home.anchor = shiftAnchor(UI.home.scope, UI.home.anchor, 1); render(); });
    $$('[data-hscope]', root).forEach(b => b.addEventListener('click', () => {
      UI.home.scope = b.dataset.hscope;
      UI.home.anchor = todayISO(); // cambiando taglio si riparte da oggi
      render();
    }));
    $$('.tag-card', root).forEach(b => b.addEventListener('click', () => {
      UI.mov = { scope: 'all', anchor: todayISO(), custom: null, account: b.dataset.acc, category: null, search: '', type: null };
      location.hash = '#/movimenti';
    }));
    $('[data-goto="fatture"]', root).addEventListener('click', () => location.hash = '#/fatture');
    const fx = $('#fix-nocat', root);
    if (fx) fx.addEventListener('click', () => { UI.mov = { scope: 'all', anchor: todayISO(), custom: null, account: null, category: '__none__', search: '', type: null }; location.hash = '#/movimenti'; });
    const hc = $('#home-chart', root);
    if (hc) {
      const r2 = rangeFor(UI.home.scope, UI.home.anchor, UI.home.custom);
      const slices = donutSlices({ from: r2.from, to: r2.to }, UI.homeFlow);
      const tot = slices.reduce((s, x) => s + x.value, 0);
      if (tot) Charts.donut($('#home-donut', root), slices, { centerLabel: UI.homeFlow === 'out' ? 'Uscite' : 'Entrate', centerValue: fmt(tot), fmt });
      $$('[data-hflow]', hc).forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        UI.homeFlow = b.dataset.hflow;
        render();
      }));
      hc.addEventListener('click', () => {
        // le statistiche si aprono sullo stesso periodo che stavi guardando
        UI.stat = { ...UI.home, flow: UI.homeFlow, table: false };
        location.hash = '#/statistiche';
      });
    }
    $$('.txrow', root).forEach(r => r.addEventListener('click', () => Dialogs.txForm(DB.state.tx.find(t => t.id === r.dataset.id))));

    const form = $('#quickform', root), input = $('#quickinput', root);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const p = Parser.parse(input.value, DB.state);
      if (!p) return;
      if (p.error) { toast(p.error); return; }
      Dialogs.quickPreview(p, () => { input.value = ''; });
    });
    $('#quickphoto', root).addEventListener('click', () => Dialogs.photoFlow());

    // dettatura vocale (Web Speech API, it-IT) - gratis, integrata nel browser
    const mic = $('#quickmic', root);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { mic.hidden = true; }
    else {
      let rec = null;
      mic.addEventListener('click', () => {
        if (rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = 'it-IT';
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        mic.classList.add('rec');
        rec.onresult = e => {
          let txt = '';
          for (const r of e.results) txt += r[0].transcript;
          // "dodici e cinquanta" a volte arriva come "12 e 50"
          input.value = txt.trim().replace(/(\d+)\s+e\s+(\d{1,2})(?!\d)/gi, '$1,$2');
        };
        rec.onerror = e => {
          toast(e.error === 'not-allowed' ? 'Permesso microfono negato: abilitalo nelle impostazioni del sito.' : 'Non ho sentito bene, riprova.');
        };
        rec.onend = () => { mic.classList.remove('rec'); rec = null; if (input.value) input.focus(); };
        rec.start();
      });
    }
  },

  txRow(t, { noDate } = {}) {
    const c = DB.cat(t.category);
    const a = DB.acc(t.account), b = DB.acc(t.toAccount);
    const sign = t.type === 'in' ? '+' : t.type === 'out' ? '-' : '';
    const cls = t.type === 'in' ? 'pos' : t.type === 'out' ? 'neg' : 'mut';
    const icon = t.type === 'transfer' ? '🔁' : (c ? c.icon : '❓');
    const where = t.type === 'transfer'
      ? `${a ? esc(a.name) : 'Origine sconosciuta'} → ${b ? esc(b.name) : '?'}`
      : [c ? esc(c.name) : 'Senza categoria', a ? esc(a.name) : 'Senza conto'].join(' · ');
    const sub = (noDate ? [] : [fmtDate(t.date, t.dayUnknown)]).concat(where).join(' · ');
    const future = t.date > todayISO();
    return `<li><button class="txrow ${UI.lastAdded === t.id ? 'is-new' : ''} ${future ? 'future' : ''}" data-id="${t.id}">
      <span class="t-emoji" aria-hidden="true" style="${catDisc(t.category)}">${icon}</span>
      <span class="t-main">
        <span class="t-desc">${esc(t.desc)}${t.invoice ? ' <span class="badge" style="font-size:.62rem;padding:1px 7px">FATTURA</span>' : ''}${t.recur ? ' <span class="badge" style="font-size:.62rem;padding:1px 7px">🔁 ' + (t.recur === 'monthly' ? 'OGNI MESE' : 'OGNI ANNO') + '</span>' : ''}</span>
        <span class="t-sub">${sub}</span>
      </span>
      <span class="t-amt money ${cls}">${sign} ${fmt(t.amount)}</span>
    </button></li>`;
  },

  /* ===== movimenti ===== */
  movimenti() {
    const f = UI.mov;
    const range = rangeFor(f.scope, f.anchor, f.custom);
    const today = todayISO();
    let list = DB.state.tx.filter(t => {
      if (range.from && t.date < range.from) return false;
      if (range.to && t.date > range.to) return false;
      if (f.account && t.account !== f.account && t.toAccount !== f.account) return false;
      if (f.category === '__none__') { if (t.category || t.type === 'transfer') return false; }
      else if (f.category && t.category !== f.category) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        if (!(t.desc || '').toLowerCase().includes(q) && !(t.note || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const tin = list.filter(t => t.type === 'in' && t.date <= today).reduce((s, t) => s + t.amount, 0);
    const tout = list.filter(t => t.type === 'out' && t.date <= today).reduce((s, t) => s + t.amount, 0);
    const nFuturi = list.filter(t => t.date > today).length;

    // raggruppa per giorno
    const groups = [];
    let cur = null;
    for (const t of list) {
      const key = t.dayUnknown ? t.date.slice(0, 7) + '-??' : t.date;
      if (!cur || cur.key !== key) { cur = { key, date: t.date, dayUnknown: t.dayUnknown, items: [] }; groups.push(cur); }
      cur.items.push(t);
    }

    const hasNav = ['day', 'week', 'month', 'year'].includes(f.scope);

    return `
      <h2 class="viewtitle">Movimenti</h2>
      <div class="subtitle">${list.length} moviment${list.length === 1 ? 'o' : 'i'}${nFuturi ? ' · ' + nFuturi + ' in arrivo' : ''}
        <span class="sub-tot"><span>ad oggi</span>
        <span class="pos money">+${fmt(tin)}</span>
        <span class="neg money">-${fmt(tout)}</span>
        <span class="money ${tin - tout >= 0 ? 'pos' : 'neg'}">= ${fmtS(tin - tout)}</span></span></div>

      <div class="periodnav">
        <button class="iconbtn" id="m-prev" aria-label="Periodo precedente" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${range.label}</span>
        <button class="iconbtn" id="m-next" aria-label="Periodo successivo" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-right"/></svg></button>
      </div>
      <div class="chip-row scroll">
        ${[['day', 'Giorno'], ['week', 'Settimana'], ['month', 'Mese'], ['all', 'Tutto']].map(([s2, l]) =>
          `<button class="chip" data-scope="${s2}" aria-pressed="${f.scope === s2}">${l}</button>`).join('')}
        <button class="chip" data-scope="custom" aria-pressed="${f.scope === 'custom'}">Date…</button>
      </div>

      <div class="chip-row scroll">
        ${DB.state.accounts.filter(a => !a.archived).map(a =>
          `<button class="chip" data-facc="${a.id}" aria-pressed="${f.account === a.id}">${esc(a.icon)} ${esc(a.name)}</button>`).join('')}
      </div>
      <div class="frow" style="margin-bottom:14px">
        <input type="search" id="m-search" placeholder="Cerca…" value="${esc(f.search)}" aria-label="Cerca movimenti">
        <select id="m-cat" aria-label="Filtra per categoria" style="max-width:200px">
          <option value="">Tutte le categorie</option>
          <option value="__none__" ${f.category === '__none__' ? 'selected' : ''}>❓ Senza categoria</option>
          ${DB.state.categories.filter(c => !c.archived).map(c => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
        </select>
      </div>

      <ul class="txlist">
        ${groups.length ? groups.map(g => `
          <li class="daygroup">
            <div class="dayhead">${g.dayUnknown ? 'Giorno non noto · ' + fmtDate(g.date, true) : fmtDate(g.date, false)}</div>
            <ul class="txlist">${g.items.map(t => Views.txRow(t, { noDate: true })).join('')}</ul>
          </li>`).join('')
        : `<li class="empty"><svg class="ic"><use href="#i-board"/></svg><div class="e-marker">Niente qui</div>Nessun movimento con questi filtri.</li>`}
      </ul>`;
  },
  bindMovimenti(root) {
    const f = UI.mov;
    $('#m-prev', root).addEventListener('click', () => { f.anchor = shiftAnchor(f.scope, f.anchor, -1); render(); });
    $('#m-next', root).addEventListener('click', () => { f.anchor = shiftAnchor(f.scope, f.anchor, 1); render(); });
    $$('[data-scope]', root).forEach(b => b.addEventListener('click', () => {
      const s2 = b.dataset.scope;
      if (s2 === 'custom') { Dialogs.rangePicker(f.custom, (from, to) => { f.scope = 'custom'; f.custom = { from, to }; render(); }); return; }
      f.scope = s2; f.anchor = todayISO(); render();
    }));
    $$('[data-facc]', root).forEach(b => b.addEventListener('click', () => {
      UI.mov.account = UI.mov.account === b.dataset.facc ? null : b.dataset.facc; render();
    }));
    $('#m-cat', root).addEventListener('change', e => { UI.mov.category = e.target.value || null; render(); });
    let t0;
    $('#m-search', root).addEventListener('input', e => {
      clearTimeout(t0);
      t0 = setTimeout(() => { UI.mov.search = e.target.value; const pos = e.target.selectionStart; render(); const s = $('#m-search'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }, 350);
    });
    $$('.txrow', root).forEach(r => r.addEventListener('click', () => Dialogs.txForm(DB.state.tx.find(t => t.id === r.dataset.id))));
  },

  /* ===== fatture ===== */
  fatture() {
    const y = UI.fatYear;
    const s = DB.state.settings;
    const invs = DB.invoicesOfYear(y);
    const calcs = invs.map(t => ({ t, c: DB.invoiceCalc(t) }));
    const tot = k => calcs.reduce((a, x) => a + x.c[k], 0);

    const perMonth = Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const list = calcs.filter(x => x.t.date.slice(5, 7) === mm);
      const sum = k => list.reduce((a, x) => a + x.c[k], 0);
      return { m: i, n: list.length, lordo: sum('lordo'), bollo: sum('bollo'), rivalsaAmt: sum('rivalsaAmt'), onorario: sum('onorario'), imposta: sum('imposta'), inps: sum('inps'), daParte: sum('daParte'), netto: sum('netto') };
    }).filter(r => r.n > 0);

    const scad = scadenzeFiscali();
    const dovute = scad.filter(t => !t.fisco?.prevista);
    const previste = scad.filter(t => t.fisco?.prevista);
    const daPagare = dovute.reduce((a, t) => a + t.amount, 0);
    const stimate = previste.reduce((a, t) => a + t.amount, 0);
    // gli F24 escono da un conto solo: e' quel saldo che deve bastare, non il totale
    const contoF24 = DB.acc(contoTasse());
    const inCassa = DB.balances().get(contoTasse()) || 0;
    /* Il confronto col saldo si fa su quello che scade adesso, non su quattro mesi di
       F24 in blocco: le fatture che incassi a settembre pagano l'F24 di settembre.
       Se questo mese non scade niente, si guarda alla prossima. Il resto resta scritto
       sotto, cosi' un F24 grosso piu' avanti non arriva di sorpresa. */
    const ymOggi = todayISO().slice(0, 7);
    const meseNome = MESI[+ymOggi.slice(5) - 1].toLowerCase();
    const delMese = dovute.filter(t => t.date.slice(0, 7) === ymOggi);
    const prossima = dovute[0];
    const adesso = delMese.length ? delMese.reduce((a, t) => a + t.amount, 0) : (prossima ? prossima.amount : 0);
    const oltre = daPagare - adesso;
    const ultima = dovute[dovute.length - 1];
    const rigaScad = t => `<li><button class="txrow" data-id="${t.id}">
        <span class="t-emoji" aria-hidden="true">${t.fisco?.prevista ? '🔮' : '📅'}</span>
        <span class="t-main">
          <span class="t-desc">${esc(t.desc)}</span>
          <span class="t-sub">${fmtShort(t.date)} · ${fraQuanto(t.date)}${t.fisco?.prevista ? ' · stima' : ''}${DB.acc(t.account) ? ' · ' + esc(DB.acc(t.account).name) : ''}</span>
        </span>
        <span class="t-amt money neg">- ${fmt(t.amount)}</span>
      </button></li>`;

    return `
      <h2 class="viewtitle">Fatture e tasse</h2>
      <div class="subtitle">Regime forfettario · le scadenze sono quelle del commercialista</div>

      <h3 class="rule">Scadenze fiscali</h3>
      ${scad.length ? `
      <div class="setaside ${adesso > inCassa ? 'allarme' : ''}" style="cursor:default;margin-bottom:12px">
        <svg class="ic"><use href="#i-invoice"/></svg>
        <span style="flex:1">
          <span class="s-label">${delMese.length
            ? 'Da pagare entro fine ' + meseNome + ' · ' + delMese.length + ' scadenz' + (delMese.length === 1 ? 'a' : 'e')
            : 'Niente da pagare ' + (meseNome[0] === 'a' ? 'ad ' : 'a ') + meseNome + ' · la prossima ' + fmtShort(prossima.date)}</span><br>
          <span class="s-val money">${fmt(adesso)}</span><br>
          <span class="s-label">Su ${esc(contoF24 ? contoF24.name : 'nessun conto')} hai ${fmt(inCassa)}: ${adesso > inCassa
            ? 'ti mancano ' + fmt(adesso - inCassa)
            : 'coperte ✓'}</span>
          ${oltre ? `<br><span class="s-label">Poi altri ${fmt(oltre)} entro il ${fmtShort(ultima.date)}</span>` : ''}
        </span>
      </div>
      <ul class="txlist">${dovute.map(rigaScad).join('')}</ul>`
      : `<div class="empty" style="padding:22px"><svg class="ic"><use href="#i-invoice"/></svg>
        <div class="e-marker">Nessuna scadenza inserita</div>Copia qui gli F24 che ti indica Fiscozen: importo e data di scadenza.</div>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px">
        <button class="btn primary" id="f-fiscozen"><svg class="ic"><use href="#i-spark"/></svg> Incolla da Fiscozen</button>
        <button class="btn" id="f-add-scad"><svg class="ic"><use href="#i-plus"/></svg> Aggiungi a mano</button>
      </div>

      ${previste.length ? `
      <h3 class="rule">Tasse previste</h3>
      <p class="mut" style="font-size:.8rem;margin:-4px 0 10px">Stime di Fiscozen, non ancora dovute: ${fmt(stimate)} in tutto. Cambiano man mano che emetti fatture, quindi si riscrivono a ogni "Incolla da Fiscozen". Sulle previste Fiscozen mostra un intervallo: qui trovi il valore più alto.</p>
      <ul class="txlist">${previste.map(rigaScad).join('')}</ul>` : ''}

      <h3 class="rule">Fatture emesse</h3>
      <div class="periodnav">
        <button class="iconbtn" id="f-prev" aria-label="Anno precedente"><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${y}</span>
        <button class="iconbtn" id="f-next" aria-label="Anno successivo"><svg class="ic"><use href="#i-right"/></svg></button>
        <button class="btn primary" id="f-add" style="margin-left:auto"><svg class="ic"><use href="#i-plus"/></svg> Fattura</button>
      </div>

      ${invs.length === 0 ? `<div class="empty"><svg class="ic"><use href="#i-invoice"/></svg>
        <div class="e-marker">Nessuna fattura nel ${y}</div>Quando incassi una fattura, segnala qui: il conto delle tasse si fa da solo.</div>` : `

      <div class="tags-row" style="padding-top:2px">
        <div class="tag-card" style="cursor:default"><span class="t-name">Fatturato lordo ${y}</span><span class="t-amount money">${fmt(tot('lordo'))}</span></div>
        <div class="tag-card" style="cursor:default"><span class="t-name">Numero fatture</span><span class="t-amount money">${invs.length}</span></div>
      </div>

      <h3 class="rule">Le fatture del ${y}</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Fattura</th><th scope="col">Incassato</th><th scope="col">Conto</th><th scope="col" class="hm">Bollo</th><th scope="col" class="hm">Rivalsa 4%</th></tr></thead>
        <tbody>
          ${calcs.map(({ t, c }) => `<tr data-id="${t.id}" style="cursor:pointer" title="Modifica">
            <td><strong>${esc(t.desc)}</strong><br><span class="mut" style="font-size:.74rem">${fmtDate(t.date, t.dayUnknown)}</span></td>
            <td class="money">${fmt(c.lordo)}</td>
            <td>${DB.acc(t.account) ? esc(DB.acc(t.account).name) : '-'}</td>
            <td class="money hm">${c.bollo ? fmt(c.bollo) : '-'}</td>
            <td class="money hm">${c.rivalsaAmt ? fmt(c.rivalsaAmt) : '-'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Totale ${y}</td>
          <td class="money">${fmt(tot('lordo'))}</td>
          <td></td>
          <td class="money hm">${fmt(tot('bollo'))}</td><td class="money hm">${fmt(tot('rivalsaAmt'))}</td></tr></tfoot>
      </table></div>

      <h3 class="rule">Mese per mese</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Mese</th><th scope="col">N. fatture</th><th scope="col">Incassato</th></tr></thead>
        <tbody>${perMonth.map(r => `<tr>
          <td>${MESI[r.m]}</td><td class="money">${r.n}</td><td class="money">${fmt(r.lordo)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`}

      <p class="mut" style="font-size:.78rem;margin-top:14px">Le tasse non sono stimate dall'app: quanto e quando pagare lo dice Fiscozen, e con "Incolla da Fiscozen" finisce qui dentro. Il motivo è che l'imposta reale dipende da acconti, saldo, contributi dedotti e rateizzazione, che un calcolo per singola fattura non può conoscere. Dal 20 di ogni mese l'app ti ricorda di ricontrollare.</p>`;
  },
  bindFatture(root) {
    $('#f-prev', root).addEventListener('click', () => { UI.fatYear--; render(); });
    $('#f-next', root).addEventListener('click', () => { UI.fatYear++; render(); });
    $('#f-add', root).addEventListener('click', () => Dialogs.txForm(null, { type: 'in', category: 'fatture', invoice: { bollo: true, rivalsa: false } }));
    $('#f-add-scad', root).addEventListener('click', () => Dialogs.txForm(null, {
      type: 'out', category: catTasse(), account: contoTasse(), desc: 'F24', date: todayISO(),
    }));
    $('#f-fiscozen', root).addEventListener('click', () => Dialogs.fiscozen());
    $$('tbody tr[data-id]', root).forEach(r => r.addEventListener('click', () => Dialogs.txForm(DB.state.tx.find(t => t.id === r.dataset.id))));
    $$('.txrow', root).forEach(r => r.addEventListener('click', () => Dialogs.txForm(DB.state.tx.find(t => t.id === r.dataset.id))));
  },

  /* ===== statistiche ===== */
  statistiche() {
    const st = UI.stat;
    const y = +st.anchor.slice(0, 4);
    const range = rangeFor(st.scope, st.anchor, st.custom);
    const filt = { from: range.from, to: range.to };
    const flowLabel = st.flow === 'out' ? 'Uscite' : 'Entrate';

    const slices = donutSlices(filt, st.flow);
    const tot = slices.reduce((s, x) => s + x.value, 0);

    // le barre seguono il periodo scelto, non piu' l'anno fisso
    const months = barBuckets(range);
    const ytot = DB.sums({ from: range.from, to: range.to });
    const hasNav = ['day', 'week', 'month', 'year'].includes(st.scope);

    return `
      <h2 class="viewtitle">Statistiche</h2>
      <div class="subtitle">Come si muovono i soldi (contando fino a oggi)</div>

      <div class="periodnav">
        <button class="iconbtn" id="s-prev" aria-label="Periodo precedente" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${range.label}</span>
        <button class="iconbtn" id="s-next" aria-label="Periodo successivo" ${hasNav ? '' : 'disabled'}><svg class="ic"><use href="#i-right"/></svg></button>
      </div>
      <div class="chip-row scroll">
        ${[['day', 'Giorno'], ['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno']].map(([s2, l]) =>
          `<button class="chip" data-sscope="${s2}" aria-pressed="${st.scope === s2}">${l}</button>`).join('')}
        <button class="chip" data-sscope="custom" aria-pressed="${st.scope === 'custom'}">Date…</button>
        <button class="chip" id="s-table" aria-pressed="${st.table}">Tabella</button>
      </div>

      <div class="stats-grid">
      <div class="chartcard">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <h4>${st.flow === 'out' ? 'Dove vanno' : 'Da dove arrivano'} (per categoria)</h4>
          <div class="segment" style="flex:0 0 auto;padding:3px">
            <button type="button" data-flow="out" data-t="out" aria-pressed="${st.flow === 'out'}" style="padding:6px 12px">Uscite</button>
            <button type="button" data-flow="in" data-t="in" aria-pressed="${st.flow === 'in'}" style="padding:6px 12px">Entrate</button>
          </div>
        </div>
        <div class="c-sub">${range.label} · totale <strong class="money">${fmt(tot)}</strong></div>
        <div id="donut"></div>
        ${tot === 0 ? `<div class="empty" style="padding:18px">Nessuna ${flowLabel.toLowerCase().slice(0, -1)}a nel periodo.</div>` : `
        <div class="legend" role="list">
          ${slices.map(s2 => `<button class="lg-row" role="listitem" data-cat="${s2.id}">
            <span class="swatch" style="background:${s2.color}"></span>
            <span class="lg-name">${esc(s2.label)}</span>
            <span class="lg-val money">${fmt(s2.value)}</span>
            <span class="lg-pct money">${Math.round(s2.value / tot * 100)}%</span>
          </button>`).join('')}
        </div>`}
      </div>

      <div class="chartcard">
        <h4>Entrate e uscite · ${range.label}</h4>
        <div class="c-sub"><span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--s3)"></span> Entrate ${fmt(ytot.in)} &nbsp;
          <span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--s2)"></span> Uscite ${fmt(ytot.out)} &nbsp;·&nbsp; saldo <strong class="money ${ytot.in - ytot.out >= 0 ? 'pos' : 'neg'}">${fmtS(ytot.in - ytot.out)}</strong></div>
        <div id="barchart"></div>
      </div>
      </div>

      ${st.table ? `
      <h3 class="rule">Tabella · ${range.label}</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Categoria</th><th scope="col">${flowLabel}</th><th scope="col">Quota</th></tr></thead>
        <tbody>${slices.map(s2 => `<tr><td>${esc(s2.label)}</td><td class="money">${fmt(s2.value)}</td><td class="money">${tot ? Math.round(s2.value / tot * 100) : 0}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Totale</td><td class="money">${fmt(tot)}</td><td></td></tr></tfoot>
      </table></div>
      <div class="tablewrap" style="margin-top:12px"><table class="sheet">
        <thead><tr><th scope="col">Mese</th><th scope="col">Entrate</th><th scope="col">Uscite</th><th scope="col">Saldo</th></tr></thead>
        <tbody>${months.map(mo => `<tr><td>${mo.label}</td><td class="money">${fmt(mo.in)}</td><td class="money">${fmt(mo.out)}</td><td class="money ${mo.in - mo.out >= 0 ? 'pos' : 'neg'}">${fmtS(mo.in - mo.out)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  },
  bindStatistiche(root) {
    const st = UI.stat;
    $('#s-prev', root).addEventListener('click', () => { st.anchor = shiftAnchor(st.scope, st.anchor, -1); render(); });
    $('#s-next', root).addEventListener('click', () => { st.anchor = shiftAnchor(st.scope, st.anchor, 1); render(); });
    $$('[data-sscope]', root).forEach(b => b.addEventListener('click', () => {
      const s2 = b.dataset.sscope;
      if (s2 === 'custom') { Dialogs.rangePicker(st.custom, (from, to) => { st.scope = 'custom'; st.custom = { from, to }; render(); }); return; }
      st.scope = s2; st.anchor = todayISO(); render();
    }));
    $$('[data-flow]', root).forEach(b => b.addEventListener('click', () => { st.flow = b.dataset.flow; render(); }));
    $('#s-table', root).addEventListener('click', () => { st.table = !st.table; render(); });

    // grafici
    const y = +st.anchor.slice(0, 4);
    const range = rangeFor(st.scope, st.anchor, st.custom);
    const donutEl = $('#donut', root);
    const real = donutSlices({ from: range.from, to: range.to }, st.flow);
    const tot = real.reduce((s, x) => s + x.value, 0);
    if (donutEl && tot) Charts.donut(donutEl, real, { centerLabel: st.flow === 'out' ? 'Uscite' : 'Entrate', centerValue: fmt(tot), fmt });

    $$('.lg-row', root).forEach(r => r.addEventListener('click', () => {
      const id = r.dataset.cat;
      UI.mov = { scope: st.scope, anchor: st.anchor, custom: st.custom, account: null, category: id === '__none__' ? '__none__' : id, search: '', type: st.flow };
      location.hash = '#/movimenti';
    }));

    const buckets = barBuckets(range);
    Charts.bars($('#barchart', root), buckets, {
      fmt,
      onBarClick: i => {
        const b = buckets[i];
        if (!b) return;
        st.scope = 'custom'; st.custom = { from: b.from, to: b.to };
        render();
      },
    });
  },

  /* ===== impostazioni ===== */
  impostazioni() {
    const s = DB.state.settings;
    const bal = DB.balances();
    return `
      <h2 class="viewtitle">Impostazioni</h2>
      <div class="subtitle">Conti, categorie, fisco, backup</div>

      <div class="setcard">
        <h4>Conti</h4>
        <div class="s-desc">Aggiungi, modifica o archivia. Il saldo si calcola da saldo iniziale + movimenti.</div>
        ${DB.state.accounts.map(a => `
          <div class="rowitem draggable ${a.archived ? 'mut' : ''}" data-accid="${a.id}">
            <button class="grip" aria-label="Trascina per riordinare ${esc(a.name)}"><svg class="ic"><use href="#i-grip"/></svg></button>
            <span style="font-size:1.1rem">${esc(a.icon)}</span>
            <span class="r-main"><span class="r-name">${esc(a.name)}${a.archived ? ' (archiviato)' : ''}</span>
            <span class="r-sub money">${a.linkedTo && DB.acc(a.linkedTo) ? 'Collegata a ' + esc(DB.acc(a.linkedTo).name) + ' - le spese contano lì' : 'Saldo: ' + fmt(bal.get(a.id) || 0)}</span></span>
            <button class="iconbtn" data-accedit="${a.id}" aria-label="Modifica ${esc(a.name)}"><svg class="ic"><use href="#i-edit"/></svg></button>
          </div>`).join('')}
        <div class="hint" style="margin-top:8px">Trascina dalla maniglia ⠿ per cambiare l'ordine: lo stesso ordine si vede in home.</div>
        <button class="btn" id="acc-add" style="margin-top:10px"><svg class="ic"><use href="#i-plus"/></svg> Nuovo conto</button>
      </div>

      <div class="setcard">
        <h4>Categorie</h4>
        <div class="s-desc">Le categorie delle tue spese ed entrate.</div>
        <div class="chip-row" style="margin:0 0 10px">
          ${DB.state.categories.filter(c => !c.archived).map(c => `<button class="chip" data-catedit="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}
        </div>
        <button class="btn" id="cat-add"><svg class="ic"><use href="#i-plus"/></svg> Nuova categoria</button>
      </div>

      <div class="setcard">
        <h4>Fisco (forfettario)</h4>
        <div class="s-desc">Parametri per il calcolo delle fatture. Verificali col commercialista - l'INPS Gestione Separata 2026 per chi non ha altra cassa è circa 26,07%.</div>
        <form id="fisco-form">
          <div class="field"><label for="fx-conto">Conto da cui paghi gli F24</label>
            <select id="fx-conto">${DB.state.accounts.filter(a => !a.archived).map(a =>
              `<option value="${a.id}" ${contoTasse() === a.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('')}</select>
            <div class="hint">Le scadenze importate da Fiscozen finiscono qui, e la spunta "coperte" guarda solo questo saldo. Cambiandolo si spostano anche le scadenze future già inserite.</div>
          </div>
          <div class="frow">
            <div class="field"><label for="fx-imposta">Imposta sostitutiva %</label><input id="fx-imposta" type="number" step="0.01" min="0" max="100" value="${(s.imposta * 100).toFixed(2).replace(/\.?0+$/, '')}"></div>
            <div class="field"><label for="fx-inps">INPS %</label><input id="fx-inps" type="number" step="0.01" min="0" max="100" value="${(s.inps * 100).toFixed(2).replace(/\.?0+$/, '')}"></div>
          </div>
          <div class="frow">
            <div class="field"><label for="fx-coeff">Coefficiente redditività %</label><input id="fx-coeff" type="number" step="1" min="0" max="100" value="${Math.round(s.coeff * 100)}"></div>
            <div class="field"><label for="fx-bollo">Marca da bollo €</label><input id="fx-bollo" type="number" step="0.01" min="0" value="${(s.bollo / 100).toFixed(2)}"></div>
          </div>
          <button class="btn primary" type="submit">Salva parametri</button>
        </form>
      </div>

      <div class="setcard">
        <h4>Riconoscimento foto (AI, opzionale)</h4>
        <div class="s-desc">Per leggere gli scontrini in foto serve una API key gratuita di Google Gemini (<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="color:var(--chalk-2)">aistudio.google.com/apikey</a>). La chiave resta solo su questo dispositivo e le foto vengono inviate a Google solo quando la usi.</div>
        <div class="frow">
          <input type="password" id="ai-key" placeholder="API key Gemini…" value="${esc(s.geminiKey)}" aria-label="API key Gemini" autocomplete="off">
          <button class="btn" id="ai-save" style="flex:0 0 auto">Salva</button>
        </div>
      </div>

      <div class="setcard">
        <h4>Sincronizzazione Google Drive</h4>
        ${Sync.enabled() ? `
        <div class="s-desc">Attiva ✓ - le modifiche si allineano da sole tra i tuoi dispositivi, cifrate prima di salire sul tuo Drive.
          ${s.sync.lastSync ? 'Ultima sync: ' + new Date(s.sync.lastSync).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : ''}
          ${Sync.state.status === 'reconnect' ? ' <strong style="color:var(--amber)">Serve riconnettersi.</strong>' : ''}
          ${Sync.state.lastError === 'NEED_PASSWORD' || Sync.state.lastError === 'WRONG_KEY' ? ' <strong style="color:var(--amber)">Reinserisci la password di sync.</strong>' : ''}</div>
        <div class="chip-row" style="margin:0">
          <button class="btn primary" id="sy-now">Sincronizza ora</button>
          <button class="btn" id="sy-off">Scollega</button>
        </div>` : `
        <div class="s-desc">Collega il tuo Google Drive: le modifiche fatte dal telefono compaiono anche sul PC (e viceversa) in automatico. Su Drive viaggia solo un file cifrato con una password che scegli tu. Serve un Client ID Google gratuito (chiedi a Claude la guida, ~10 minuti una tantum).</div>
        <div class="frow">
          <input type="text" id="sy-cid" placeholder="Client ID Google (…apps.googleusercontent.com)" value="${esc(s.sync?.clientId || '956096436311-j52o8b7opd33ll09mg5r2kujip13haug.apps.googleusercontent.com')}" autocomplete="off">
          <button class="btn primary" id="sy-on" style="flex:0 0 auto">Collega</button>
        </div>`}
      </div>

      <div class="setcard">
        <h4>Batti - spese condivise</h4>
        ${Batti.enabled() ? `
        <div class="s-desc">Collegata al gruppo <strong>${esc(s.batti.groupName || '')}</strong> come <strong>${esc(s.batti.memberName || '')}</strong>: le spese che paghi tu arrivano da sole${DB.acc(s.batti.account) ? ' sul conto ' + esc(DB.acc(s.batti.account).name) : ''}, con la nota "Importata automaticamente da Batti".
        ${s.batti.lastImport ? ' Ultimo controllo: ' + new Date(s.batti.lastImport).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '.' : ''}</div>
        <div class="chip-row" style="margin:0">
          <button class="btn primary" id="bt-now">Importa ora</button>
          <button class="btn" id="bt-off">Scollega</button>
        </div>` : `
        <div class="s-desc">Collega il tuo gruppo di Batti: ogni spesa che paghi tu lì viene registrata da sola anche qui (da oggi in poi), con nota automatica. Incolla il link d'invito o il codice del gruppo.</div>
        <div class="frow">
          <input type="text" id="bt-code" placeholder="Link o codice del gruppo Batti" autocomplete="off">
          <button class="btn primary" id="bt-on" style="flex:0 0 auto">Collega</button>
        </div>`}
      </div>

      <div class="setcard">
        <h4>Backup e dati</h4>
        <div class="s-desc">Il backup è un file cifrato con una password che scegli tu: salvalo dove vuoi, ad esempio sul tuo Google Drive. Senza password nessuno lo apre.</div>
        <div class="chip-row" style="margin:0">
          <button class="btn" id="bk-export"><svg class="ic"><use href="#i-down"/></svg> Esporta backup cifrato</button>
          <button class="btn" id="bk-import"><svg class="ic"><use href="#i-up"/></svg> Importa backup</button>
          <button class="btn" id="bk-csv">Esporta CSV</button>
        </div>
        <input type="file" id="bk-file" accept=".soldi" hidden>
      </div>

      ${(() => {
        const bin = DB.state.gone.filter(g => g.tx).sort((x, y) => y.updatedAt - x.updatedAt);
        return `<div class="setcard">
        <h4>Cestino</h4>
        <div class="s-desc">I movimenti eliminati restano qui 30 giorni e puoi ripristinarli; poi spariscono da soli.</div>
        ${bin.length ? bin.map(g => `
          <div class="rowitem">
            <span style="font-size:1.05rem">${DB.cat(g.tx.category)?.icon || '🗑️'}</span>
            <span class="r-main"><span class="r-name">${esc(g.tx.desc)}</span>
            <span class="r-sub money">${fmtDate(g.tx.date, g.tx.dayUnknown)} · ${g.tx.type === 'in' ? '+' : '-'} ${fmt(g.tx.amount)}</span></span>
            <button class="iconbtn" data-restore="${g.id}" aria-label="Ripristina ${esc(g.tx.desc)}" title="Ripristina"><svg class="ic"><use href="#i-up"/></svg></button>
          </div>`).join('') + `
        <button class="btn danger" id="trash-empty" style="margin-top:10px">Svuota cestino (${bin.length})</button>`
        : '<div class="s-desc" style="margin:0">Il cestino è vuoto.</div>'}
      </div>`;
      })()}

      <div class="setcard">
        <h4>Password d'ingresso</h4>
        ${Gate.configured() ? `
        <div class="s-desc">Attiva ✓ - chi apre l'indirizzo dell'app deve inserire la password. Su ogni dispositivo viene chiesta una volta sola, poi resta ricordata.</div>
        <button class="btn" id="gate-forget">Dimentica su questo dispositivo</button>`
        : `
        <div class="s-desc">L'indirizzo dell'app è pubblico: con una password d'ingresso solo chi la conosce può usarla. Scegline una <strong>robusta e non usata altrove</strong> (il controllo vive nel codice pubblico). La password non esce da questo dispositivo: si genera solo un codice di verifica da consegnare a Claude.</div>
        <div class="frow">
          <input type="password" id="gate-new" placeholder="Nuova password" autocomplete="new-password">
          <input type="password" id="gate-new2" placeholder="Ripeti" autocomplete="new-password">
        </div>
        <button class="btn primary" id="gate-make" style="margin-top:10px">Genera codice di verifica</button>
        <div id="gate-out" hidden style="margin-top:12px">
          <div class="s-desc" style="margin-bottom:6px">Copia questa riga e incollala a Claude (non contiene la password):</div>
          <textarea id="gate-json" readonly rows="3" style="font-size:.76rem;font-family:ui-monospace,monospace"></textarea>
          <button class="btn" id="gate-copy" style="margin-top:8px">Copia</button>
        </div>`}
      </div>

      ${AppLock.isSupported() || AppLock.enabled() ? `
      <div class="setcard">
        <h4>Blocco app</h4>
        <div class="s-desc">${AppLock.enabled()
          ? 'Attivo ✓ - per aprire Soldi su questo dispositivo servono impronta o codice del telefono. Si riblocca dopo 1 minuto in background.'
          : 'Chiedi l\'impronta (o il codice di sblocco del telefono) per aprire Soldi su questo dispositivo. Impostazione locale: va attivata su ogni dispositivo.'}</div>
        <button class="btn ${AppLock.enabled() ? '' : 'primary'}" id="lock-toggle">${AppLock.enabled() ? 'Disattiva blocco' : 'Attiva blocco con impronta'}</button>
      </div>` : ''}

      <div class="setcard">
        <h4>Promemoria</h4>
        <div class="s-desc">Se passano più di 3 giorni senza che tu segni nulla (o senza spese in arrivo da Batti), all'apertura te lo ricordo. Con il permesso alle notifiche te lo dico anche fuori dall'app.
        ${s.remind === false ? ' <strong>Ora è spento.</strong>' : ''}</div>
        <div class="chip-row" style="margin:0">
          <button class="btn ${s.remind === false ? 'primary' : ''}" id="rem-toggle">${s.remind === false ? 'Attiva promemoria' : 'Disattiva promemoria'}</button>
          ${s.remind === false ? '' : `<button class="btn" id="rem-notif">${notifOn() ? 'Notifiche attive ✓' : 'Consenti notifiche'}</button>`}
        </div>
      </div>

      <div class="setcard">
        <h4>Modalità riservata</h4>
        <div class="s-desc">Nasconde tutti gli importi dietro ••••, così puoi mostrare l'app a qualcuno senza far vedere le cifre. Vale solo su questo dispositivo e non tocca i dati né la sincronizzazione.</div>
        <button class="btn ${privacyEnabled() ? '' : 'primary'}" id="privacy-toggle">${privacyEnabled() ? 'Mostra di nuovo gli importi' : 'Nascondi gli importi'}</button>
      </div>

      <div class="setcard">
        <h4>Aggiornamento app</h4>
        <div class="s-desc">Versione attuale: <strong>${APP_VERSION}</strong>. L'app si aggiorna da sola a ogni apertura; se resta indietro, forza da qui (i dati non si toccano).</div>
        <button class="btn primary" id="app-refresh">Riscarica l'app adesso</button>
      </div>

      <div class="setcard" style="border-color:rgba(230,103,103,.35)">
        <h4 style="color:var(--danger)">Zona a rischio</h4>
        <div class="s-desc">Cancella tutti i dati da questo dispositivo. Irreversibile (fai prima un backup).</div>
        <button class="btn danger" id="wipe">Cancella tutto</button>
      </div>

      <p class="mut" style="font-size:.76rem;padding:4px 2px 20px">Soldi non ha server: i dati vivono in questo browser (IndexedDB), i backup sono cifrati AES-256. Versione ${APP_VERSION}</p>`;
  },
  bindImpostazioni(root) {
    bindAccountReorder(root);
    $$('[data-accedit]', root).forEach(b => b.addEventListener('click', () => Dialogs.accountForm(DB.acc(b.dataset.accedit))));
    $('#acc-add', root).addEventListener('click', () => Dialogs.accountForm(null));
    $$('[data-catedit]', root).forEach(b => b.addEventListener('click', () => Dialogs.categoryForm(DB.cat(b.dataset.catedit))));
    $('#cat-add', root).addEventListener('click', () => Dialogs.categoryForm(null));

    $('#fisco-form', root).addEventListener('submit', async e => {
      e.preventDefault();
      const s = DB.state.settings;
      s.contoTasse = $('#fx-conto').value || null;
      s.imposta = (+$('#fx-imposta').value || 0) / 100;
      s.inps = (+$('#fx-inps').value || 0) / 100;
      s.coeff = (+$('#fx-coeff').value || 0) / 100;
      s.bollo = Math.round((+$('#fx-bollo').value || 0) * 100);
      await DB.saveSettings();

      // le scadenze future si allineano sempre al conto scelto, anche quelle gia'
      // inserite prima: se no restano su un conto da cui non paghi davvero
      const meta = contoTasse();
      const da = scadenzeFiscali().filter(t => t.account !== meta)
        .map(t => ({ ...t, account: meta, updatedAt: Date.now() }));
      if (da.length) await DB.putTxBulk(da);
      const spostate = da.length;
      toast(`Parametri fiscali salvati ✓${spostate ? ` · ${spostate} scadenz${spostate === 1 ? 'a spostata' : 'e spostate'}` : ''}`);
      render();
    });

    $('#ai-save', root).addEventListener('click', async () => {
      DB.state.settings.geminiKey = $('#ai-key').value.trim();
      await DB.saveSettings();
      toast(DB.state.settings.geminiKey ? 'Chiave salvata ✓' : 'Chiave rimossa');
    });

    const syOn = $('#sy-on', root);
    if (syOn) syOn.addEventListener('click', () => {
      const cid = $('#sy-cid', root).value.trim();
      if (!cid.endsWith('.apps.googleusercontent.com')) { toast('Client ID non valido: finisce con .apps.googleusercontent.com'); return; }
      Dialogs.syncPassword(pw => {
        toast('Collego Google Drive…');
        Sync.connect(cid, pw)
          .then(() => { toast('Sincronizzazione attiva ✓'); render(); })
          .catch(e => { toast(e.message === 'WRONG_KEY' ? 'Password diversa da quella usata sull\'altro dispositivo.' : e.message); render(); });
      });
    });
    const syNow = $('#sy-now', root);
    if (syNow) syNow.addEventListener('click', () => {
      const run = pw => Sync.syncNow({ interactive: true, password: pw })
        .then(() => { toast('Sincronizzato ✓'); render(); })
        .catch(e => {
          if (e.message === 'NEED_PASSWORD' || e.message === 'WRONG_KEY') Dialogs.syncPassword(run, e.message === 'WRONG_KEY');
          else toast(e.message);
          render();
        });
      run(null);
    });
    const syOff = $('#sy-off', root);
    if (syOff) syOff.addEventListener('click', () => Dialogs.confirm(
      'Scollegare la sincronizzazione?',
      'I dati restano su questo dispositivo e sul tuo Drive; semplicemente non si allineeranno più da soli.',
      'Scollega',
      async () => { await Sync.disconnect(); toast('Sincronizzazione scollegata'); render(); }
    ));

    const btOn = $('#bt-on', root);
    if (btOn) btOn.addEventListener('click', () => {
      const gid = Batti.parseGroupId($('#bt-code', root).value);
      if (!gid) { toast('Incolla il link o il codice del gruppo.'); return; }
      toast('Cerco il gruppo…');
      Batti.fetchMeta(gid)
        .then(meta => Dialogs.battiPicker(gid, meta))
        .catch(e => toast(e.message));
    });
    const btNow = $('#bt-now', root);
    if (btNow) btNow.addEventListener('click', () => {
      toast('Controllo Batti…');
      Batti.importNow()
        .then(n => { toast(n ? (n === 1 ? '1 spesa importata ✓' : n + ' spese importate ✓') : 'Niente di nuovo da importare'); render(); })
        .catch(e => toast(e.message));
    });
    const btOff = $('#bt-off', root);
    if (btOff) btOff.addEventListener('click', async () => {
      DB.state.settings.batti = { ...DB.state.settings.batti, on: false };
      await DB.saveSettings();
      toast('Batti scollegata'); render();
    });

    $('#bk-export', root).addEventListener('click', () => Dialogs.passwordFlow('export'));
    $('#bk-import', root).addEventListener('click', () => $('#bk-file').click());
    $('#bk-file', root).addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) Dialogs.passwordFlow('import', f);
      e.target.value = '';
    });
    $('#bk-csv', root).addEventListener('click', () => { Backup.exportCSV(); toast('CSV esportato ✓'); });

    const gm = $('#gate-make', root);
    if (gm) gm.addEventListener('click', async () => {
      const pw = $('#gate-new', root).value, pw2 = $('#gate-new2', root).value;
      if (pw.length < 8) { toast('Minimo 8 caratteri: il verificatore è pubblico.'); return; }
      if (pw !== pw2) { toast('Le due password non coincidono.'); return; }
      gm.disabled = true; gm.textContent = 'Calcolo…';
      const v = await Gate.makeVerifier(pw);
      $('#gate-json', root).value = `const V = { salt: '${v.salt}', hash: '${v.hash}' };`;
      $('#gate-out', root).hidden = false;
      gm.disabled = false; gm.textContent = 'Genera di nuovo';
      toast('Codice pronto: incollalo a Claude ✓');
    });
    const gc = $('#gate-copy', root);
    if (gc) gc.addEventListener('click', async () => {
      const t = $('#gate-json', root);
      try { await navigator.clipboard.writeText(t.value); toast('Copiato ✓'); }
      catch { t.select(); toast('Selezionato: copia con Ctrl+C'); }
    });
    const gf = $('#gate-forget', root);
    if (gf) gf.addEventListener('click', () => Dialogs.confirm(
      'Dimenticare la password qui?',
      'Alla prossima apertura su questo dispositivo la password verrà richiesta di nuovo.',
      'Dimentica',
      async () => { Gate.forget(); toast('Verrà richiesta alla prossima apertura'); }
    ));

    const lt = $('#lock-toggle', root);
    if (lt) lt.addEventListener('click', async () => {
      try {
        if (AppLock.enabled()) { await AppLock.disableSecure(); toast('Blocco disattivato'); }
        else { await AppLock.enable(); toast('Blocco attivo ✓ - alla prossima apertura serve l\'impronta'); }
        render();
      } catch {
        toast(AppLock.enabled() ? 'Sblocco annullato: il blocco resta attivo.' : 'Attivazione annullata.');
      }
    });

    $('#rem-toggle', root).addEventListener('click', async () => {
      DB.state.settings.remind = DB.state.settings.remind === false;
      await DB.saveSettings();
      toast(DB.state.settings.remind === false ? 'Promemoria disattivato' : 'Promemoria attivo ✓');
      render();
    });
    const rn = $('#rem-notif', root);
    if (rn) rn.addEventListener('click', async () => {
      if (!('Notification' in window)) { toast('Questo dispositivo non supporta le notifiche.'); return; }
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? 'Notifiche attive ✓' : 'Permesso non concesso: resta il promemoria dentro l\'app.');
      render();
    });

    $('#privacy-toggle', root).addEventListener('click', () => {
      setPrivacy(!privacyEnabled());
      toast(privacyEnabled() ? 'Importi nascosti' : 'Importi di nuovo visibili');
      render();
    });

    $('#app-refresh', root).addEventListener('click', () => { toast('Riscarico l\'app…'); hardRefresh(true); });

    $$('[data-restore]', root).forEach(b => b.addEventListener('click', async () => {
      const t = await DB.restoreTx(b.dataset.restore);
      toast(t ? 'Ripristinato ✓' : 'Non ripristinabile');
      render();
    }));
    const te = $('#trash-empty', root);
    if (te) te.addEventListener('click', () => Dialogs.confirm(
      'Svuotare il cestino?',
      'I movimenti nel cestino non saranno più ripristinabili.',
      'Svuota',
      async () => { await DB.emptyTrash(); toast('Cestino svuotato'); render(); }
    ));

    $('#wipe', root).addEventListener('click', () => Dialogs.confirm(
      'Cancellare tutto?',
      'Tutti i movimenti, i conti e le impostazioni verranno eliminati da questo dispositivo. Non si può annullare.',
      'Sì, cancella tutto',
      async () => { await DB.wipeAll(); toast('Dati cancellati'); location.hash = '#/'; render(); }
    ));
  },
};

/* Riordino conti con trascinamento (dito e mouse).
   La riga trascinata NON viene spostata nel DOM durante il gesto: spostarla
   farebbe perdere al browser la presa sul puntatore (pointerup non arriverebbe
   mai). Si muove con una trasformazione, le altre scorrono per fare spazio,
   e l'ordine vero si scrive una volta sola al rilascio. */
/* Promemoria: se non segni nulla da piu' di 3 giorni te lo ricordo all'apertura.
   Un avviso ad app chiusa richiederebbe un server di push: qui scatta quando
   apri l'app (e come notifica di sistema, se l'hai permesso). */
const notifOn = () => 'Notification' in window && Notification.permission === 'granted';
const GIORNI_PROMEMORIA = 3;

function checkPromemoria() {
  if (DB.state.settings.remind === false) return;
  const ultimo = DB.state.tx.reduce((max, t) => Math.max(max, t.createdAt || 0), 0);
  if (!ultimo) return;
  const giorni = Math.floor((Date.now() - ultimo) / 864e5);
  if (giorni < GIORNI_PROMEMORIA) return;
  if (localStorage.getItem('soldi-remind-day') === todayISO()) return; // uno al giorno basta
  localStorage.setItem('soldi-remind-day', todayISO());

  const testo = `Sono ${giorni} giorni che non segni un movimento: aggiorna i conti per non perdere il filo.`;
  setTimeout(() => toast(testo), 900);
  if (notifOn()) {
    try { new Notification('Soldi', { body: testo, icon: 'icons/icon-192.png', tag: 'soldi-promemoria' }); } catch { /* alcuni browser la vogliono dal service worker */ }
  }
}

/* Dal 20 di ogni mese: ricontrolla Fiscozen. Le tasse previste cambiano ogni volta
   che emetti una fattura, quindi vanno rilette, non calcolate. Se il 20 non apri
   l'app, scatta il primo giorno che la apri. */
function checkFiscozen() {
  if (DB.state.settings.remind === false) return;
  const oggi = todayISO();
  if (+oggi.slice(8) < 20) return;
  if (localStorage.getItem('soldi-fisco-mese') === oggi.slice(0, 7)) return;
  localStorage.setItem('soldi-fisco-mese', oggi.slice(0, 7));

  const testo = 'Controllo del mese: apri Fiscozen → Tasse, copia la pagina e incollala in Fatture e tasse.';
  setTimeout(() => toast(testo), 4000); // dopo l'eventuale promemoria, che dura 2,6s
  if (notifOn()) {
    try { new Notification('Soldi', { body: testo, icon: 'icons/icon-192.png', tag: 'soldi-fiscozen' }); } catch { /* alcuni browser la vogliono dal service worker */ }
  }
}

/* Scadenze fiscali: sono normali movimenti futuri in "Tasse e Contributi".
   Cosi' non tolgono soldi finche' non arriva la data, compaiono in "In arrivo"
   e viaggiano nella sync senza codice nuovo. */
function catTasse() {
  const c = DB.state.categories.find(x => /tass|contribut/i.test(x.name) && !x.archived);
  return c ? c.id : null;
}
/* Il conto da cui paghi gli F24. Serve a due cose: metterlo sulle scadenze importate
   e sapere su quale saldo controllare se sono coperte (i contanti non c'entrano). */
function contoTasse() {
  const vivi = DB.state.accounts.filter(a => !a.archived);
  const scelto = vivi.find(a => a.id === DB.state.settings.contoTasse);
  return (scelto || vivi.find(a => a.kind === 'bank') || vivi[0] || null)?.id || null;
}
function scadenzeFiscali() {
  const oggi = todayISO();
  const tid = catTasse();
  return DB.state.tx
    .filter(t => t.type === 'out' && t.date > oggi && t.category && t.category === tid)
    .sort((a, b) => a.date.localeCompare(b.date));
}
/* Import da Fiscozen. L'id e' calcolato da data + descrizione: reincollare la pagina
   aggiorna le righe invece di duplicarle, e quelle che Fiscozen non elenca piu'
   spariscono da sole (le previste cambiano ogni volta che emetti una fattura).
   Quello che scrivi a mano non ha "fisco.src" e non viene mai toccato. */
function idFisco(v, usati) {
  const base = 'fz-' + v.date + '-' + (v.key || v.desc).toLowerCase().normalize('NFD')
    .replace(/[^a-z0-9]+/g, '').slice(0, 24);
  let id = base;
  for (let n = 2; usati.has(id); n++) id = base + '-' + n;
  usati.add(id);
  return id;
}

function pianoFiscozen(voci) {
  const oggi = todayISO();
  const tid = catTasse();
  const conto = contoTasse();
  const usati = new Set();
  const assorbite = new Set();
  // le passate non entrano: diventerebbero uscite gia' avvenute e falserebbero il saldo
  const buone = voci.filter(v => v.date > oggi && v.amount > 0);

  const nuovi = buone.map(v => {
    const id = idFisco(v, usati);
    let vecchio = DB.state.tx.find(t => t.id === id);
    // se la stessa scadenza l'avevi gia' scritta a mano (stessa data e stesso importo)
    // la adotto invece di affiancarla, se no ti ritrovi tutto in doppio
    if (!vecchio) {
      vecchio = DB.state.tx.find(t => !t.fisco && !assorbite.has(t.id) && t.type === 'out'
        && t.category === tid && t.date === v.date && t.amount === v.amount && t.date > oggi);
      if (vecchio) assorbite.add(vecchio.id);
    }
    return {
      ...(vecchio || {}),
      id, type: 'out', amount: v.amount, date: v.date, desc: v.desc,
      category: tid, toAccount: null, invoice: null,
      account: conto, // sempre il conto delle tasse, anche se la riga esisteva gia'
      fisco: { src: 'fiscozen', prevista: v.prevista },
      createdAt: vecchio?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  });

  const tieni = new Set(nuovi.map(t => t.id));
  const sparite = DB.state.tx.filter(t => t.fisco?.src === 'fiscozen' && t.date > oggi && !tieni.has(t.id));
  return { nuovi, sparite, assorbite: [...assorbite], scartate: voci.length - buone.length };
}

/* Le scadenze di Fiscozen stanno sul conto delle tasse: l'import ce le mette, ma
   quelle importate prima che il conto fosse scegliibile erano finite sul primo conto
   in elenco (i contanti). Si riallineano da sole, ma una volta sola: dopo, se sposti
   a mano una scadenza su un altro conto, deve restarci. */
async function allineaContoScadenze() {
  if (localStorage.getItem('soldi-conto-scadenze') === 'fatto') return 0;
  localStorage.setItem('soldi-conto-scadenze', 'fatto');
  const conto = contoTasse();
  if (!conto) return 0;
  const oggi = todayISO();
  const da = DB.state.tx
    .filter(t => t.fisco?.src === 'fiscozen' && t.date > oggi && t.account !== conto)
    .map(t => ({ ...t, account: conto, updatedAt: Date.now() }));
  if (da.length) await DB.putTxBulk(da);
  return da.length;
}

async function importaFiscozen(voci) {
  const p = pianoFiscozen(voci);
  for (const id of [...p.assorbite, ...p.sparite.map(t => t.id)]) await DB.deleteTx(id);
  if (p.nuovi.length) await DB.putTxBulk(p.nuovi);
  return { messe: p.nuovi.length, tolte: p.sparite.length, adottate: p.assorbite.length };
}

function fraQuanto(iso) {
  const g = Math.ceil((new Date(iso) - new Date(todayISO())) / 864e5);
  if (g <= 0) return 'oggi';
  if (g === 1) return 'domani';
  if (g < 30) return 'tra ' + g + ' giorni';
  const m = Math.round(g / 30);
  return 'tra ' + m + (m === 1 ? ' mese' : ' mesi');
}

let dragInCorso = false;
function bindAccountReorder(root) {
  const rows = $$('.rowitem.draggable', root);
  if (rows.length < 2) return;

  rows.forEach((row, startIdx) => {
    const grip = row.querySelector('.grip');
    if (!grip) return;

    grip.addEventListener('pointerdown', e => {
      if (dragInCorso) return; // un trascinamento alla volta
      dragInCorso = true;
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch { /* non essenziale */ }
      const startY = e.clientY;
      const h = row.getBoundingClientRect().height || 56;
      let target = startIdx;
      row.classList.add('dragging');

      const move = ev => {
        const dy = ev.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        const t = Math.max(0, Math.min(rows.length - 1, startIdx + Math.round(dy / h)));
        if (t === target) return;
        target = t;
        rows.forEach((r, i) => {
          if (r === row) return;
          const su = startIdx < target && i > startIdx && i <= target;
          const giu = startIdx > target && i >= target && i < startIdx;
          r.style.transform = su ? `translateY(${-h}px)` : giu ? `translateY(${h}px)` : '';
        });
      };

      const up = async () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        dragInCorso = false;
        rows.forEach(r => { r.style.transform = ''; });
        row.classList.remove('dragging');
        if (target === startIdx) return;
        const arr = DB.state.accounts.slice();
        const [spostato] = arr.splice(startIdx, 1);
        arr.splice(target, 0, spostato);
        DB.state.accounts = arr;
        await DB.saveAccounts();
        toast('Ordine dei conti salvato ✓');
        render();
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
  });
}

/* ---------- dialogs ---------- */
const Dialogs = {
  open(html, cls = '') {
    const holder = $('#dialogs');
    holder.innerHTML = `<dialog class="${cls}">${html}</dialog>`;
    const dlg = holder.firstElementChild;
    // pulisci solo se questo dialog è ancora montato: l'evento 'close' arriva in ritardo
    // e non deve distruggere un dialog aperto subito dopo (es. la conferma di eliminazione)
    dlg.addEventListener('close', () => { if (dlg.isConnected) holder.innerHTML = ''; });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    $$('.dlg-close', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.showModal();
    return dlg;
  },

  confirm(title, body, okLabel, onOk) {
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${esc(title)}</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body"><p style="color:var(--chalk-2)">${esc(body)}</p></div>
      <div class="dlg-foot"><button class="btn dlg-close">Annulla</button><button class="btn danger" id="c-ok">${esc(okLabel)}</button></div>`);
    $('#c-ok', dlg).addEventListener('click', async () => { dlg.close(); await onOk(); });
  },

  /* --- incolla la pagina "Tasse" di Fiscozen --- */
  fiscozen() {
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>Incolla da Fiscozen</h2>
        <button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <p class="mut" style="font-size:.84rem;margin:0 0 12px;line-height:1.5">
          Su Fiscozen apri <strong>Adempimenti → Tasse</strong>, seleziona tutta la pagina e copiala.
          Incollala qui: una volta con il filtro <em>Tasse da pagare</em> e una con <em>Tasse future</em>
          (o incolla le due insieme).</p>
        <div class="field"><label for="fz-txt">Testo copiato</label>
          <textarea id="fz-txt" rows="5" placeholder="Da pagare&#10;16 settembre 2026&#10;732,09 €&#10;Scarica e paga l'F24 relativo a:"></textarea></div>
        <div id="fz-prev" class="mut" style="font-size:.84rem;line-height:1.6">Incolla il testo per vedere cosa succede.</div>
      </div>
      <div class="dlg-foot"><button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="fz-ok" disabled>Importa</button></div>`);

    const txt = $('#fz-txt', dlg);
    const prev = $('#fz-prev', dlg);
    const ok = $('#fz-ok', dlg);
    let voci = [];

    const aggiorna = () => {
      voci = Parser.fiscozen(txt.value);
      const p = pianoFiscozen(voci);
      const dov = p.nuovi.filter(t => !t.fisco.prevista);
      const pre = p.nuovi.filter(t => t.fisco.prevista);
      ok.disabled = !p.nuovi.length;
      if (!txt.value.trim()) { prev.textContent = 'Incolla il testo per vedere cosa succede.'; return; }
      if (!voci.length) { prev.innerHTML = '<span style="color:var(--neg)">Non ho riconosciuto nessuna scadenza. Assicurati di aver copiato tutta la pagina, comprese le date.</span>'; return; }
      const somma = l => fmt(l.reduce((a, t) => a + t.amount, 0));
      prev.innerHTML = `
        ${dov.length ? `<strong>${dov.length} da pagare</strong> · ${somma(dov)}<br>
          ${dov.map(t => `${fmtShort(t.date)} · ${fmt(t.amount)}`).join('<br>')}<br>` : ''}
        ${pre.length ? `<strong style="display:inline-block;margin-top:6px">${pre.length} previste</strong> · ${somma(pre)}<br>
          ${pre.map(t => `${fmtShort(t.date)} · ${fmt(t.amount)} · ${esc(t.desc)}`).join('<br>')}<br>` : ''}
        ${p.assorbite.length ? `<span style="display:inline-block;margin-top:6px">${p.assorbite.length} scadenz${p.assorbite.length === 1 ? 'a che avevi' : 'e che avevi'} già messo a mano (stessa data e stesso importo) ${p.assorbite.length === 1 ? 'viene sostituita' : 'vengono sostituite'}, così non resta in doppio.</span><br>` : ''}
        ${p.sparite.length ? `<span style="color:var(--neg);display:inline-block;margin-top:6px">${p.sparite.length} scadenz${p.sparite.length === 1 ? 'a' : 'e'} importat${p.sparite.length === 1 ? 'a' : 'e'} prima e non più elencat${p.sparite.length === 1 ? 'a: verrà tolta' : 'e: verranno tolte'}.</span><br>` : ''}
        <span style="display:inline-block;margin-top:6px">Il resto dei tuoi movimenti non viene toccato.</span>`;
    };

    txt.addEventListener('input', aggiorna);
    ok.addEventListener('click', async () => {
      const r = await importaFiscozen(voci);
      dlg.close();
      render();
      toast(`${r.messe} scadenz${r.messe === 1 ? 'a aggiornata' : 'e aggiornate'}${r.tolte ? ', ' + r.tolte + ' tolte' : ''}`);
    });
    setTimeout(() => txt.focus(), 60);
  },

  /* --- form movimento (crea/modifica) --- */
  txForm(tx, preset = {}) {
    const isNew = !tx;
    const t = tx ? { ...tx, invoice: tx.invoice ? { ...tx.invoice } : null } : {
      date: todayISO(), desc: '', type: 'out', amount: 0, account: DB.state.accounts.find(a => !a.archived)?.id || null,
      toAccount: null, category: null, note: '', invoice: null, ...preset,
    };
    const accOpts = sel => DB.state.accounts.filter(a => !a.archived || a.id === sel).map(a => `<option value="${a.id}" ${sel === a.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('');
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${isNew ? (t.invoice ? 'Nuova fattura' : 'Nuovo movimento') : 'Modifica'}</h2>
        <button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="segment" role="group" aria-label="Tipo" style="margin-bottom:14px">
          <button type="button" data-t="out" aria-pressed="${t.type === 'out'}">Uscita</button>
          <button type="button" data-t="in" aria-pressed="${t.type === 'in'}">Entrata</button>
          <button type="button" data-t="transfer" aria-pressed="${t.type === 'transfer'}">Giroconto</button>
        </div>
        <div class="bigamount"><span class="cur">€</span><input id="t-amount" type="text" inputmode="decimal" placeholder="0,00" value="${t.amount ? amountToInput(t.amount) : ''}" aria-label="Importo in euro"></div>
        <div class="field"><label for="t-desc">Descrizione</label><input id="t-desc" type="text" value="${esc(t.desc)}" placeholder="Es. Spesa Conad" autocomplete="off"></div>
        <div class="frow">
          <div class="field"><label for="t-date">Data</label><input id="t-date" type="date" value="${t.date}"></div>
          <div class="field" id="wrap-cat"><label for="t-cat">Categoria</label>
            <select id="t-cat"><option value="">Senza categoria</option>
              ${DB.state.categories.filter(c => !c.archived || c.id === t.category).map(c => `<option value="${c.id}" ${t.category === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
            </select></div>
        </div>
        <div class="frow">
          <div class="field"><label for="t-acc" id="lbl-acc">${t.type === 'transfer' ? 'Dal conto' : 'Conto'}</label>
            <select id="t-acc"><option value="">${t.type === 'transfer' ? 'Origine sconosciuta' : 'Senza conto'}</option>${accOpts(t.account)}</select></div>
          <div class="field" id="wrap-toacc" ${t.type === 'transfer' ? '' : 'hidden'}><label for="t-toacc">Al conto</label>
            <select id="t-toacc"><option value="">-</option>${accOpts(t.toAccount)}</select></div>
        </div>
        <div id="wrap-invoice" ${t.type === 'in' ? '' : 'hidden'}>
          <div class="field"><label style="display:flex;align-items:center;gap:8px;font-size:.9rem;cursor:pointer">
            <input type="checkbox" id="t-isinv" style="width:auto" ${t.invoice ? 'checked' : ''}> È una fattura (calcola tasse e INPS)</label></div>
          <div id="inv-opts" ${t.invoice ? '' : 'hidden'} style="background:var(--board-deep);border:1px dashed var(--board-line);border-radius:10px;padding:12px 14px;margin-bottom:14px">
            <div style="display:flex;gap:18px;margin-bottom:10px">
              <label style="display:flex;align-items:center;gap:7px;font-size:.86rem;cursor:pointer"><input type="checkbox" id="t-bollo" style="width:auto" ${!t.invoice || t.invoice.bollo ? 'checked' : ''}> Bollo €2</label>
              <label style="display:flex;align-items:center;gap:7px;font-size:.86rem;cursor:pointer"><input type="checkbox" id="t-rivalsa" style="width:auto" ${t.invoice?.rivalsa ? 'checked' : ''}> Rivalsa 4% inclusa</label>
            </div>
            <div id="inv-preview" class="mut" style="font-size:.84rem"></div>
          </div>
        </div>
        <div class="frow">
          <div class="field"><label for="t-recur">Si ripete</label>
            <select id="t-recur">
              <option value="">Non si ripete</option>
              <option value="monthly" ${t.recur === 'monthly' ? 'selected' : ''}>Ogni mese, stesso giorno</option>
              <option value="yearly" ${t.recur === 'yearly' ? 'selected' : ''}>Ogni anno, stesso giorno</option>
            </select>
            <div class="hint">La prossima si crea da sola. Per fermarla, elimina (o togli la ripetizione a) l'ultima creata.</div>
          </div>
        </div>
        <div class="field"><label for="t-note">Nota (facoltativa)</label><input id="t-note" type="text" value="${esc(t.note || '')}" autocomplete="off"></div>
      </div>
      <div class="dlg-foot">
        ${isNew ? '' : '<button class="iconbtn dlg-del" id="t-del" aria-label="Elimina movimento"><svg class="ic"><use href="#i-trash"/></svg></button>'}
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="t-save"><svg class="ic"><use href="#i-check"/></svg> ${isNew ? 'Segna' : 'Salva'}</button>
      </div>`);

    let type = t.type;
    const syncType = () => {
      $$('.segment [data-t]', dlg).forEach(b => b.setAttribute('aria-pressed', b.dataset.t === type));
      $('#wrap-toacc', dlg).hidden = type !== 'transfer';
      $('#wrap-cat', dlg).hidden = type === 'transfer';
      $('#lbl-acc', dlg).textContent = type === 'transfer' ? 'Dal conto' : 'Conto';
      $('#t-acc', dlg).firstElementChild.textContent = type === 'transfer' ? 'Origine sconosciuta' : 'Senza conto';
      $('#wrap-invoice', dlg).hidden = type !== 'in';
    };
    $$('.segment [data-t]', dlg).forEach(b => b.addEventListener('click', () => { type = b.dataset.t; syncType(); }));

    const invPrev = () => {
      const amount = parseAmountInput($('#t-amount', dlg).value) || 0;
      const isInv = $('#t-isinv', dlg).checked;
      $('#inv-opts', dlg).hidden = !isInv;
      if (!isInv || !amount) return;
      const c = DB.invoiceCalc({ amount, invoice: { bollo: $('#t-bollo', dlg).checked, rivalsa: $('#t-rivalsa', dlg).checked } });
      $('#inv-preview', dlg).innerHTML =
        `Da mettere da parte: <strong class="money" style="color:var(--tag)">${fmt(c.daParte)}</strong> ` +
        `(imposta ${fmt(c.imposta)} + INPS ${fmt(c.inps)}) · netto <strong class="money pos">${fmt(c.netto)}</strong>`;
    };
    ['t-isinv', 't-bollo', 't-rivalsa'].forEach(id => $('#' + id, dlg).addEventListener('change', invPrev));
    $('#t-amount', dlg).addEventListener('input', invPrev);
    invPrev();

    if (!isNew) $('#t-del', dlg).addEventListener('click', () => {
      dlg.close();
      Dialogs.confirm('Eliminare il movimento?', `"${t.desc}" · ${fmt(t.amount)} verrà cancellato.`, 'Elimina', async () => {
        await DB.deleteTx(t.id); toast('Eliminato'); render();
      });
    });

    $('#t-save', dlg).addEventListener('click', async () => {
      const amount = parseAmountInput($('#t-amount', dlg).value);
      if (!amount || amount <= 0) { toast('Manca l\'importo.'); $('#t-amount', dlg).focus(); return; }
      const desc = $('#t-desc', dlg).value.trim();
      if (!desc) { toast('Manca la descrizione.'); $('#t-desc', dlg).focus(); return; }
      const date = $('#t-date', dlg).value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Data non valida.'); return; }
      const out = {
        ...(tx || {}), desc, date, amount, type,
        account: $('#t-acc', dlg).value || null,
        toAccount: type === 'transfer' ? ($('#t-toacc', dlg).value || null) : null,
        category: type === 'transfer' ? null : ($('#t-cat', dlg).value || null),
        note: $('#t-note', dlg).value.trim() || undefined,
        invoice: (type === 'in' && $('#t-isinv', dlg).checked) ? { bollo: $('#t-bollo', dlg).checked, rivalsa: $('#t-rivalsa', dlg).checked } : null,
      };
      const recur = $('#t-recur', dlg).value;
      if (recur) out.recur = recur; else delete out.recur;
      if (out.invoice && !out.category) out.category = 'fatture';
      delete out.dayUnknown; // se lo tocchi a mano, la data diventa vera
      if (!out.invoice) delete out.invoice;
      if (!out.note) delete out.note;
      const saved = await DB.putTx(out);
      UI.lastAdded = saved.id;
      dlg.close();
      toast(isNew ? 'Segnato ✓' : 'Salvato ✓');
      render();
    });

    setTimeout(() => { if (isNew && !t.amount) $('#t-amount', dlg).focus(); }, 60);
  },

  /* --- anteprima quick add --- */
  quickPreview(p, onSaved) {
    const c = DB.cat(p.category), a = DB.acc(p.account);
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>Ho capito così</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="preview-card" style="width:100%">
          <div class="p-amt money ${p.type === 'in' ? 'pos' : 'neg'}">${p.type === 'in' ? '+' : '-'} ${fmt(p.amount)}</div>
          <div style="font-weight:700;margin-top:2px">${esc(p.desc)}</div>
          <div class="p-meta">
            <span class="badge">${fmtDate(p.date)}</span>
            <span class="badge">${c ? esc(c.icon + ' ' + c.name) : '❓ Senza categoria'}</span>
            <span class="badge">${a ? esc(a.icon + ' ' + a.name) : 'Senza conto'}</span>
            ${p.invoice ? '<span class="badge warn">Fattura</span>' : ''}
          </div>
          ${p.invoice ? `<div class="mut" style="font-size:.83rem;margin-bottom:6px">Da parte: <strong class="money" style="color:var(--tag)">${fmt(DB.invoiceCalc({ amount: p.amount, invoice: p.invoice }).daParte)}</strong></div>` : ''}
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn" id="q-edit">Correggi</button>
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="q-save"><svg class="ic"><use href="#i-check"/></svg> Segna</button>
      </div>`);
    $('#q-save', dlg).addEventListener('click', async () => {
      const saved = await DB.putTx({ desc: p.desc, date: p.date, amount: p.amount, type: p.type, account: p.account, toAccount: null, category: p.category, ...(p.invoice ? { invoice: p.invoice } : {}) });
      UI.lastAdded = saved.id;
      dlg.close();
      if (onSaved) onSaved();
      toast('Segnato ✓');
      render();
    });
    $('#q-edit', dlg).addEventListener('click', () => {
      dlg.close();
      Dialogs.txForm(null, { desc: p.desc, date: p.date, amount: p.amount, type: p.type, account: p.account, category: p.category, invoice: p.invoice || null });
      if (onSaved) onSaved();
    });
  },

  /* --- foto scontrino → Gemini --- */
  photoFlow() {
    if (!DB.state.settings.geminiKey) {
      Dialogs.confirm('Serve la chiave AI', 'Per leggere le foto degli scontrini imposta la API key gratuita di Google Gemini nelle impostazioni.', 'Vai alle impostazioni', () => { location.hash = '#/impostazioni'; });
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      toast('Leggo lo scontrino…');
      try {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const p = await Parser.geminiParse({ apiKey: DB.state.settings.geminiKey, imageBase64: b64, mimeType: f.type, accounts: DB.state.accounts, categories: DB.state.categories });
        Dialogs.quickPreview(p);
      } catch (e) {
        toast(e.message || 'Non sono riuscito a leggere la foto.');
      }
    });
    inp.click();
  },

  /* --- conto --- */
  accountForm(a) {
    const isNew = !a;
    const bal = a ? (DB.balances().get(a.id) || 0) : 0;
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${isNew ? 'Nuovo conto' : esc(a.name)}</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="frow">
          <div class="field" style="flex:0 0 84px"><label for="a-icon">Emoji</label><input id="a-icon" type="text" value="${esc(a?.icon || '🏦')}" maxlength="4" style="text-align:center;font-size:1.2rem"></div>
          <div class="field"><label for="a-name">Nome</label><input id="a-name" type="text" value="${esc(a?.name || '')}" placeholder="Es. Revolut"></div>
        </div>
        <div class="frow">
          <div class="field"><label for="a-kind">Tipo</label>
            <select id="a-kind">
              <option value="bank" ${a?.kind === 'bank' ? 'selected' : ''}>Conto bancario</option>
              <option value="cash" ${a?.kind === 'cash' ? 'selected' : ''}>Contanti</option>
              <option value="card" ${a?.kind === 'card' ? 'selected' : ''}>Carta</option>
            </select></div>
          <div class="field"><label for="a-initial">Saldo iniziale €</label><input id="a-initial" type="text" inputmode="decimal" value="${amountToInput(a?.initial || 0)}">
          </div>
        </div>
        <div class="field" id="wrap-link" ${a?.kind === 'card' ? '' : 'hidden'}>
          <label for="a-link">Collegata al conto</label>
          <select id="a-link">
            <option value="">Nessuno (saldo autonomo)</option>
            ${DB.state.accounts.filter(x => x.kind !== 'card' && !x.archived && x.id !== a?.id).map(x =>
              `<option value="${x.id}" ${a?.linkedTo === x.id ? 'selected' : ''}>${esc(x.icon)} ${esc(x.name)}</option>`).join('')}
          </select>
          <div class="hint">La carta è un'estensione del conto: le sue spese contano sul saldo del conto scelto, la carta non va in negativo per conto suo.</div>
        </div>
        ${isNew || a?.linkedTo ? '' : `
        <div class="field"><label for="a-real">Rettifica: saldo reale di oggi €</label>
          <div class="frow"><input id="a-real" type="text" inputmode="decimal" placeholder="${amountToInput(bal)}">
          <button class="btn" id="a-fix" style="flex:0 0 auto">Rettifica</button></div>
          <div class="hint">Scrivi il saldo vero del conto: creo un movimento di rettifica per far tornare i numeri (ora risulta ${fmt(bal)}).</div>
        </div>`}
      </div>
      <div class="dlg-foot">
        ${isNew ? '' : `<button class="btn danger" id="a-arch">${a.archived ? 'Ripristina' : 'Archivia'}</button>`}
        <span class="spacer"></span>
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="a-save">Salva</button>
      </div>`);

    $('#a-kind', dlg).addEventListener('change', () => {
      $('#wrap-link', dlg).hidden = $('#a-kind', dlg).value !== 'card';
    });

    $('#a-save', dlg).addEventListener('click', async () => {
      const name = $('#a-name', dlg).value.trim();
      if (!name) { toast('Manca il nome.'); return; }
      const initial = parseAmountInput($('#a-initial', dlg).value) ?? 0;
      const kind = $('#a-kind', dlg).value;
      const linkedTo = kind === 'card' ? ($('#a-link', dlg).value || null) : null;
      if (isNew) {
        const id = 'acc-' + Date.now().toString(36);
        DB.state.accounts.push({ id, name, icon: $('#a-icon', dlg).value.trim() || '🏦', kind, initial, archived: false, ...(linkedTo ? { linkedTo } : {}) });
      } else {
        Object.assign(a, { name, icon: $('#a-icon', dlg).value.trim() || a.icon, kind, initial });
        if (linkedTo) a.linkedTo = linkedTo; else delete a.linkedTo;
      }
      await DB.saveAccounts();
      dlg.close(); toast('Conto salvato ✓'); render();
    });

    if (!isNew) {
      $('#a-arch', dlg).addEventListener('click', async () => {
        a.archived = !a.archived;
        await DB.saveAccounts();
        dlg.close(); toast(a.archived ? 'Conto archiviato' : 'Conto ripristinato'); render();
      });
      $('#a-fix', dlg).addEventListener('click', async () => {
        const real = parseAmountInput($('#a-real', dlg).value);
        if (real == null) { toast('Scrivi il saldo reale.'); return; }
        const diff = real - bal;
        if (!diff) { toast('Il saldo torna già ✓'); return; }
        const rcat = DB.state.categories.find(c => /rettific/i.test(c.name) && !c.archived);
        await DB.putTx({ desc: 'Rettifica saldo ' + a.name, date: todayISO(), amount: Math.abs(diff), type: diff > 0 ? 'in' : 'out', account: a.id, toAccount: null, category: rcat ? rcat.id : null, note: 'Rettifica automatica' });
        dlg.close(); toast('Saldo rettificato: ' + fmtS(diff)); render();
      });
    }
  },

  /* --- categoria --- */
  categoryForm(c) {
    const isNew = !c;
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${isNew ? 'Nuova categoria' : esc(c.name)}</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="frow">
          <div class="field" style="flex:0 0 84px"><label for="c-icon">Emoji</label><input id="c-icon" type="text" value="${esc(c?.icon || '🏷️')}" maxlength="4" style="text-align:center;font-size:1.2rem"></div>
          <div class="field"><label for="c-name">Nome</label><input id="c-name" type="text" value="${esc(c?.name || '')}" placeholder="Es. Animali"></div>
        </div>
      </div>
      <div class="dlg-foot">
        ${isNew ? '' : '<button class="btn danger" id="c-arch">Archivia</button>'}
        <span class="spacer"></span>
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="c-save">Salva</button>
      </div>`);
    $('#c-save', dlg).addEventListener('click', async () => {
      const name = $('#c-name', dlg).value.trim();
      if (!name) { toast('Manca il nome.'); return; }
      if (isNew) DB.state.categories.push({ id: 'cat-' + Date.now().toString(36), name, icon: $('#c-icon', dlg).value.trim() || '🏷️', archived: false });
      else Object.assign(c, { name, icon: $('#c-icon', dlg).value.trim() || c.icon });
      await DB.saveCategories();
      dlg.close(); toast('Categoria salvata ✓'); render();
    });
    if (!isNew) $('#c-arch', dlg).addEventListener('click', async () => {
      c.archived = true;
      await DB.saveCategories();
      dlg.close(); toast('Categoria archiviata (i movimenti restano)'); render();
    });
  },

  /* --- periodo personalizzato: da / a --- */
  rangePicker(current, onOk) {
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>Periodo personalizzato</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="frow">
          <div class="field"><label for="rp-from">Dal</label><input id="rp-from" type="date" value="${esc(current?.from || todayISO().slice(0, 8) + '01')}"></div>
          <div class="field"><label for="rp-to">Al</label><input id="rp-to" type="date" value="${esc(current?.to || todayISO())}"></div>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="rp-ok">Applica</button>
      </div>`);
    $('#rp-ok', dlg).addEventListener('click', () => {
      let from = $('#rp-from', dlg).value, to = $('#rp-to', dlg).value;
      if (!from || !to) { toast('Scegli entrambe le date.'); return; }
      if (from > to) [from, to] = [to, from];
      dlg.close();
      onOk(from, to);
    });
  },

  /* --- collegamento Batti: chi sei e su quale conto --- */
  battiPicker(gid, meta) {
    const members = meta.members || [];
    const preselect = members.find(m => /gi[oò]/i.test(m.name || ''))?.id || members[0]?.id;
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>Collega "${esc(meta.name || 'Gruppo')}"</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <div class="field"><label for="bp-member">Chi sei nel gruppo?</label>
          <select id="bp-member">${members.map(m => `<option value="${esc(m.id)}" ${m.id === preselect ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label for="bp-account">Su quale conto registro le spese?</label>
          <select id="bp-account">${DB.state.accounts.filter(a => !a.archived).map(a => `<option value="${a.id}">${esc(a.icon)} ${esc(a.name)}</option>`).join('')}</select>
          <div class="hint">Importo solo le spese <strong>pagate da te</strong>, da oggi in poi, con nota "Importata automaticamente da Batti". Se ne elimini una qui, non viene reimportata.</div>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="bp-ok">Collega</button>
      </div>`);
    $('#bp-ok', dlg).addEventListener('click', async () => {
      const memberId = $('#bp-member', dlg).value;
      DB.state.settings.batti = {
        on: true, groupId: gid, groupName: meta.name || 'Gruppo',
        memberId, memberName: members.find(m => m.id === memberId)?.name || '',
        account: $('#bp-account', dlg).value, fromDate: todayISO(), lastImport: 0,
      };
      await DB.saveSettings();
      dlg.close();
      toast('Batti collegata ✓');
      Batti.importNow().then(n => { if (n) { toast(n + ' spese importate ✓'); } render(); }).catch(() => render());
    });
  },

  /* --- password di sincronizzazione --- */
  syncPassword(onOk, wrongBefore) {
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>Password di sincronizzazione</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <p style="color:var(--ink-2);font-size:.9rem;margin-bottom:14px">${wrongBefore
          ? 'La password non corrisponde a quella usata sull’altro dispositivo. Riprova.'
          : 'Cifra i dati prima che salgano sul tuo Drive. Se è il primo dispositivo, scegline una nuova; se hai già attivato la sync altrove, usa la <strong>stessa</strong>.'}</p>
        <div class="field"><label for="sy-pw">Password</label><input id="sy-pw" type="password" autocomplete="off"></div>
      </div>
      <div class="dlg-foot">
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="sy-pw-ok">Avanti</button>
      </div>`);
    $('#sy-pw-ok', dlg).addEventListener('click', () => {
      const pw = $('#sy-pw', dlg).value;
      if (pw.length < 6) { toast('Minimo 6 caratteri.'); return; }
      dlg.close();
      onOk(pw);
    });
    setTimeout(() => $('#sy-pw', dlg).focus(), 60);
  },

  /* --- password per backup --- */
  passwordFlow(mode, file) {
    const isExp = mode === 'export';
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${isExp ? 'Backup cifrato' : 'Importa backup'}</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body">
        <p style="color:var(--chalk-2);font-size:.9rem;margin-bottom:14px">${isExp
          ? 'Scegli una password: servirà per riaprire il backup. Se la perdi, il file è illeggibile per sempre (è il punto).'
          : 'Attenzione: l\'import sostituisce tutti i dati attuali con quelli del backup.'}</p>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="${isExp ? 'new-password' : 'current-password'}"></div>
        ${isExp ? '<div class="field"><label for="pw2">Ripeti password</label><input id="pw2" type="password" autocomplete="new-password"></div>' : ''}
      </div>
      <div class="dlg-foot">
        <button class="btn dlg-close">Annulla</button>
        <button class="btn primary" id="pw-ok">${isExp ? 'Esporta' : 'Importa'}</button>
      </div>`);
    $('#pw-ok', dlg).addEventListener('click', async () => {
      const pw = $('#pw', dlg).value;
      if (pw.length < 6) { toast('Minimo 6 caratteri.'); return; }
      if (isExp && pw !== $('#pw2', dlg).value) { toast('Le password non coincidono.'); return; }
      const btn = $('#pw-ok', dlg);
      btn.disabled = true; btn.textContent = isExp ? 'Cifro…' : 'Apro…';
      try {
        if (isExp) {
          const name = await Backup.exportEncrypted(pw);
          dlg.close(); toast('Backup salvato: ' + name);
        } else {
          const j = await Backup.importEncrypted(file, pw);
          dlg.close();
          Dialogs.confirm('Sostituire i dati?', `Il backup contiene ${j.tx.length} movimenti (esportato il ${new Date(j.exportedAt).toLocaleDateString('it-IT')}). I dati attuali verranno sostituiti.`, 'Importa', async () => {
            await Backup.applyBackup(j);
            toast('Backup importato ✓'); location.hash = '#/'; render();
          });
        }
      } catch (e) {
        btn.disabled = false; btn.textContent = isExp ? 'Esporta' : 'Importa';
        toast(e.message);
      }
    });
    setTimeout(() => $('#pw', dlg).focus(), 60);
  },
};

/* ---------- avvio ---------- */
(async function boot() {
  // anti-clickjacking: GitHub Pages non manda X-Frame-Options e frame-ancestors
  // non vale dentro il tag meta, quindi lo facciamo qui: se qualcuno incornicia
  // l'app in un suo sito per rubare i clic, la portiamo in primo piano.
  if (window.top !== window.self) { try { window.top.location = window.self.location; } catch { document.documentElement.innerHTML = ''; } }

  // password d'ingresso: senza, l'app non parte nemmeno (dati mai caricati)
  await Gate.boot();

  // subito: se il blocco e' attivo, lo schermo si copre prima dei dati;
  // finito il rilevamento, aggiorna le impostazioni se sono in vista
  AppLock.boot().then(() => { if (UI.route === 'impostazioni') render(); });

  try {
    await DB.init();
  } catch (e) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif;color:#f2efe6">Errore di avvio: ' + esc(e.message) + '</p>';
    return;
  }
  // solo per i test: ?autoseed importa il seed senza passare dal benvenuto
  if (!DB.state.seeded && DB.state.tx.length === 0 && new URLSearchParams(location.search).has('autoseed')) {
    try {
      const seed = await (await fetch('seed/seed-data.json')).json();
      await DB.putTxBulk(seed.tx);
      await DB.markSeeded();
    } catch { /* ignora: resta il benvenuto */ }
  }

  // auto-cura: le rettifiche di saldo senza categoria (o con categoria rimossa)
  // adottano la categoria "Rettifiche" del dispositivo, qualunque sia il suo id
  try {
    const rcat = DB.state.categories.find(c => /rettific/i.test(c.name) && !c.archived);
    if (rcat) {
      for (const t of [...DB.state.tx]) {
        if (/^rettifica saldo/i.test(t.desc || '') && (!t.category || !DB.cat(t.category))) {
          await DB.putTx({ ...t, category: rcat.id });
        }
      }
    }
  } catch { /* non bloccare l'avvio */ }

  // ricorrenze: marca le voci "Ricorrente mensile/annuale" del foglio e crea le occorrenze dovute
  try {
    await DB.migrateRecurringNotes();
    const created = await DB.materializeRecurring();
    if (created > 0) setTimeout(() => toast(created + (created === 1 ? ' movimento ricorrente creato' : ' movimenti ricorrenti creati')), 600);
    const mosse = await allineaContoScadenze();
    if (mosse > 0) setTimeout(() => toast(`${mosse} scadenz${mosse === 1 ? 'a spostata' : 'e spostate'} su ${DB.acc(contoTasse())?.name || 'il conto delle tasse'}`), 1200);
  } catch { /* non bloccare l'avvio */ }

  $('#app').hidden = false;
  window.addEventListener('hashchange', navigate);
  $('#btn-add').addEventListener('click', () => Dialogs.txForm(null));
  $('#btn-add-desk').addEventListener('click', () => Dialogs.txForm(null));
  // delega sul documento: il bottone impostazioni funziona anche se il boot parziale fallisse
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('#btn-settings')) location.hash = '#/impostazioni';
  });
  navigate();
  Sync.boot();
  Sync.onChange(() => {
    const sp = $('#sync-spin');
    if (sp) sp.hidden = Sync.state.status !== 'sync';
    if (UI.route === 'impostazioni') render();
  });
  Batti.boot();
  checkPromemoria();
  checkFiscozen();

  // anti-cache: se online esiste una versione piu' nuova, ripulisci e ricarica da solo.
  // La query unica e' essenziale: la CDN di GitHub Pages tiene i file fino a ~10 minuti
  // e con l'URL nudo servirebbe la versione vecchia anche a cache locale pulita.
  async function checkForUpdate(manual) {
    try {
      const txt = await (await fetch('sw.js?t=' + Date.now(), { cache: 'no-store' })).text();
      const m = txt.match(/soldi-(v\d+)/);
      if (!m) return;
      if (m[1] === APP_VERSION) { if (manual) toast('Sei già all\'ultima versione (' + APP_VERSION + ')'); return; }
      const k = 'upd-' + m[1];
      if (!manual && Date.now() - (+sessionStorage.getItem(k) || 0) < 60000) return; // riprova al massimo ogni minuto
      sessionStorage.setItem(k, String(Date.now()));
      toast('Installo la versione ' + m[1] + '…');
      await hardRefresh(false);
    } catch { if (manual) toast('Nessuna rete: riprovo più tardi.'); }
  }
  window.checkForUpdate = checkForUpdate;
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkForUpdate(); } });

  // tira-per-aggiornare: nelle PWA installate il gesto non esiste, lo forniamo noi
  const ptr = document.createElement('div');
  ptr.id = 'ptr';
  ptr.textContent = '↻ Rilascia per aggiornare';
  document.body.appendChild(ptr);
  let pullStart = null, pullReady = false;
  document.addEventListener('touchstart', e => {
    pullStart = (window.scrollY === 0 && !document.querySelector('dialog[open]')) ? e.touches[0].clientY : null;
    pullReady = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (pullStart == null) return;
    const d = e.touches[0].clientY - pullStart;
    pullReady = d > 90;
    ptr.classList.toggle('show', d > 30);
    ptr.classList.toggle('ready', pullReady);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    ptr.classList.remove('show', 'ready');
    if (pullReady) { pullReady = false; toast('Aggiorno…'); hardRefresh(false); }
    pullStart = null;
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // quando una nuova versione prende il controllo, ricarica una volta sola:
    // gli aggiornamenti arrivano alla prima riapertura invece che alla seconda
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('sw-reloaded')) return;
      sessionStorage.setItem('sw-reloaded', '1');
      location.reload();
    });
  }
})();
