/* charts.js - donut categoria + barre mensili, SVG puro. */
'use strict';

const Charts = (() => {
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  const OTHER = 'var(--s-other)';
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, children = []) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const c of children) e.appendChild(c);
    return e;
  }

  let tooltipEl = null;
  function tooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function showTip(evt, title, value) {
    const t = tooltip();
    t.innerHTML = `<div class="tt-t"></div><div class="tt-v"></div>`;
    t.firstChild.textContent = title;
    t.lastChild.textContent = value;
    t.style.display = 'block';
    const x = Math.min(evt.clientX + 14, window.innerWidth - 190);
    const y = Math.max(evt.clientY - 44, 8);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tooltipEl) tooltipEl.style.display = 'none'; }

  /* ---------- donut ----------
     slices: [{label, value(cents), color?}] già ordinate; > 8 → fold in "Altro" a monte. */
  function donut(container, slices, { centerLabel, centerValue, fmt }) {
    container.textContent = '';
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (!total) return false;

    const size = 220, cx = size / 2, cy = size / 2, r = 78, sw = 30;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': centerLabel + ' per categoria', style: 'max-width:240px;width:100%;height:auto;display:block;margin:0 auto' });
    const C = 2 * Math.PI * r;
    const gapPx = slices.length > 1 ? 2.5 : 0;
    let offset = -C / 4; // parte da ore 12

    slices.forEach((s, i) => {
      const frac = s.value / total;
      const arc = Math.max(frac * C - gapPx, 0.5);
      const circle = el('circle', {
        cx, cy, r, fill: 'none',
        stroke: s.color || (i < 8 ? SERIES[i] : OTHER),
        'stroke-width': sw,
        'stroke-dasharray': `${arc} ${C - arc}`,
        'stroke-dashoffset': -(offset + gapPx / 2),
        'stroke-linecap': gapPx ? 'butt' : 'round',
        tabindex: '0', role: 'listitem',
        'aria-label': `${s.label}: ${fmt(s.value)}`,
      });
      circle.style.cursor = 'pointer';
      const pct = Math.round(frac * 100);
      circle.addEventListener('pointermove', e => showTip(e, s.label, `${fmt(s.value)} · ${pct}%`));
      circle.addEventListener('pointerleave', hideTip);
      circle.addEventListener('focus', () => {
        const b = circle.getBoundingClientRect();
        showTip({ clientX: b.x + b.width / 2, clientY: b.y }, s.label, `${fmt(s.value)} · ${pct}%`);
      });
      circle.addEventListener('blur', hideTip);
      svg.appendChild(circle);
      offset += frac * C;
    });

    const t1 = el('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', fill: 'var(--chalk-3)', 'font-size': '11', 'font-family': 'inherit' });
    t1.textContent = centerLabel;
    const t2 = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', fill: 'var(--chalk)', 'font-size': '19', 'font-weight': '800', 'font-family': 'inherit', style: 'font-variant-numeric:tabular-nums' });
    t2.textContent = centerValue;
    svg.appendChild(t1); svg.appendChild(t2);
    container.appendChild(svg);
    return true;
  }

  /* ---------- barre mensili entrate/uscite ----------
     data: [{label:'Gen', in:cents, out:cents}] x12 */
  function bars(container, data, { fmt, onBarClick }) {
    container.textContent = '';
    const maxV = Math.max(...data.map(d => Math.max(d.in, d.out)), 1);
    const W = 680, H = 240, padL = 54, padB = 26, padT = 14, padR = 6;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Entrate e uscite per mese', style: 'width:100%;height:auto;display:block' });

    // scala "carina": arrotonda il max
    const step = niceStep(maxV);
    const top = Math.ceil(maxV / step) * step;

    // griglia + assi
    for (let v = 0; v <= top; v += step) {
      const y = padT + plotH - (v / top) * plotH;
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--grid)', 'stroke-width': v === 0 ? 1.4 : 1, 'stroke-dasharray': v === 0 ? '' : '3 5' }));
      const lbl = el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--chalk-3)', 'font-size': '10.5', 'font-family': 'inherit', style: 'font-variant-numeric:tabular-nums' });
      lbl.textContent = v >= 100000 ? Math.round(v / 100000) + 'k' : Math.round(v / 100);
      svg.appendChild(lbl);
    }

    const slot = plotW / data.length;
    const barW = Math.min(13, slot / 3.4);
    data.forEach((d, i) => {
      const cxx = padL + slot * i + slot / 2;
      const mk = (val, dx, color, name) => {
        const h = Math.max((val / top) * plotH, val > 0 ? 3 : 0);
        const y = padT + plotH - h;
        const rect = el('rect', {
          x: cxx + dx - barW / 2, y, width: barW, height: h || 0.01,
          fill: color, rx: 3.5,
        });
        // hit target più grande della barra
        const hit = el('rect', { x: cxx + dx - slot / 4.2, y: padT, width: slot / 2.1, height: plotH, fill: 'transparent' });
        hit.style.cursor = onBarClick ? 'pointer' : 'default';
        hit.addEventListener('pointermove', e => showTip(e, d.label + ' - ' + name, fmt(val)));
        hit.addEventListener('pointerleave', hideTip);
        if (onBarClick) hit.addEventListener('click', () => onBarClick(i));
        svg.appendChild(rect); svg.appendChild(hit);
      };
      if (d.in || d.out) {
        mk(d.in, -barW * 0.62, 'var(--s3)', 'Entrate');
        mk(d.out, barW * 0.62, 'var(--s2)', 'Uscite');
      }
      const lbl = el('text', { x: cxx, y: H - 8, 'text-anchor': 'middle', fill: 'var(--chalk-3)', 'font-size': '10.5', 'font-family': 'inherit' });
      lbl.textContent = d.label;
      svg.appendChild(lbl);
    });

    container.appendChild(svg);
  }

  function niceStep(maxCents) {
    const raw = maxCents / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
    return 10 * pow;
  }

  return { donut, bars, SERIES_CSS: SERIES, OTHER_CSS: OTHER, hideTip };
})();
