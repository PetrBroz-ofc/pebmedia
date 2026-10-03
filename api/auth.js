// api/auth.js
// Ověří heslo administrátora proti proměnné prostředí ADMIN_PASSWORD
// a vrátí jednoduchý podepsaný token platný pro danou session prohlížeče.
//
// Potřebné proměnné prostředí (nastavit ve Vercel → Settings → Environment Variables):
//   ADMIN_PASSWORD   - heslo pro přihlášení do administrace
//   ADMIN_TOKEN_SECRET - libovolný náhodný řetězec použitý k podpisu tokenu

const crypto = require('crypto');
const { setApiHeaders, clientIp, rateLimit } = require('./_lib/security');

/** Porovnání hesel v konstantním čase (nejde z doby odpovědi odhadovat heslo). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signToken(secret) {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { ADMIN_PASSWORD, ADMIN_TOKEN_SECRET } = process.env;

  if (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
    res.status(500).json({ error: 'Administrace není nakonfigurována (chybí proměnné prostředí na serveru).' });
    return;
  }

  // Max. 5 pokusů o přihlášení za 15 minut z jedné IP (ochrana proti hádání hesla).
  if (!(await rateLimit(`auth:${clientIp(req)}`, 5, 15 * 60 * 1000))) {
    res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to prosím za 15 minut.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const password = body && body.password;

  if (typeof password !== 'string' || !password || !safeEqual(password, ADMIN_PASSWORD)) {
    res.status(401).json({ error: 'Nesprávné heslo.' });
    return;
  }

  const token = signToken(ADMIN_TOKEN_SECRET);
  res.status(200).json({ ok: true, token });
};
