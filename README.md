# Soldi

App personale di gestione soldi (PWA): spese, entrate, giroconti su più conti, fatture con calcolo automatico degli accantonamenti del regime forfettario, statistiche, inserimento rapido stile chat. Nessun server, nessun abbonamento: **i dati vivono solo sul tuo dispositivo** (IndexedDB), i backup sono file cifrati (AES-256-GCM) che salvi dove vuoi, ad esempio sul tuo Google Drive.

## Come si usa sul PC

```bash
python -m http.server 8741
```

poi apri http://localhost:8741 (serve un piccolo server: aprire il file direttamente non basta per la PWA).

## Come pubblicarla (gratis) e installarla sul telefono

L'installazione su Android richiede HTTPS, quindi serve un hosting statico gratuito:

1. **GitHub Pages** — crea un repo, carica questi file, attiva Pages. *(il file `seed/seed-data.json` e `PRODUCT.md` sono esclusi dal repo via `.gitignore` perché contengono dati personali — la versione online parte vuota e i dati li porti col backup cifrato, vedi sotto)*
2. Apri l'URL dal telefono con Chrome → menu ⋮ → **"Aggiungi a schermata Home" / "Installa app"**. Grazie al manifest si installa come app vera, funziona anche offline.

### Portare i dati sul telefono (senza mai metterli online)

1. Sul PC (localhost): importa i movimenti del foglio al primo avvio.
2. Impostazioni → **Esporta backup cifrato** → scegli una password → si scarica un file `.soldi`.
3. Passa il file al telefono (Google Drive, cavo, come vuoi: è cifrato, senza password è illeggibile).
4. Sul telefono, nell'app: **Importa un backup (.soldi)** → password → fatto.

## Foto scontrini (opzionale, gratis)

Impostazioni → Riconoscimento foto: incolla una API key gratuita di Google Gemini
(https://aistudio.google.com/apikey — piano free, non serve carta). La chiave resta sul dispositivo; le foto vengono inviate a Google solo quando usi la funzione.

## Struttura

- `index.html`, `css/app.css` — interfaccia (design "giocoso italiano")
- `js/db.js` — dati (IndexedDB) + matematica fiscale forfettario
- `js/parser.js` — parser italiano per l'inserimento rapido + integrazione Gemini
- `js/charts.js` — grafici SVG (palette validata per daltonismo)
- `js/backup.js` — backup cifrato + export CSV
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA offline e installabile
- `seed/seed-data.json` — i 1.036 movimenti importati dal foglio Google (**solo locale, mai nel repo**)

## Parametri fiscali

Impostazioni → Fisco: imposta sostitutiva, INPS, coefficiente di redditività, bollo.
Precaricati con i valori del tuo foglio (15% / 24% / 78% / €2). La rivalsa 4% è un'opzione per singola fattura. Verifica le aliquote col commercialista (la Gestione Separata 2026 è ~26,07% per chi non ha altra cassa).
