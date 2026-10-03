// api/_lib/security.js
// Společné obranné prvky pro všechny endpointy obchodu:
//  - bezpečnostní hlavičky odpovědí API,
//  - kontrola, že požadavek přišel z našeho webu (Origin),
//  - omezení počtu požadavků (rate limit) uložené v privátním Blob úložišti,
//  - bezpečné načtení JSON těla s limitem velikosti.

const crypto = require('crypto');
const { updateJson } = require('./storage');

function setApiHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Veřejná adresa webu z PUBLIC_BASE_URL. Nikdy se neodvozuje z hlavičky Host,
 * kterou může útočník podvrhnout.
 */
function getBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.origin;
  } catch (e) {
    return null;
  }
}

/**
 * Prohlížeč posílá u POST požadavků hlavičku Origin. Když přijde z cizího
 * webu, požadavek odmítneme (ochrana proti zneužití API cizí stránkou).
 */
function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // ne-prohlížečové klienty Origin neposílají; chrání je rate limit
  const allowed = new Set([getBaseUrl()].filter(Boolean));
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  return allowed.has(origin);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'neznama';
}

/**
 * Neuchovává IP ani e-maily v čitelné podobě — jen jejich HMAC otisk. Sůl obsahuje
 * dnešní datum, takže otisk se každý den změní a starý záznam už nejde s nikým spojit
 * (slib v zásadách ochrany osobních údajů, sekce „Zabezpečení webu“).
 */
function fingerprint(value) {
  const salt = `${process.env.DOWNLOAD_SIGNING_SECRET || 'pebmedia'}:${new Date().toISOString().slice(0, 10)}`;
  return crypto.createHmac('sha256', salt).update(String(value).toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * Pevné okno: max `max` požadavků za `oknoMs` pro daný klíč.
 * Při výpadku úložiště požadavek pustí (a zaloguje) — obchod nesmí spadnout
 * jen proto, že nejde zapsat počítadlo.
 * @returns {Promise<boolean>} true = povoleno
 */
async function rateLimit(klic, max, oknoMs) {
  const pathname = `limity/${fingerprint(klic)}.json`;
  const ted = Date.now();
  let povoleno = true;
  try {
    await updateJson(pathname, (data) => {
      if (!data || ted - data.zacatek > oknoMs) return { zacatek: ted, pocet: 1 };
      if (data.pocet >= max) { povoleno = false; return undefined; }
      return { zacatek: data.zacatek, pocet: data.pocet + 1 };
    });
  } catch (err) {
    console.error('Rate limit nedostupný, požadavek propouštím', err.message);
  }
  return povoleno;
}

/** Načte JSON tělo (Vercel ho většinou předá už rozparsované) s limitem velikosti. */
function parseJsonBody(req, maxBytes = 10 * 1024) {
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > maxBytes) return null;
    try { body = JSON.parse(body); } catch (e) { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

/** Syrové tělo požadavku s limitem velikosti (pro ověření podpisu webhooku). */
function readRawBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Tělo požadavku je příliš velké.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = { setApiHeaders, getBaseUrl, isAllowedOrigin, clientIp, fingerprint, rateLimit, parseJsonBody, readRawBody };
