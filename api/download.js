// api/download.js
// Stažení souboru po ověření podepsaného, časově omezeného tokenu z e-mailu.
// Klient nikdy nedostane adresu v úložišti — soubory jsou v privátním Blob
// úložišti a tahle funkce je po ověření sama čte a streamuje zákazníkovi.
//
// Potřebné proměnné prostředí: DOWNLOAD_SIGNING_SECRET, BLOB_READ_WRITE_TOKEN
//
// Počet stažení se hlídá atomicky (podmíněný zápis s etagem), takže ani
// několik souběžných požadavků nepřekročí povolený limit.

const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { getSecret, verifyDownloadToken } = require('./_lib/tokens');
const { findProduct } = require('./_lib/shop');
const { openFile, updateJson, isSafeFilename } = require('./_lib/storage');
const { setApiHeaders, clientIp, rateLimit } = require('./_lib/security');

const KONTAKT = 'Napište nám na info.pebmedia@gmail.com.';

function textResponse(res, status, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(status).send(text);
}

/**
 * Zarezervuje jedno stažení. Vrací false, když je limit vyčerpaný.
 */
async function rezervovatStazeni(orderId, maxStazeni) {
  let povoleno = true;
  await updateJson(`stazeni/${orderId}.json`, (data) => {
    const pocet = data ? data.pocet : 0;
    if (pocet >= maxStazeni) { povoleno = false; return undefined; }
    return { pocet: pocet + 1, posledniAt: new Date().toISOString() };
  });
  return povoleno;
}

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    textResponse(res, 405, 'Method not allowed');
    return;
  }

  const secret = getSecret('DOWNLOAD_SIGNING_SECRET');
  if (!secret) {
    textResponse(res, 503, `Stahování je dočasně nedostupné. ${KONTAKT}`);
    return;
  }

  if (!(await rateLimit(`download:${clientIp(req)}`, 30, 10 * 60 * 1000))) {
    textResponse(res, 429, 'Příliš mnoho pokusů. Zkuste to prosím za pár minut.');
    return;
  }

  const token = req.query && req.query.token;
  const payload = verifyDownloadToken(Array.isArray(token) ? token[0] : token, secret);

  if (!payload) {
    textResponse(res, 400, 'Neplatný odkaz ke stažení.');
    return;
  }

  if (Date.now() > payload.vyprsiAt) {
    textResponse(res, 410, `Platnost odkazu vypršela. ${KONTAKT} Pošleme nový.`);
    return;
  }

  // Obrana do hloubky: soubor v tokenu musí pořád odpovídat produktu v katalogu.
  const product = findProduct(payload.productId);
  if (!product || product.soubor !== payload.soubor || !isSafeFilename(payload.soubor)) {
    textResponse(res, 404, `Produkt už není dostupný. ${KONTAKT}`);
    return;
  }

  try {
    const file = await openFile(payload.soubor);
    if (!file) {
      console.error('Stažení: soubor v úložišti chybí', payload.soubor);
      textResponse(res, 404, `Soubor zatím není připravený. ${KONTAKT}`);
      return;
    }

    if (!(await rezervovatStazeni(payload.orderId, payload.maxStazeni))) {
      textResponse(res, 410, `Odkaz byl již použit maximální povolený počet stažení. ${KONTAKT}`);
      return;
    }

    res.setHeader('Content-Type', file.blob.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${payload.soubor}"`);
    if (file.blob.size) res.setHeader('Content-Length', String(file.blob.size));
    res.statusCode = 200;
    await pipeline(Readable.fromWeb(file.stream), res);
  } catch (err) {
    console.error('Chyba při stahování souboru', err);
    if (!res.headersSent) textResponse(res, 500, 'Soubor se nepodařilo stáhnout. Zkuste to prosím znovu.');
    else res.destroy(err);
  }
};
