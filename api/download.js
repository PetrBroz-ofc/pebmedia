// api/download.js
// Stažení souboru po ověření podepsaného, časově omezeného tokenu z e-mailu.
// Klient nikdy nedostane přímou adresu v úložišti — tahle funkce soubor
// po ověření stáhne server-side a přepošle (proxy).
//
// Potřebné proměnné prostředí: DOWNLOAD_SIGNING_SECRET
//
// Pozn. k počtu stažení: počítadlo se ukládá jako malý JSON soubor ve Vercel
// Blob (read-modify-write). Při běžném provozu (jeden zákazník, občasné
// stažení) je zanedbatelné riziko souběhu dvou stažení najednou; pro vyšší
// provoz by bylo lepší přejít na opravdovou databázi (např. Vercel KV).

const { verifyToken } = require('./_lib/tokens');
const { getFileInfo } = require('./_lib/storage');
const { put, head } = require('@vercel/blob');

async function getPocetStazeni(orderId) {
  try {
    const info = await head(`objednavky/${orderId}-pocet.json`);
    const res = await fetch(info.url);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.pocet || 0;
  } catch (e) {
    return 0; // počítadlo ještě neexistuje => 0 stažení zatím
  }
}

async function zvysitPocetStazeni(orderId, pocet) {
  try {
    await put(`objednavky/${orderId}-pocet.json`, JSON.stringify({ pocet }), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json'
    });
  } catch (err) {
    console.error('Nepodařilo se uložit počítadlo stažení (soubor se přesto stáhne)', err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { DOWNLOAD_SIGNING_SECRET } = process.env;
  if (!DOWNLOAD_SIGNING_SECRET) {
    res.status(500).send('Server není nakonfigurovaný.');
    return;
  }

  const token = req.query && req.query.token;
  const payload = token && verifyToken(token, DOWNLOAD_SIGNING_SECRET);

  if (!payload) {
    res.status(400).send('Neplatný odkaz ke stažení.');
    return;
  }

  if (Date.now() > payload.vyprsiAt) {
    res.status(410).send('Platnost odkazu vypršela. Napište nám na info.pebmedia@gmail.com a pošleme nový.');
    return;
  }

  const pocetStazeni = await getPocetStazeni(payload.orderId);
  if (pocetStazeni >= payload.maxStazeni) {
    res.status(410).send('Odkaz byl již použit maximální povolený počet stažení. Napište nám na info.pebmedia@gmail.com.');
    return;
  }

  const fileInfo = await getFileInfo(payload.soubor);
  if (!fileInfo) {
    res.status(404).send('Soubor zatím nebyl nahrán. Napište nám na info.pebmedia@gmail.com.');
    return;
  }

  try {
    const fileRes = await fetch(fileInfo.url);
    if (!fileRes.ok) throw new Error('Soubor se nepodařilo načíst z úložiště.');

    await zvysitPocetStazeni(payload.orderId, pocetStazeni + 1);

    res.setHeader('Content-Disposition', `attachment; filename="${payload.soubor}"`);
    res.setHeader('Content-Type', fileInfo.contentType || 'application/octet-stream');

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    res.status(200).send(buffer);
  } catch (err) {
    console.error('Chyba při stahování souboru', err);
    res.status(500).send('Soubor se nepodařilo stáhnout. Zkuste to prosím znovu.');
  }
};
