// api/_lib/tokens.js
// Sdílené funkce pro podepisování a ověřování tokenů (stejný princip jako
// api/auth.js — HMAC-SHA256 nad base64url JSON payloadem, formát "payload.podpis").
// Používá se pro odkazy ke stažení (api/download.js) — token nese ID objednávky,
// ID produktu, čas vypršení platnosti a počet povolených stažení.

const crypto = require('crypto');

function base64urlEncode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function base64urlDecode(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

/**
 * Podepíše libovolný payload (objekt) daným tajemstvím.
 * @returns {string} token ve formátu "payload.podpis"
 */
function signPayload(payload, secret) {
  const encoded = base64urlEncode(payload);
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

/**
 * Ověří token podepsaný funkcí signPayload.
 * @returns {object|null} dekódovaný payload, nebo null při neplatném podpisu/formátu
 */
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    return base64urlDecode(encoded);
  } catch (e) {
    return null;
  }
}

/**
 * Vytvoří podepsaný token pro stažení souboru.
 * @param {object} opts { orderId, productId, soubor, maxStazeni, platnostHodin }
 */
function createDownloadToken(opts, secret) {
  const platnostHodin = opts.platnostHodin || 24;
  const payload = {
    orderId: opts.orderId,
    productId: opts.productId,
    soubor: opts.soubor,
    maxStazeni: opts.maxStazeni || 5,
    pocetStazeni: 0,
    vyprsiAt: Date.now() + platnostHodin * 60 * 60 * 1000
  };
  return signPayload(payload, secret);
}

/**
 * Náhodný, neuhodnutelný kód pro voucher (např. "PEB-7F3K-9QX2").
 */
function generateVoucherCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez matoucích znaků (0/O, 1/I)
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `PEB-${part()}-${part()}`;
}

module.exports = { signPayload, verifyToken, createDownloadToken, generateVoucherCode };
