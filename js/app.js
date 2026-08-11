/* app.js - Soldi, la lavagna. Router, viste, dialog. */
'use strict';

/* ---------- helpers ---------- */
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmt = c => EUR.format(c / 100);
const fmtS = c => (c > 0 ? '+' : c < 0 ? '-' : '') + EUR.format(Math.abs(c) / 100);
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESI_S = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
function catColorSlots() {
  const tot = new Map();
  for (const t of DB.state.tx) {
    if (t.type !== 'out' || !t.category) continue;
    tot.set(t.category, (tot.get(t.category) || 0) + t.amount);
  }
  const slots = new Map();
  [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([id], i) => slots.set(id, i));
  return slots;
}

// fette del donut per un filtro periodo: colori stabili, resto in "Altro"
function donutSlices(filt) {
  const byCat = new Map();
  for (const t of DB.state.tx) {
    if (t.type !== 'out') continue;
    if (filt.ym && !t.date.startsWith(filt.ym)) continue;
    if (filt.y && !t.date.startsWith(filt.y)) continue;
    const k = t.category || '__none__';
    byCat.set(k, (byCat.get(k) || 0) + t.amount);
  }
  const slots = catColorSlots();
  const named = [], rest = [];
  for (const [id, v] of byCat) {
    if (slots.has(id)) named.push({ id, label: DB.cat(id)?.name || id, value: v, color: Charts.SERIES_CSS[slots.get(id)] });
    else rest.push({ id, v });
  }
  named.sort((a, b) => b.value - a.value);
  if (rest.length) {
    const others = rest.filter(r => r.id !== '__none__');
    const nocat = rest.find(r => r.id === '__none__');
    if (others.length) named.push({ id: '__other__', label: 'Altro (' + others.length + ')', value: others.reduce((s, r) => s + r.v, 0), color: 'var(--s-other)' });
    if (nocat) named.push({ id: '__none__', label: 'Senza categoria', value: nocat.v, color: 'var(--s-none)' });
  }
  return named.filter(s => s.value > 0);
}

/* ---------- stato UI ---------- */
const UI = {
  route: 'home',
  mov: { ym: todayISO().slice(0, 7), account: null, category: null, search: '', type: null },
  fatYear: new Date().getFullYear(),
  stat: { ym: todayISO().slice(0, 7), scope: 'month', table: false },
  lastAdded: null,
};

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
    const ym = todayISO().slice(0, 7);
    const m = DB.sums({ ym });
    const y = new Date().getFullYear();
    const daParte = DB.invoicesOfYear(y).reduce((s, t) => s + DB.invoiceCalc(t).daParte, 0);
    const recent = DB.state.tx.slice(0, matchMedia('(min-width: 920px)').matches ? 11 : 6);
    const noCat = DB.state.tx.filter(t => !t.category && t.type !== 'transfer').length;

    return `<div class="home-grid"><div class="colA">
      <section class="hero">
        <div class="label">In cassa adesso</div>
        <div class="total money">${fmt(total)}</div>
        <div class="underline" aria-hidden="true"></div>
        <div class="monthline">
          <span>${MESI[+ym.slice(5) - 1]}:</span>
          <span class="m-eq">
            <span class="pos money"><svg class="ic tri" aria-hidden="true"><use href="#i-tri-up"/></svg> ${fmt(m.in)}</span>
            <span class="neg money"><svg class="ic tri" aria-hidden="true"><use href="#i-tri-down"/></svg> ${fmt(m.out)}</span>
            <span class="money ${m.in - m.out >= 0 ? 'pos' : 'neg'}">= ${fmtS(m.in - m.out)}</span>
          </span>
        </div>
      </section>

      <div class="tags-row" role="list">
        ${DB.state.accounts.filter(a => !a.archived).map((a, i) => `
          <button class="tag-card" role="listitem" style="--tilt:${[-1.2, .8, -.6, 1.1][i % 4]}deg" data-acc="${a.id}">
            <span class="t-name">${esc(a.icon)} ${esc(a.name)}</span>
            <span class="t-amount money ${bal.get(a.id) < 0 ? 'neg' : ''}">${fmt(bal.get(a.id) || 0)}</span>
          </button>`).join('')}
      </div>

      <button class="setaside" data-goto="fatture">
        <svg class="ic"><use href="#i-invoice"/></svg>
        <span style="flex:1">
          <span class="s-label">Da mettere da parte per tasse e INPS · ${y}</span><br>
          <span class="s-val money">${fmt(daParte)}</span>
        </span>
        <svg class="ic" style="width:18px;color:var(--chalk-3)"><use href="#i-right"/></svg>
      </button>

      ${noCat ? `<button class="badge warn" id="fix-nocat" style="margin-top:12px;cursor:pointer;font-family:inherit">
        <svg class="ic" style="width:14px;height:14px"><use href="#i-alert"/></svg> ${noCat} movimenti senza categoria - sistemali</button>` : ''}
      </div><div class="colB">

      <h3 class="rule">Ultimi movimenti</h3>
      <ul class="txlist">${recent.length ? recent.map(t => Views.txRow(t)).join('') : `
        <li class="empty"><div class="e-marker">Tutto in ordine</div>Scrivi la prima spesa qui sotto.</li>`}
      </ul>

      <form class="quickbar" id="quickform">
        <input id="quickinput" type="text" placeholder='Scrivi qui: "12,50 pizza contanti"…' autocomplete="off" aria-label="Aggiunta veloce">
        <button type="button" class="iconbtn" id="quickphoto" aria-label="Foto scontrino"><svg class="ic"><use href="#i-camera"/></svg></button>
        <button type="submit" class="iconbtn primary" aria-label="Aggiungi"><svg class="ic"><use href="#i-send"/></svg></button>
      </form>
      </div></div>`;
  },
  bindHome(root) {
    $$('.tag-card', root).forEach(b => b.addEventListener('click', () => {
      UI.mov = { ym: null, account: b.dataset.acc, category: null, search: '', type: null };
      location.hash = '#/movimenti';
    }));
    $('[data-goto="fatture"]', root).addEventListener('click', () => location.hash = '#/fatture');
    const fx = $('#fix-nocat', root);
    if (fx) fx.addEventListener('click', () => { UI.mov = { ym: null, account: null, category: '__none__', search: '', type: null }; location.hash = '#/movimenti'; });
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
    return `<li><button class="txrow ${UI.lastAdded === t.id ? 'is-new' : ''}" data-id="${t.id}">
      <span class="t-emoji" aria-hidden="true" style="${catDisc(t.category)}">${icon}</span>
      <span class="t-main">
        <span class="t-desc">${esc(t.desc)}${t.invoice ? ' <span class="badge" style="font-size:.62rem;padding:1px 7px">FATTURA</span>' : ''}</span>
        <span class="t-sub">${sub}</span>
      </span>
      <span class="t-amt money ${cls}">${sign} ${fmt(t.amount)}</span>
    </button></li>`;
  },

  /* ===== movimenti ===== */
  movimenti() {
    const f = UI.mov;
    let list = DB.state.tx.filter(t => {
      if (f.ym && !t.date.startsWith(f.ym)) return false;
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
    const tin = list.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const tout = list.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);

    // raggruppa per giorno
    const groups = [];
    let cur = null;
    for (const t of list) {
      const key = t.dayUnknown ? t.date.slice(0, 7) + '-??' : t.date;
      if (!cur || cur.key !== key) { cur = { key, date: t.date, dayUnknown: t.dayUnknown, items: [] }; groups.push(cur); }
      cur.items.push(t);
    }

    const [yy, mm] = (f.ym || todayISO().slice(0, 7)).split('-').map(Number);
    const periodLabel = f.ym ? `${MESI[mm - 1]} ${yy}` : 'Tutto';

    return `
      <h2 class="viewtitle">Movimenti</h2>
      <div class="subtitle">${list.length} moviment${list.length === 1 ? 'o' : 'i'} ·
        <span class="pos money">+${fmt(tin)}</span> · <span class="neg money">-${fmt(tout)}</span></div>

      <div class="periodnav">
        <button class="iconbtn" id="m-prev" aria-label="Mese precedente" ${f.ym ? '' : 'disabled'}><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${periodLabel}</span>
        <button class="iconbtn" id="m-next" aria-label="Mese successivo" ${f.ym ? '' : 'disabled'}><svg class="ic"><use href="#i-right"/></svg></button>
        <button class="chip" id="m-all" aria-pressed="${!f.ym}">Tutto</button>
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
    const shift = dir => {
      const [y, m] = UI.mov.ym.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      UI.mov.ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      render();
    };
    $('#m-prev', root).addEventListener('click', () => shift(-1));
    $('#m-next', root).addEventListener('click', () => shift(1));
    $('#m-all', root).addEventListener('click', () => { UI.mov.ym = UI.mov.ym ? null : todayISO().slice(0, 7); render(); });
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

    return `
      <h2 class="viewtitle">Fatture</h2>
      <div class="subtitle">Regime forfettario · coefficiente ${Math.round(s.coeff * 100)}% · imposta ${Math.round(s.imposta * 100)}% · INPS ${(s.inps * 100).toFixed(2).replace(/\.?0+$/, '')}%</div>

      <div class="periodnav">
        <button class="iconbtn" id="f-prev" aria-label="Anno precedente"><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${y}</span>
        <button class="iconbtn" id="f-next" aria-label="Anno successivo"><svg class="ic"><use href="#i-right"/></svg></button>
        <button class="btn primary" id="f-add" style="margin-left:auto"><svg class="ic"><use href="#i-plus"/></svg> Fattura</button>
      </div>

      ${invs.length === 0 ? `<div class="empty"><svg class="ic"><use href="#i-invoice"/></svg>
        <div class="e-marker">Nessuna fattura nel ${y}</div>Quando incassi una fattura, segnala qui: il conto delle tasse si fa da solo.</div>` : `

      <div class="tags-row" style="padding-top:2px">
        <div class="tag-card" style="--tilt:-.7deg;cursor:default"><span class="t-name">Fatturato lordo</span><span class="t-amount money">${fmt(tot('lordo'))}</span></div>
        <div class="tag-card" style="--tilt:.6deg;cursor:default"><span class="t-name">Netto (dopo accantonamenti)</span><span class="t-amount money pos">${fmt(tot('netto'))}</span></div>
        <div class="tag-card" style="--tilt:-.5deg;cursor:default;outline:1px dashed rgba(242,201,76,.5)"><span class="t-name" style="color:var(--tag)">Da mettere da parte</span><span class="t-amount money" style="color:var(--tag)">${fmt(tot('daParte'))}</span></div>
        <div class="tag-card" style="--tilt:.8deg;cursor:default"><span class="t-name">di cui imposta ${Math.round(s.imposta * 100)}%</span><span class="t-amount money">${fmt(tot('imposta'))}</span></div>
        <div class="tag-card" style="--tilt:-.9deg;cursor:default"><span class="t-name">di cui INPS</span><span class="t-amount money">${fmt(tot('inps'))}</span></div>
      </div>

      <h3 class="rule">Le fatture del ${y}</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Fattura</th><th scope="col">Lordo</th><th scope="col">Da parte</th><th scope="col">Netto</th><th scope="col">Imposta</th><th scope="col">INPS</th><th scope="col" class="hm">Bollo</th><th scope="col" class="hm">Rivalsa 4%</th></tr></thead>
        <tbody>
          ${calcs.map(({ t, c }) => `<tr data-id="${t.id}" style="cursor:pointer" title="Modifica">
            <td><strong>${esc(t.desc)}</strong><br><span class="mut" style="font-size:.74rem">${fmtDate(t.date, t.dayUnknown)}</span></td>
            <td class="money">${fmt(c.lordo)}</td>
            <td class="money" style="color:var(--tag)">${fmt(c.daParte)}</td>
            <td class="money pos">${fmt(c.netto)}</td>
            <td class="money">${fmt(c.imposta)}</td>
            <td class="money">${fmt(c.inps)}</td>
            <td class="money hm">${c.bollo ? fmt(c.bollo) : '-'}</td>
            <td class="money hm">${c.rivalsaAmt ? fmt(c.rivalsaAmt) : '-'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Totale ${y}</td>
          <td class="money">${fmt(tot('lordo'))}</td>
          <td class="money" style="color:var(--tag)">${fmt(tot('daParte'))}</td>
          <td class="money pos">${fmt(tot('netto'))}</td>
          <td class="money">${fmt(tot('imposta'))}</td><td class="money">${fmt(tot('inps'))}</td>
          <td class="money hm">${fmt(tot('bollo'))}</td><td class="money hm">${fmt(tot('rivalsaAmt'))}</td></tr></tfoot>
      </table></div>

      <h3 class="rule">Mese per mese</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Mese</th><th scope="col">N.</th><th scope="col">Lordo</th><th scope="col">Onorario</th><th scope="col">Imposta</th><th scope="col">INPS</th><th scope="col">Da parte</th><th scope="col">Netto</th></tr></thead>
        <tbody>${perMonth.map(r => `<tr>
          <td>${MESI[r.m]}</td><td class="money">${r.n}</td>
          <td class="money">${fmt(r.lordo)}</td><td class="money">${fmt(r.onorario)}</td>
          <td class="money">${fmt(r.imposta)}</td><td class="money">${fmt(r.inps)}</td>
          <td class="money" style="color:var(--tag)">${fmt(r.daParte)}</td><td class="money pos">${fmt(r.netto)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`}

      <p class="mut" style="font-size:.78rem;margin-top:14px">I calcoli replicano il tuo foglio: accantonamento = imposta + INPS sull'imponibile (lordo - bollo) × coefficiente. Percentuali modificabili nelle <a href="#/impostazioni" style="color:var(--chalk-2)">impostazioni</a> - verificale col commercialista.</p>`;
  },
  bindFatture(root) {
    $('#f-prev', root).addEventListener('click', () => { UI.fatYear--; render(); });
    $('#f-next', root).addEventListener('click', () => { UI.fatYear++; render(); });
    $('#f-add', root).addEventListener('click', () => Dialogs.txForm(null, { type: 'in', category: 'fatture', invoice: { bollo: true, rivalsa: false } }));
    $$('tbody tr[data-id]', root).forEach(r => r.addEventListener('click', () => Dialogs.txForm(DB.state.tx.find(t => t.id === r.dataset.id))));
  },

  /* ===== statistiche ===== */
  statistiche() {
    const st = UI.stat;
    const [y, m] = st.ym.split('-').map(Number);
    const filt = st.scope === 'month' ? { ym: st.ym } : { y: String(y) };
    const periodLabel = st.scope === 'month' ? `${MESI[m - 1]} ${y}` : String(y);

    // spese per categoria (colori stabili per categoria)
    const slices = donutSlices(filt);
    const totOut = slices.reduce((s, x) => s + x.value, 0);

    // barre dell'anno
    const months = MESI_S.map((lbl, i) => {
      const ym = y + '-' + String(i + 1).padStart(2, '0');
      const s = DB.sums({ ym });
      return { label: lbl, in: s.in, out: s.out };
    });
    const ytot = DB.sums({ y: String(y) });

    return `
      <h2 class="viewtitle">Statistiche</h2>
      <div class="subtitle">Come si muovono i soldi</div>

      <div class="periodnav">
        <button class="iconbtn" id="s-prev" aria-label="Periodo precedente"><svg class="ic"><use href="#i-left"/></svg></button>
        <span class="p-label">${periodLabel}</span>
        <button class="iconbtn" id="s-next" aria-label="Periodo successivo"><svg class="ic"><use href="#i-right"/></svg></button>
        <button class="chip" id="s-scope" aria-pressed="${st.scope === 'year'}">Anno intero</button>
        <button class="chip" id="s-table" aria-pressed="${st.table}">Tabella</button>
      </div>

      <div class="stats-grid">
      <div class="chartcard">
        <h4>Dove vanno (uscite per categoria)</h4>
        <div class="c-sub">${periodLabel} · totale <strong class="money">${fmt(totOut)}</strong></div>
        <div id="donut"></div>
        ${totOut === 0 ? '<div class="empty" style="padding:18px">Nessuna uscita nel periodo.</div>' : `
        <div class="legend" role="list">
          ${slices.map(s2 => `<button class="lg-row" role="listitem" data-cat="${s2.id}">
            <span class="swatch" style="background:${s2.color}"></span>
            <span class="lg-name">${esc(s2.label)}</span>
            <span class="lg-val money">${fmt(s2.value)}</span>
            <span class="lg-pct money">${Math.round(s2.value / totOut * 100)}%</span>
          </button>`).join('')}
        </div>`}
      </div>

      <div class="chartcard">
        <h4>Entrate e uscite · ${y}</h4>
        <div class="c-sub"><span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--s3)"></span> Entrate ${fmt(ytot.in)} &nbsp;
          <span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--s2)"></span> Uscite ${fmt(ytot.out)} &nbsp;·&nbsp; saldo <strong class="money ${ytot.in - ytot.out >= 0 ? 'pos' : 'neg'}">${fmtS(ytot.in - ytot.out)}</strong></div>
        <div id="barchart"></div>
      </div>
      </div>

      ${st.table ? `
      <h3 class="rule">Tabella · ${periodLabel}</h3>
      <div class="tablewrap"><table class="sheet">
        <thead><tr><th scope="col">Categoria</th><th scope="col">Uscite</th><th scope="col">Quota</th></tr></thead>
        <tbody>${slices.map(s2 => `<tr><td>${esc(s2.label)}</td><td class="money">${fmt(s2.value)}</td><td class="money">${totOut ? Math.round(s2.value / totOut * 100) : 0}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Totale</td><td class="money">${fmt(totOut)}</td><td></td></tr></tfoot>
      </table></div>
      <div class="tablewrap" style="margin-top:12px"><table class="sheet">
        <thead><tr><th scope="col">Mese</th><th scope="col">Entrate</th><th scope="col">Uscite</th><th scope="col">Saldo</th></tr></thead>
        <tbody>${months.map(mo => `<tr><td>${mo.label}</td><td class="money">${fmt(mo.in)}</td><td class="money">${fmt(mo.out)}</td><td class="money ${mo.in - mo.out >= 0 ? 'pos' : 'neg'}">${fmtS(mo.in - mo.out)}</td></tr>`).join('')}</tbody>
      </table></div>` : ''}`;
  },
  bindStatistiche(root) {
    const st = UI.stat;
    const shift = dir => {
      if (st.scope === 'month') {
        const [y, m] = st.ym.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        st.ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      } else {
        const [y] = st.ym.split('-').map(Number);
        st.ym = (y + dir) + st.ym.slice(4);
      }
      render();
    };
    $('#s-prev', root).addEventListener('click', () => shift(-1));
    $('#s-next', root).addEventListener('click', () => shift(1));
    $('#s-scope', root).addEventListener('click', () => { st.scope = st.scope === 'month' ? 'year' : 'month'; render(); });
    $('#s-table', root).addEventListener('click', () => { st.table = !st.table; render(); });

    // grafici
    const [y, m] = st.ym.split('-').map(Number);
    const donutEl = $('#donut', root);
    const legendRows = $$('.lg-row', root);
    const filt = st.scope === 'month' ? { ym: st.ym } : { y: String(y) };
    const real = donutSlices(filt);
    const totOut = real.reduce((s, x) => s + x.value, 0);
    if (donutEl && totOut) Charts.donut(donutEl, real, { centerLabel: 'Uscite', centerValue: fmt(totOut), fmt });

    legendRows.forEach(r => r.addEventListener('click', () => {
      const id = r.dataset.cat;
      if (id === '__other__') return;
      UI.mov = { ym: st.scope === 'month' ? st.ym : null, account: null, category: id === '__none__' ? '__none__' : id, search: '', type: 'out' };
      location.hash = '#/movimenti';
    }));

    const months = MESI_S.map((lbl, i) => {
      const ym = y + '-' + String(i + 1).padStart(2, '0');
      const s = DB.sums({ ym });
      return { label: lbl, in: s.in, out: s.out };
    });
    Charts.bars($('#barchart', root), months, {
      fmt,
      onBarClick: i => { st.scope = 'month'; st.ym = y + '-' + String(i + 1).padStart(2, '0'); render(); },
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
          <div class="rowitem ${a.archived ? 'mut' : ''}">
            <span style="font-size:1.1rem">${esc(a.icon)}</span>
            <span class="r-main"><span class="r-name">${esc(a.name)}${a.archived ? ' (archiviato)' : ''}</span>
            <span class="r-sub money">Saldo: ${fmt(bal.get(a.id) || 0)}</span></span>
            <button class="iconbtn" data-accedit="${a.id}" aria-label="Modifica ${esc(a.name)}"><svg class="ic"><use href="#i-edit"/></svg></button>
          </div>`).join('')}
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
        <h4>Backup e dati</h4>
        <div class="s-desc">Il backup è un file cifrato con una password che scegli tu: salvalo dove vuoi, ad esempio sul tuo Google Drive. Senza password nessuno lo apre.</div>
        <div class="chip-row" style="margin:0">
          <button class="btn" id="bk-export"><svg class="ic"><use href="#i-down"/></svg> Esporta backup cifrato</button>
          <button class="btn" id="bk-import"><svg class="ic"><use href="#i-up"/></svg> Importa backup</button>
          <button class="btn" id="bk-csv">Esporta CSV</button>
        </div>
        <input type="file" id="bk-file" accept=".soldi" hidden>
      </div>

      <div class="setcard" style="border-color:rgba(230,103,103,.35)">
        <h4 style="color:var(--danger)">Zona a rischio</h4>
        <div class="s-desc">Cancella tutti i dati da questo dispositivo. Irreversibile (fai prima un backup).</div>
        <button class="btn danger" id="wipe">Cancella tutto</button>
      </div>

      <p class="mut" style="font-size:.76rem;padding:4px 2px 20px">Soldi non ha server: i dati vivono in questo browser (IndexedDB), i backup sono cifrati AES-256. Versione 1.0</p>`;
  },
  bindImpostazioni(root) {
    $$('[data-accedit]', root).forEach(b => b.addEventListener('click', () => Dialogs.accountForm(DB.acc(b.dataset.accedit))));
    $('#acc-add', root).addEventListener('click', () => Dialogs.accountForm(null));
    $$('[data-catedit]', root).forEach(b => b.addEventListener('click', () => Dialogs.categoryForm(DB.cat(b.dataset.catedit))));
    $('#cat-add', root).addEventListener('click', () => Dialogs.categoryForm(null));

    $('#fisco-form', root).addEventListener('submit', async e => {
      e.preventDefault();
      const s = DB.state.settings;
      s.imposta = (+$('#fx-imposta').value || 0) / 100;
      s.inps = (+$('#fx-inps').value || 0) / 100;
      s.coeff = (+$('#fx-coeff').value || 0) / 100;
      s.bollo = Math.round((+$('#fx-bollo').value || 0) * 100);
      await DB.saveSettings();
      toast('Parametri fiscali salvati ✓');
      render();
    });

    $('#ai-save', root).addEventListener('click', async () => {
      DB.state.settings.geminiKey = $('#ai-key').value.trim();
      await DB.saveSettings();
      toast(DB.state.settings.geminiKey ? 'Chiave salvata ✓' : 'Chiave rimossa');
    });

    $('#bk-export', root).addEventListener('click', () => Dialogs.passwordFlow('export'));
    $('#bk-import', root).addEventListener('click', () => $('#bk-file').click());
    $('#bk-file', root).addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) Dialogs.passwordFlow('import', f);
      e.target.value = '';
    });
    $('#bk-csv', root).addEventListener('click', () => { Backup.exportCSV(); toast('CSV esportato ✓'); });

    $('#wipe', root).addEventListener('click', () => Dialogs.confirm(
      'Cancellare tutto?',
      'Tutti i movimenti, i conti e le impostazioni verranno eliminati da questo dispositivo. Non si può annullare.',
      'Sì, cancella tutto',
      async () => { await DB.wipeAll(); toast('Dati cancellati'); location.hash = '#/'; render(); }
    ));
  },
};

/* ---------- dialogs ---------- */
const Dialogs = {
  open(html, cls = '') {
    const holder = $('#dialogs');
    holder.innerHTML = `<dialog class="${cls}">${html}</dialog>`;
    const dlg = holder.firstElementChild;
    dlg.addEventListener('close', () => { holder.innerHTML = ''; });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    $$('.dlg-close', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.showModal();
    return dlg;
  },

  confirm(title, body, okLabel, onOk) {
    const dlg = Dialogs.open(`
      <div class="dlg-head"><h2>${esc(title)}</h2><button class="iconbtn dlg-close" aria-label="Chiudi"><svg class="ic"><use href="#i-x"/></svg></button></div>
      <div class="dlg-body"><p style="color:var(--chalk-2)">${esc(body)}</p></div>
      <div class="dlg-foot"><button class="btn ghost dlg-close">Annulla</button><button class="btn danger" id="c-ok">${esc(okLabel)}</button></div>`);
    $('#c-ok', dlg).addEventListener('click', async () => { dlg.close(); await onOk(); });
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
        <div class="field"><label for="t-note">Nota (facoltativa)</label><input id="t-note" type="text" value="${esc(t.note || '')}" autocomplete="off"></div>
      </div>
      <div class="dlg-foot">
        ${isNew ? '' : '<button class="btn danger" id="t-del"><svg class="ic"><use href="#i-trash"/></svg> Elimina</button>'}
        <span class="spacer"></span>
        <button class="btn ghost dlg-close">Annulla</button>
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
        <button class="btn ghost" id="q-edit">Correggi</button>
        <span class="spacer"></span>
        <button class="btn ghost dlg-close">Annulla</button>
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
        ${isNew ? '' : `
        <div class="field"><label for="a-real">Rettifica: saldo reale di oggi €</label>
          <div class="frow"><input id="a-real" type="text" inputmode="decimal" placeholder="${amountToInput(bal)}">
          <button class="btn" id="a-fix" style="flex:0 0 auto">Rettifica</button></div>
          <div class="hint">Scrivi il saldo vero del conto: creo un movimento di rettifica per far tornare i numeri (ora risulta ${fmt(bal)}).</div>
        </div>`}
      </div>
      <div class="dlg-foot">
        ${isNew ? '' : `<button class="btn danger" id="a-arch">${a.archived ? 'Ripristina' : 'Archivia'}</button>`}
        <span class="spacer"></span>
        <button class="btn ghost dlg-close">Annulla</button>
        <button class="btn primary" id="a-save">Salva</button>
      </div>`);

    $('#a-save', dlg).addEventListener('click', async () => {
      const name = $('#a-name', dlg).value.trim();
      if (!name) { toast('Manca il nome.'); return; }
      const initial = parseAmountInput($('#a-initial', dlg).value) ?? 0;
      if (isNew) {
        const id = 'acc-' + Date.now().toString(36);
        DB.state.accounts.push({ id, name, icon: $('#a-icon', dlg).value.trim() || '🏦', kind: $('#a-kind', dlg).value, initial, archived: false });
      } else {
        Object.assign(a, { name, icon: $('#a-icon', dlg).value.trim() || a.icon, kind: $('#a-kind', dlg).value, initial });
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
        await DB.putTx({ desc: 'Rettifica saldo ' + a.name, date: todayISO(), amount: Math.abs(diff), type: diff > 0 ? 'in' : 'out', account: a.id, toAccount: null, category: null, note: 'Rettifica automatica' });
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
        <button class="btn ghost dlg-close">Annulla</button>
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
        <button class="btn ghost dlg-close">Annulla</button>
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

  $('#app').hidden = false;
  window.addEventListener('hashchange', navigate);
  $('#btn-add').addEventListener('click', () => Dialogs.txForm(null));
  navigate();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
