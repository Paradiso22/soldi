/* backup.js — export/import cifrato (AES-GCM + PBKDF2) e CSV. Tutto in locale. */
'use strict';

const Backup = (() => {
  const MAGIC = 'SOLDI1'; // versione formato
  const ITER = 310000;

  const te = new TextEncoder(), td = new TextDecoder();

  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  function payload() {
    const s = DB.state;
    const settings = { ...s.settings };
    delete settings.geminiKey; // la chiave API non finisce nei backup
    return { v: 1, exportedAt: new Date().toISOString(), accounts: s.accounts, categories: s.categories, settings, tx: s.tx };
  }

  async function exportEncrypted(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const data = te.encode(JSON.stringify(payload()));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
    const blob = new Blob([te.encode(MAGIC), salt, iv, cipher], { type: 'application/octet-stream' });
    const name = 'soldi-backup-' + new Date().toISOString().slice(0, 10) + '.soldi';
    download(blob, name);
    return name;
  }

  async function importEncrypted(file, password) {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (td.decode(buf.slice(0, 6)) !== MAGIC) throw new Error('Non è un backup di Soldi.');
    const salt = buf.slice(6, 22), iv = buf.slice(22, 34), cipher = buf.slice(34);
    const key = await deriveKey(password, salt);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    } catch {
      throw new Error('Password sbagliata o file danneggiato.');
    }
    const j = JSON.parse(td.decode(plain));
    if (!j.tx || !j.accounts) throw new Error('Backup incompleto.');
    return j;
  }

  async function applyBackup(j) {
    const gemini = DB.state.settings.geminiKey; // conserva la chiave locale
    await DB.wipeAll();
    DB.state.accounts = j.accounts;
    DB.state.categories = j.categories;
    DB.state.settings = Object.assign({}, DB.DEFAULT_SETTINGS, j.settings, { geminiKey: gemini });
    await Promise.all([DB.saveAccounts(), DB.saveCategories(), DB.saveSettings(), DB.markSeeded()]);
    await DB.putTxBulk(j.tx);
  }

  function exportCSV() {
    const rows = [['Data', 'Descrizione', 'Categoria', 'Tipo', 'Importo', 'Conto', 'Conto destinazione', 'Fattura', 'Note']];
    const tipo = { in: 'Entrata', out: 'Uscita', transfer: 'Giroconto' };
    for (const t of [...DB.state.tx].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([
        t.date,
        t.desc || '',
        DB.cat(t.category)?.name || '',
        tipo[t.type],
        (t.amount / 100).toFixed(2).replace('.', ','),
        DB.acc(t.account)?.name || '',
        DB.acc(t.toAccount)?.name || '',
        t.invoice ? 'Sì' : '',
        t.note || '',
      ]);
    }
    const csv = '﻿' + rows.map(r => r.map(c => /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'soldi-movimenti.csv');
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  return { exportEncrypted, importEncrypted, applyBackup, exportCSV };
})();
