---
name: Soldi
description: I tuoi soldi con la faccia amichevole delle app italiane quotidiane - chiara, tonda, colorata, diretta.
colors:
  bg: "#f6f4f0"
  card: "#ffffff"
  ink: "#1c1b1a"
  ink-2: "#57544f"
  ink-3: "#6e6a64"
  line: "#e7e3db"
  field: "#f1eee8"
  brand: "#ff4d3d"
  brand-deep: "#e63a2a"
  brand-soft: "#ffe9e6"
  sun: "#ffc53d"
  sun-soft: "#fff3d6"
  amber: "#a76f00"
  pos: "#077b4e"
  pos-soft: "#ddf3e7"
  neg: "#ce3626"
  neg-soft: "#fde5e2"
  blue: "#1863ce"
  blue-soft: "#e3edfb"
  white: "#ffffff"
  danger-hover: "#fbd2cc"
  s1: "#2a78d6"
  s2: "#eb6834"
  s3: "#1baf7a"
  s4: "#eda100"
  s5: "#e87ba4"
  s6: "#008300"
  s7: "#4a3aa7"
  s8: "#e34948"
  s-other: "#9a968f"
  s-none: "#c5c1ba"
  grid: "#efece6"
---

# DESIGN.md - Soldi

Mondo scelto dall'utente (agosto 2026, sostituisce il mondo "lavagna"): **giocoso
italiano** - canone delle app di pagamento italiane quotidiane, livello di craft
Satispay/Hype senza copiarne il brand. Tema unico chiaro.

## Palette

Fondo carta calda `--bg`, superfici bianche `--card` con ombra soffice
(`--shadow`), inchiostro quasi-nero. **Il corallo `--brand` è l'azione**: FAB,
bottoni primari, voce di nav attiva, badge del brand. **Il giallo sole è
l'accantonamento fiscale**: card "da mettere da parte" in `--sun-soft` con testo
`--amber` (leggibile su bianco). Semantica del denaro sul testo: entrate
`--pos`, uscite `--neg`, giroconti `--blue`, ciascuno con la propria versione
`-soft` per pillole e sfondi.

**The Stable Slot Rule** (invariata dal mondo precedente): la palette grafici
`--s1..--s8` è il set chiaro validato CVD (dataviz reference, superficie
bianca); le 8 categorie con più uscite di sempre possiedono uno slot fisso
(`catColorSlots()` in js/app.js), il resto confluisce in "Altro" grigio. Le
barre usano sempre `--s3` (verde-acqua) per le Entrate e `--s2` (arancio) per le
Uscite - coppia adiacente validata che conserva la semantica verde/rosso. I
dischi delle categorie nelle liste riusano lo slot al 16% via `color-mix`
(`catDisc()`).

## Tipografia

Due voci: **Baloo 2** (400–800, `--display`) per titoli, numeri eroe, etichette
periodo e testate dialog - la rotondità è la voce del mondo; **Nunito**
(variabile, `--sans`) per tutto il resto, peso base 600, UI 700–900. Ogni
importo porta `tabular-nums` e il vero meno U+2212 (`fmt()` in js/app.js).
Scala osservata: 0.62–0.95rem UI, 1.02–1.75rem titoli, `clamp(2.6rem, 11vw,
4rem)` per il saldo eroe, 2.2–2.7rem display secondari.

## Forma e profondità

**Pillole ovunque**: bottoni, chip, segment, quickbar, toast, voci sidenav sono
`border-radius: 999px`. Superfici: card 18–20px, dialog 26px, tabbar 22px in
alto, dischi/campi 12–16px, badge brand 11px. Ombre solo soffici e larghe
(`--shadow`, `--shadow-up`); niente bordi duri - il chip usa un inset ring
1.5px `--line`, gli input un bordo 2px trasparente che diventa corallo al
focus.

## Movimento

**The Pop Rule**: il movimento nativo del mondo è il "pop" - easing
`--ease-pop: cubic-bezier(.34,1.56,.64,1)` (overshoot deliberato, non slop):
la riga nuova entra con `popin` (scale .92→1, .45s), FAB e card premono e
sollevano con lo stesso easing. Tutto il resto è micro-transizione ≤250ms;
`prefers-reduced-motion` azzera ogni animazione.

## Componenti firma

- **Card conto** (`.tag-card`): bianche, sollevate, icona + saldo 900.
- **Card "da parte"** (`.setaside`): l'unico blocco giallo sole della home.
- **Riga movimento** (`.txrow`): disco categoria colorato (slot al 16%),
  descrizione 800, importo 900 con segno e colore semantico.
- **Quickbar**: pillola bianca flottante "Scrivi qui…" con invio corallo.
- **Tabbar**: card bianca arrotondata in alto, FAB corallo 58px al centro.
- **Grafici**: donut con gap 2.5px e legenda con valori (relief rule), barre
  con estremi arrotondati; tooltip pillola scura.

## Voce

Italiano, amichevole e diretto: "Segna", "Segnato ✓", "Ho capito così",
"Tutto in ordine", "Scrivi qui: \"12,50 pizza contanti\"…". Mai gergo bancario.

## Responsive

<920px: tabbar + FAB, colonna singola. ≥920px: sidenav 216px a pillole,
`home-grid` 1.2/0.8, `stats-grid` a due colonne. Il noscript usa sans-serif di
sistema (unica eccezione tipografica, intenzionale).
