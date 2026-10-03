#!/usr/bin/env node
// scripts/nahraj-produkty.js
//
// Jednorázový pomocný skript pro Petra: nahraje hotové ZIP balíčky
// doplňků (z produkty/_zip-dist/) a volitelně e-book do privátního
// úložiště Vercel Blob, odkud je pak stahuje api/download.js /
// api/free-download.js.
//
// POUŽITÍ:
//   1. V projektu připojte Vercel Blob Store (Storage → Create → Blob)
//      a stáhněte si BLOB_READ_WRITE_TOKEN (Vercel vám ho sám nastaví
//      do prostředí projektu; pro běh LOKÁLNĚ si ho zkopírujte do
//      souboru .env.local nebo exportujte v terminálu).
//   2. Spusťte: node scripts/nahraj-produkty.js
//
// Skript nic nemaže ani nepřepisuje mimo vlastní "produkty/" prefix
// v Blob úložišti.

const fs = require('fs');
const path = require('path');
const { uploadFile } = require('../api/_lib/storage');

const ZIP_DIR = path.join(__dirname, '..', 'produkty', '_zip-dist');
const EBOOK_PATH = path.join(__dirname, '..', 'produkty', 'ebooky', 'neplatte-zbytecne.pdf');

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Chybí proměnná prostředí BLOB_READ_WRITE_TOKEN. Nastavte ji (viz komentář v tomto souboru) a spusťte skript znovu.');
    process.exit(1);
  }

  if (!fs.existsSync(ZIP_DIR)) {
    console.error('Složka produkty/_zip-dist neexistuje — nejdřív vytvořte ZIP balíčky doplňků.');
    process.exit(1);
  }

  const zipFiles = fs.readdirSync(ZIP_DIR).filter(f => f.endsWith('.zip'));

  if (zipFiles.length === 0) {
    console.log('Ve složce produkty/_zip-dist nejsou žádné .zip soubory.');
  }

  for (const filename of zipFiles) {
    const buffer = fs.readFileSync(path.join(ZIP_DIR, filename));
    const result = await uploadFile(filename, buffer, 'application/zip');
    console.log(`Nahráno: ${filename} -> ${result.pathname}`);
  }

  if (fs.existsSync(EBOOK_PATH)) {
    const buffer = fs.readFileSync(EBOOK_PATH);
    const result = await uploadFile('neplatte-zbytecne.pdf', buffer, 'application/pdf');
    console.log(`Nahráno: neplatte-zbytecne.pdf -> ${result.pathname}`);
  } else {
    console.log('Pozn.: soubor neplatte-zbytecne.pdf (volný e-book) nebyl nalezen v produkty/ebooky/ — až ho budete mít, dejte ho tam a skript spusťte znovu.');
  }

  console.log('Hotovo.');
}

main().catch(err => {
  console.error('Chyba při nahrávání:', err);
  process.exit(1);
});
