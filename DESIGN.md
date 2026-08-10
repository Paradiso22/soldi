---
name: Soldi — La Lavagna
description: La lavagna dei tuoi soldi — ardesia, gesso e cartellini per conti, spese e fatture forfettario.
colors:
  board: "#232b27"
  board-deep: "#1b211e"
  board-raise: "#2a332e"
  board-line: "#37423c"
  chalk: "#f2efe6"
  chalk-2: "#bec7bd"
  chalk-3: "#97a29a"
  chalk-green: "#8fd9ab"
  chalk-red: "#f29380"
  chalk-blue: "#8fc1ea"
  tag: "#f2c94c"
  tag-ink: "#2c2410"
  danger: "#e66767"
  s1: "#37a68b"
  s2: "#d4694a"
  s3: "#5b93c9"
  s4: "#b8862e"
  s5: "#c9648f"
  s6: "#6d8f3f"
  s7: "#9a7fd1"
  s8: "#c95555"
  s-other: "#97a29a"
  s-none: "#5f6a62"
  grid: "#313b35"
typography:
  display:
    fontFamily: "Permanent Marker, Segoe Print, cursive"
    fontSize: "1.7rem"
    fontWeight: 400
    letterSpacing: "0.01em"
  numeral-hero:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 11vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
  overline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 700
    letterSpacing: "0.09em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "16px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.tag}"
    textColor: "{colors.tag-ink}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "#f5d466"
  button-secondary:
    backgroundColor: "{colors.board-raise}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-ghost:
    textColor: "{colors.chalk-2}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  chip:
    textColor: "{colors.chalk-2}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  chip-pressed:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.board-deep}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.board-deep}"
    textColor: "{colors.chalk}"
    rounded: "9px"
    padding: "10px 12px"
  tag-card:
    backgroundColor: "{colors.board-raise}"
    textColor: "{colors.chalk}"
    padding: "10px 13px 11px"
  fab-add:
    backgroundColor: "{colors.tag}"
    textColor: "{colors.tag-ink}"
    size: "56px"
    rounded: "50%"
---

# Design System: Soldi — La Lavagna

## Overview

**Creative North Star: "La lavagna prezzi del mercato"**

Soldi scrive i soldi di Gio come i prezzi al mercato: una lavagna d'ardesia verde-nera dove ogni spesa si segna col gesso. La superficie è unica e scura (`color-scheme: dark`, nessun tema chiaro), il gesso è caldo e non bianco puro, i conti sono cartellini-prezzo appesi con lo spago ocra e leggermente storti. Il mondo rifiuta esplicitamente la dashboard fintech scura a card neon con hero-metric template (THESIS nel commento di `index.html`).

La densità è da listino: righe compatte separate da tratteggi, numeri tabulari allineati, una sola evidenza colore (l'ocra del cartellino). L'atmosfera fisica è resa con tre dispositivi discreti: polvere di gesso in feTurbulence a opacità .05 su tutto il body, righe decorative tracciate a mano come SVG inline (mai bordi CSS dritti per decorazione), e la tilt casuale dei cartellini (−1.2° … 1.1°).

L'interfaccia parla italiano, con la voce della lavagna: l'azione di salvataggio è "Segna", la conferma è "Segnato sulla lavagna ✓", lo stato vuoto è "La lavagna è pulita". Seed: 1f2f84ab, candidato 5/7.

**Key Characteristics:**
- Un solo tema scuro: ardesia verde-nera + gesso caldo, mai nero/bianco puri.
- Due voci tipografiche nette: Permanent Marker per le parole-titolo, Archivo tabulare per tutti i dati.
- Ocra `tag` come unica evidenza (azioni primarie, sottolineature, "da parte", focus).
- Rosso gesso = uscite, verde gesso = entrate, blu gesso = giroconti — solo sul testo, mai come sfondi.
- Movimento quasi assente: una sola animazione d'autore (chalkwrite sulla riga nuova).
- Copy italiano nella metafora della lavagna; toast di successo chiusi da "✓".

## Colors

Gessetti caldi su ardesia: quattro verdi-neri di superficie, tre gradi di gesso, tre gessetti semantici e un solo accento ocra.

### Primary
- **Cartellino ocra** (`--tag` #f2c94c): l'unica evidenza. Bottoni primari e FAB, sottolineatura hero e tab attiva, spago dei cartellini, riquadro "da mettere da parte" (bordo tratteggiato + velo `rgba(242,201,76,.07)`), colonna "Da parte" nelle tabelle, anello di `:focus-visible`. Testo sopra: **Inchiostro cartellino** (`--tag-ink` #2c2410). Hover dei bottoni primari: #f5d466.

### Neutral
- **Ardesia** (`--board` #232b27): superficie principale della pagina (con radial-gradient bianco .028 in alto) e dei dialog.
- **Ardesia fonda** (`--board-deep` #1b211e): fondo di header/tabbar, input, bolle bot, tooltip. È anche il `theme-color` del manifest.
- **Ardesia rialzata** (`--board-raise` #2a332e): card, cartellini, bottoni secondari, hover delle righe.
- **Riga tracciata** (`--board-line` #37423c): tutti i bordi e i separatori.
- **Gesso** (`--chalk` #f2efe6): inchiostro primario; diventa sfondo del toast e del chip premuto (inversione).
- **Gesso secondario** (`--chalk-2` #bec7bd): testo di supporto, label dei cartellini, link.
- **Gesso muto** (`--chalk-3` #97a29a): metadati, placeholder, intestazioni tabella, icone spente — mantiene ≥4.5:1 su `--board` (commento nel CSS).

### Semantic (testo dei movimenti)
- **Gesso verde** (`--chalk-green` #8fd9ab): entrate — classe `.pos`, solo su importi e triangoli.
- **Gesso rosso** (`--chalk-red` #f29380): uscite — classe `.neg`.
- **Gesso blu** (`--chalk-blue` #8fc1ea): giroconti (segment attivo).
- **Pericolo** (`--danger` #e66767): bottoni distruttivi e "Zona a rischio".

### Chart palette (gessetti colorati, validata CVD su #232b27)
- **Serie fisse** `--s1`…`--s8`: #37a68b, #d4694a, #5b93c9, #b8862e, #c9648f, #6d8f3f, #9a7fd1, #c95555 — donut e barre.
- **Altro** (`--s-other` #97a29a) e **Senza categoria** (`--s-none` #5f6a62) per i residui; **griglia** (`--grid` #313b35).

**The Stable Slot Rule.** Le 8 categorie con più uscite di sempre possiedono gli slot `--s1`…`--s8` in ordine di spesa storica (`catColorSlots()` in `js/app.js`); tutte le altre confluiscono in "Altro" grigio. Una categoria mantiene lo stesso colore in ogni periodo e in ogni grafico. Nelle barre mensili Entrate è sempre `--s1` e Uscite sempre `--s2`.

**The One Ochre Rule.** L'ocra `tag` è scarso per costruzione: segnala l'azione primaria o il numero da accantonare, mai la decorazione. I semantici `chalk-green`/`chalk-red` colorano il testo dei movimenti, mai i grafici (che usano solo la palette `--s*`) e mai gli sfondi.

## Typography

**Display Font:** Permanent Marker (fallback 'Segoe Print', cursive) — self-hosted `fonts/marker-latin.woff2`, solo peso 400.
**Body/Data Font:** Archivo (fallback system-ui, sans-serif) — variabile 100–900, self-hosted `fonts/archivo-latin.woff2`.

**Character:** il Marker è la mano che scrive i titoli sulla lavagna; Archivo è il registro dei numeri, neutro e tabulare. Il contrasto tra i due è l'identità tipografica.

### Hierarchy
- **Display** (400, 1.7rem, ls .01em, Marker): titoli di vista (`h2.viewtitle`). Varianti: brand 1.5rem, titoli dialog 1.25rem, etichetta periodo 1.15rem, frase dello stato vuoto 1.25rem, label hero 1.05rem.
- **Numeral hero** (800, clamp(2.6rem, 11vw, 4rem), lh 1.05, ls −.02em, Archivo): il saldo totale "In cassa adesso". Importo nel form: 2.6rem/800.
- **Body** (400–600, .92–.95rem, lh 1.45, Archivo): testo corrente, descrizioni (600), input.
- **Label** (700, ~.8rem): etichette form, nomi cartellino (.78rem/600), sottotesti (.76–.78rem in `--chalk-3`).
- **Overline** (700, .72–.82rem, uppercase, ls .06–.09em, `--chalk-3`): `h3.rule`, intestazioni giorno e di tabella.

**The Marker-Speaks-Words Rule.** Permanent Marker scrive solo parole (titoli, label hero, empty state), mai numeri e mai testo lungo. Ogni cifra è Archivo con `font-variant-numeric: tabular-nums` (classe `.money`, ls −.01em) e il segno meno è il vero U+2212 "−" (`fmt()` in `js/app.js`), mai il trattino.

## Layout

Colonna unica a max-width 1120px, padding orizzontale 18px, contenuto sopra la polvere (`z-index: 1`).

- **Mobile (default, superficie primaria):** tabbar fissa in basso (`--nav-h` 62px, fondo `--board-deep`, bordo alto `--board-line`, `env(safe-area-inset-bottom)`) con 5 slot: 4 voci + FAB ocra centrale da 56px. La quickbar "Scrivi qui" è sticky sopra la tabbar. I cartellini conto scorrono in orizzontale (scrollbar nascosta).
- **Desktop (≥920px):** la tabbar sparisce; griglia `208px 1fr` con sidenav verticale (voci 10px 12px, raggio 8px, hover/attivo `--board-raise`); home a due colonne `1.2fr .8fr` (gap 34px), statistiche `1fr 1fr`; quickbar max-width 660px.
- **Breakpoint minori:** 640px (dialog da bottom-sheet a centrato), 700px (le colonne `.hm` delle tabelle spariscono su mobile: "vince ciò che conta").
- **Ritmo:** spaziatura ad hoc su passi 8–18px (gap 8/10/12, padding card 16px, sezioni `h3.rule` a margine 26px sopra); nessuna scala tokenizzata.
- **Voce attiva:** `aria-current="page"` = testo gesso pieno + `border-bottom: 2px solid var(--tag)` sull'etichetta.

## Elevation & Depth

Sistema quasi piatto a strati tonali: la profondità si legge dai tre verdi di superficie (fonda → base → rialzata) e dai bordi `--board-line`, non dalle ombre. Le ombre esistono solo per i tre elementi che fluttuano davvero sopra la lavagna.

### Shadow Vocabulary
- **FAB** (`box-shadow: 0 4px 14px rgba(0,0,0,.45)`): il bottone + della tabbar.
- **Quickbar** (`box-shadow: 0 6px 22px rgba(0,0,0,.4)`): la barra sticky di scrittura.
- **Tooltip** (`box-shadow: 0 6px 18px rgba(0,0,0,.5)`): il tooltip dei grafici.
- **Backdrop dialog**: `rgba(10,13,11,.66)` + `backdrop-filter: blur(2px)`.

**The Floating-Only Rule.** Le card appoggiano sulla lavagna con bordo e tono, mai con ombra. L'ombra è riservata a ciò che sta sopra il flusso (FAB, quickbar, tooltip).

## Shapes

Angoli morbidi ma non pillola: raggio base 10px (`--radius`) per card, bottoni e riquadri; 8px per righe, chip-icona e cartellini (che usano `8px 8px 10px 8px`, l'angolo tagliato del cartellino vero); 9px input; 14px quickbar; 16px dialog (16 16 0 0 come bottom-sheet su mobile); 999px per chip, badge e toast; cerchio pieno per il FAB.

Le linee raccontano la mano: separatori di riga **tratteggiati** (`1px dashed var(--board-line)`), riquadro fatture con **bordo tratteggiato ocra**, importo del form con **sottolineatura tratteggiata**. Le righe decorative (dopo `h3.rule`, sottolineatura hero ocra) sono path SVG ondulati inline, tracciati a mano.

**The Hand-Traced Rule.** Ogni riga decorativa è un path SVG irregolare, mai un `border` dritto. I separatori funzionali sono tratteggiati; il bordo solido spetta solo al perimetro delle superfici. Nelle tabelle il totale chiude con `border-top: 1.5px solid var(--chalk-3)`, la doppia riga della somma fatta a mano.

## Components

### Buttons
- **Shape:** raggio 10px; `.iconbtn` quadrato 40px (34px nelle righe impostazioni).
- **Primary:** ocra su inchiostro (`--tag`/`--tag-ink`), padding 10px 18px, peso 700; hover #f5d466. Anche `.iconbtn.primary` (invio quickbar).
- **Secondary (default `.btn`):** `--board-raise` con bordo `--board-line`; hover `--board-line`.
- **Ghost:** trasparente, testo `--chalk-2`; hover `--board-raise`.
- **Danger:** testo `--danger`, bordo `rgba(230,103,103,.4)`; hover velo rosso .12.
- **States:** `:active` scala .98 (FAB .93); disabled opacità .5; `:focus-visible` anello ocra 2px offset 2px (globale).

### Chips
- **Style:** pillola 999px, bordo `--board-line`, testo `--chalk-2`, .8rem/700, padding 6px 13px.
- **State:** `aria-pressed="true"` inverte a gesso pieno su `--board-deep` — il filtro attivo è "scritto col gesso pieno". Fila scorrevole `.chip-row.scroll` per i conti.

### Cards / Containers
- **Chartcard / Setcard:** `--board-raise`, bordo `--board-line`, raggio 10px, padding 16px.
- **Badge:** pillola `--board-raise`, .72rem/700; variante `.warn` in ocra (bordo `rgba(242,201,76,.5)`).
- **Setaside (riquadro "da parte"):** bordo `1px dashed rgba(242,201,76,.45)`, velo ocra .07, icona e valore in `--tag`.

### Inputs / Fields
- **Style:** fondo `--board-deep` (più fondo della superficie: l'incavo dove si scrive), bordo `--board-line`, raggio 9px, padding 10px 12px; label .8rem/700 in `--chalk-2`; hint .76rem in `--chalk-3`; select con freccia SVG inline custom.
- **Focus:** `border-color: var(--tag)` (niente glow).
- **Bigamount:** importo del form a 2.6rem/800 centrato, solo sottolineatura tratteggiata che diventa ocra al focus.
- **Segment (tipo movimento):** binario `--board-deep` con bottoni interni; il premuto prende `--board-raise` e il colore semantico del tipo (uscita rossa, entrata verde, giroconto blu).

### Navigation
- **Tabbar (mobile):** 5 slot, icone 23px + etichette .64rem/600 in `--chalk-3`; attiva = gesso pieno + sottolineatura ocra 2px; FAB ocra centrale 56px.
- **Sidenav (desktop):** colonna 208px, voci .92rem/600 con icona; hover e attiva su `--board-raise`, stessa sottolineatura ocra.
- **Periodnav:** frecce `.iconbtn` + etichetta periodo in Marker 1.15rem.

### Tag-card (signature)
Il cartellino-prezzo dei conti: `--board-raise` con raggio 8/8/10/8, min-width 132px, inclinato di `--tilt` (ciclo −1.2°, .8°, −.6°, 1.1°), foro di punzonatura in alto a destra (`::before`, cerchio 7px bordo `--chalk-3`) e spago ocra nel foro (`::after`, arco `--tag` ruotato 24°). Hover: si raddrizza a 0° e si alza di 2px. Selezionato: outline ocra 2px. Nome .78rem/600 in `--chalk-2`, importo 1.22rem/800 tabulare. Riusato nelle fatture come riquadri riepilogo (non cliccabili).

### Txrow (signature)
La riga del listino: trasparente con `border-bottom: 1px dashed`, tile emoji 34px su `--board-raise`, descrizione .93rem/600 con ellissi, sottotesto .76rem muto "data · categoria · conto", importo a destra .98rem/800 con segno e colore semantico (+verde, −rosso, giroconto muto con 🔁). Hover `--board-raise`. Raggruppata per giorno sotto un `dayhead` overline.

### Tables (`.sheet`)
Il foglio del registro: .84rem, numeri a destra tabulari, prima colonna a sinistra; thead sticky uppercase .72rem in `--chalk-3`; righe tratteggiate con hover; tfoot 800 con riga solida 1.5px `--chalk-3`; colonna "Da parte" in ocra, "Netto" in verde; wrapper `.tablewrap` con scroll orizzontale e bordo.

### Charts (SVG puro, `js/charts.js`)
- **Donut:** 220 viewBox, raggio 78, stroke 30, gap 2.5px tra fette, parte da ore 12; centro con etichetta muta 11px + valore 19px/800 tabulare; fette focusabili con tooltip.
- **Barre:** coppie Entrate (`--s1`)/Uscite (`--s2`), rx 3.5, griglia tratteggiata `--grid` con scala "carina" (step 1/2/2.5/5), etichette 10.5px mute, hit-target largo, click sulla barra apre il mese.
- **Legend:** righe cliccabili con swatch 11px raggio 3px, valore 700, percentuale muta — la legenda filtra i movimenti.
- **Tooltip:** `--board-deep` con bordo `--chalk-3`, raggio 8px, .8rem.

### Toast / Empty / Welcome
- **Toast:** inversione totale — gesso su `--board-deep`, pillola, .88rem/700, sale da 20px con `--ease-out`; i successi finiscono con " ✓" ("Segnato sulla lavagna ✓").
- **Empty state:** centrato, icona spenta 34px, frase in Marker ("La lavagna è pulita", "Niente qui") + istruzione muta.
- **Welcome:** centrato max 560px, titolo Marker 2rem con "€" ocra, bottoni a tutta larghezza.

### Motion
Un solo momento d'autore: **chalkwrite** — la riga appena segnata si rivela da sinistra a destra (`clip-path: inset(0 100% 0 0)` → 0, opacità .4 → 1, .8s `--ease-out`), applicata solo a `.txrow.is-new` (l'ultimo movimento aggiunto). Tutto il resto è micro-transizione 100–250ms (hover, scala dei bottoni, toast) con easing `cubic-bezier(.16, 1, .3, 1)`. `prefers-reduced-motion: reduce` azzera tutto (animazioni e transizioni a .01ms).

**The Chalkwrite Rule.** L'unica animazione d'ingresso è la scrittura col gesso della riga nuova. Nessun altro elemento entra animato: niente fade di pagina, niente stagger, niente animazioni sui grafici.

## Do's and Don'ts

### Do:
- **Do** scrivere ogni importo con `.money` (tabular-nums), formato it-IT EUR e meno vero U+2212 "−"; segno e colore semantico solo sul testo (+`--chalk-green` / −`--chalk-red`).
- **Do** usare l'ocra `--tag` solo per: azione primaria, evidenza "da parte", sottolineatura attiva, focus. Un tocco per schermata.
- **Do** disegnare le icone UI nello sprite SVG di `index.html` (stroke 1.8, round cap/join, 22px) e lasciare le emoji come icone di categorie e conti (dato utente, ereditato dal foglio).
- **Do** scrivere il copy in italiano nella voce della lavagna: "Segna" per creare, "Segnato sulla lavagna ✓" nei toast, empty state in Marker con frase + istruzione.
- **Do** mantenere gli slot colore delle categorie stabili (top-8 storiche → `--s1`…`--s8`, resto in "Altro" grigio).
- **Do** rispettare `env(safe-area-inset-*)` su tabbar, main, quickbar, toast e dialog.

### Don't:
- **Don't** usare Permanent Marker per numeri, testo lungo o pesi diversi dal 400.
- **Don't** colorare i grafici con `--chalk-green`/`--chalk-red` o con l'ocra: le fette e le barre usano solo la palette CVD `--s1`…`--s8` + grigi.
- **Don't** aggiungere ombre alle card appoggiate, gradienti neon, glassmorphism o hero-metric da template fintech (rifiuto di tesi).
- **Don't** usare bordi dritti per le righe decorative (solo path SVG tracciati a mano) né separatori solidi tra le righe (tratteggio).
- **Don't** introdurre nuove animazioni d'ingresso oltre a chalkwrite, né ignorare `prefers-reduced-motion`.
- **Don't** usare nero #000, bianco #fff o grigi freddi: ogni neutro viene dalle scale ardesia/gesso.
