#!/usr/bin/env node
// scripts/pridej-do-galerie.js
//
// Přidá fotku nebo video do galerie v sekci "Podporujeme studenty a školy".
//
// POUŽITÍ:
//   node scripts/pridej-do-galerie.js <soubor> "Popis pro nevidomé a Google" [--titulek "Text pod fotkou"] [--nahled obrazek.jpg] [--zaostreni "center 70%"]
//
//   npm run galerie -- fotka.jpg "Studenti s vouchery PEBMedia" --titulek "Maturitní ples 2027"
//   npm run galerie -- video.mp4 "Video z maturitního plesu" --nahled snimek.jpg
//
// --zaostreni posune výřez náhledu v mřížce (kde jsou na fotce lidé): "center 20%" = nahoře,
// "center 50%" = střed (výchozí ~30 %), "center 80%" = dole.
//
// Fotky (jpg, png, webp, avif, tiff) se zmenší a převedou do WebP ve dvou velikostech
// a ODSTRANÍ se z nich metadata (EXIF, GPS poloha, model telefonu).
// Videa (mp4, webm) se zkopírují; --nahled je obrázek, který se ukáže před přehráním.
// Video by mělo mít do ~20 MB (GitHub odmítne soubory nad 100 MB).
//
// Na konci se automaticky spustí scripts/predgeneruj.js.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR = 'assets/skoly/galerie';
const OBRAZKY = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'];
const VIDEA = ['.mp4', '.webm'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function optimalizovat(vstup, zaklad) {
  const out = {};
  for (const [klic, sirka] of [['small', 800], ['large', 1600]]) {
    const soubor = `${DIR}/${zaklad}-${sirka}.webp`;
    // sharp ve výchozím stavu metadata (EXIF/GPS) do výstupu nepřenáší.
    const info = await sharp(vstup).rotate().resize({ width: sirka, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(ROOT, soubor));
    out[klic] = { src: soubor, width: info.width, height: info.height };
  }
  return out;
}

async function main() {
  const [soubor, alt] = process.argv.slice(2);
  if (!soubor || !alt || alt.startsWith('--')) {
    console.error('Použití: node scripts/pridej-do-galerie.js <soubor> "Popis fotky/videa" [--titulek "…"] [--nahled obrazek.jpg]');
    process.exit(1);
  }
  if (!fs.existsSync(soubor)) {
    console.error(`Soubor ${soubor} neexistuje.`);
    process.exit(1);
  }

  const contentPath = path.join(ROOT, 'data/content.json');
  const raw = fs.readFileSync(contentPath, 'utf8');
  const content = JSON.parse(raw);
  const galerie = content.schools.gallery || (content.schools.gallery = []);
  fs.mkdirSync(path.join(ROOT, DIR), { recursive: true });

  const ext = path.extname(soubor).toLowerCase();
  const zaklad = `galerie-${new Date().toISOString().slice(0, 10)}-${galerie.length + 1}`;
  const polozka = { alt, ...(arg('--titulek') ? { caption: arg('--titulek') } : {}), ...(arg('--zaostreni') ? { focus: arg('--zaostreni') } : {}) };

  if (OBRAZKY.includes(ext)) {
    const o = await optimalizovat(soubor, zaklad);
    Object.assign(polozka, { type: 'image', src: o.large.src, srcSmall: o.small.src, width: o.large.width, height: o.large.height });
  } else if (VIDEA.includes(ext)) {
    const mb = fs.statSync(soubor).size / 1024 / 1024;
    if (mb > 95) { console.error(`Video má ${mb.toFixed(0)} MB — GitHub přijme max. 100 MB. Zmenšete ho prosím.`); process.exit(1); }
    if (mb > 20) console.warn(`Pozor: video má ${mb.toFixed(0)} MB, návštěvníkům se bude načítat pomalu. Doporučeno do 20 MB.`);
    const cil = `${DIR}/${zaklad}${ext}`;
    fs.copyFileSync(soubor, path.join(ROOT, cil));
    Object.assign(polozka, { type: 'video', src: cil });
    if (arg('--nahled')) {
      const o = await optimalizovat(arg('--nahled'), `${zaklad}-nahled`);
      Object.assign(polozka, { poster: o.large.src, width: o.large.width, height: o.large.height });
    }
  } else {
    console.error(`Nepodporovaný formát ${ext}. Fotky: ${OBRAZKY.join(', ')}; videa: ${VIDEA.join(', ')}.`);
    process.exit(1);
  }

  galerie.push({ ...polozka, order: galerie.length + 1 });
  const out = JSON.stringify(content, null, 2) + '\n';
  fs.writeFileSync(contentPath, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out);
  console.log(`Přidáno do galerie: ${polozka.src}`);

  execFileSync(process.execPath, [path.join(__dirname, 'predgeneruj.js')], { stdio: 'inherit' });
}

main().catch((err) => {
  console.error('Přidání do galerie selhalo:', err);
  process.exit(1);
});
