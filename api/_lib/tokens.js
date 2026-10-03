// api/_lib/tokens.js
// Sdílené funkce pro podepisování a ověřování tokenů (stejný princip jako
// api/auth.js — HMAC-SHA256 nad base64url JSON payloadem, formát "payload.podpis").
// Používá se pro odkazy ke stažení (api/download.js) — token nese ID objednávky,
// ID produktu, čas vypršení platnosti a počet povolených stažení.

const crypto = require('crypto');

const TOKEN_VERZE = 1;
const MIN_DELKA_TAJEMSTVI = 32;

/**
 * Vrátí tajemství z proměnné prostředí, jen pokud je dost dlouhé.
 * Krátké nebo chybějící tajemství = server se tváří jako nenakonfigurovaný,
 * aby nikdy neběžel se slabým klíčem (např. "heslo123").
 * Silné tajemství vygenerujete: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
 */
function getSecret(name) {
  const value = process.env[name];
  if (!value || value.length < MIN_DELKA_TAJEMSTVI) {
    console.error(`Proměnná prostředí ${name} chybí nebo je kratší než ${MIN_DELKA_TAJEMSTVI} znaků.`);
    return null;
  }
  return value;
}

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
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = base64urlDecode(encoded);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
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
    v: TOKEN_VERZE,
    typ: 'stazeni',
    orderId: opts.orderId,
    productId: opts.productId,
    soubor: opts.soubor,
    maxStazeni: opts.maxStazeni || 5,
    vyprsiAt: Date.now() + platnostHodin * 60 * 60 * 1000
  };
  return signPayload(payload, secret);
}

/**
 * Ověří token ke stažení včetně typu, verze a tvaru všech polí.
 * @returns {object|null}
 */
function verifyDownloadToken(token, secret) {
  const p = verifyToken(token, secret);
  if (!p || p.v !== TOKEN_VERZE || p.typ !== 'stazeni') return null;
  if (typeof p.orderId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(p.orderId)) return null;
  if (typeof p.productId !== 'string' || typeof p.soubor !== 'string') return null;
  if (!Number.isInteger(p.maxStazeni) || p.maxStazeni < 1 || p.maxStazeni > 20) return null;
  if (!Number.isFinite(p.vyprsiAt)) return null;
  return p;
}

/**
 * Náhodný, neuhodnutelný kód pro voucher (např. "PEB-7F3K-9QX2-M4TD").
 * 12 znaků z 32znakové abecedy = 60 bitů náhody.
 */
function generateVoucherCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez matoucích znaků (0/O, 1/I)
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `PEB-${part()}-${part()}-${part()}`;
}

module.exports = { getSecret, signPayload, verifyToken, createDownloadToken, verifyDownloadToken, generateVoucherCode };
