/**
 * Avviso accessi falliti - Soldi
 *
 * Da incollare su script.google.com (Apps Script), col TUO account Google.
 * Manda una mail a te stesso quando qualcuno sbaglia piu' volte la password
 * d'ingresso dell'app. Gratis, nessun servizio di terzi: e' il tuo Gmail.
 *
 * COME SI ATTIVA
 * 1. Vai su https://script.google.com  ->  "Nuovo progetto"
 * 2. Cancella tutto il contenuto e incolla questo file
 * 3. In alto a destra: "Deploy" (Distribuisci) -> "New deployment" (Nuova distribuzione)
 * 4. Icona ingranaggio accanto a "Select type" -> scegli "Web app" (App web)
 * 5. Compila:
 *      Execute as / Esegui come        : Me (io)
 *      Who has access / Chi ha accesso : Anyone (Chiunque)
 * 6. "Deploy" -> autorizza (comparira' un avviso "app non verificata":
 *    e' la TUA app, scegli "Avanzate" -> "Vai a ...")
 * 7. Copia l'URL che finisce con /exec e mandalo a Claude
 *
 * NOTA: l'URL finira' nel codice pubblico dell'app. Non da' accesso a nulla
 * del tuo account: al massimo qualcuno potrebbe farti arrivare un avviso a
 * vuoto, e il limite qui sotto ne fa passare al massimo uno ogni 10 minuti.
 */

// Non manda piu' di una mail ogni 10 minuti, qualunque cosa succeda.
var MIN_INTERVALLO_MS = 10 * 60 * 1000;

function doPost(e) {
  var prop = PropertiesService.getScriptProperties();
  var ultimo = Number(prop.getProperty('ultimoAvviso') || 0);
  var ora = Date.now();
  if (ora - ultimo < MIN_INTERVALLO_MS) {
    return ContentService.createTextOutput('gia-avvisato');
  }
  prop.setProperty('ultimoAvviso', String(ora));

  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { /* corpo non leggibile */ }

  var quando = Utilities.formatDate(new Date(), 'Europe/Rome', "d MMMM yyyy 'alle' HH:mm");
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'Soldi: qualcuno sta provando a entrare',
    body:
      'Sull\'app Soldi sono stati sbagliati ' + (d.fails || 'piu\'') + ' tentativi di password.\n\n' +
      'Quando: ' + quando + '\n' +
      'Dispositivo: ' + (d.ua || 'sconosciuto') + '\n\n' +
      'Se sei stato tu, ignora questo messaggio.\n' +
      'Se non sei stato tu: i tuoi dati restano al sicuro (senza password l\'app non si apre\n' +
      'nemmeno e i dati non vengono caricati), ma conviene cambiare la password d\'ingresso.\n\n' +
      'Dopo ogni errore l\'attesa raddoppia, quindi tentare a caso diventa presto inutile.',
  });
  return ContentService.createTextOutput('ok');
}

// Utile per provare che funziona: premi "Esegui" su questa funzione,
// devi ricevere la mail di prova.
function provaInvio() {
  PropertiesService.getScriptProperties().deleteProperty('ultimoAvviso');
  doPost({ postData: { contents: JSON.stringify({ fails: 5, ua: 'prova dal pannello Apps Script' }) } });
}
