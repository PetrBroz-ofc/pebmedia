// api/auth.js
// Ověří heslo administrátora proti proměnné prostředí ADMIN_PASSWORD
// a vrátí jednoduchý podepsaný token platný pro danou session prohlížeče.
//
// Potřebné proměnné prostředí (nastavit ve Vercel → Settings → Environment Variables):
//   ADMIN_PASSWORD   - heslo pro přihlášení do administrace
//   ADMIN_TOKEN_SECRET - libovolný náhodný řetězec použitý k podpisu tokenu

const crypto = require('crypto');

function signToken(secret) {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { ADMIN_PASSWORD, ADMIN_TOKEN_SECRET } = process.env;

  if (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
    res.status(500).json({ error: 'Administrace není nakonfigurována (chybí proměnné prostředí na serveru).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const password = body && body.password;

  if (!password || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Nesprávné heslo.' });
    return;
  }

  const token = signToken(ADMIN_TOKEN_SECRET);
  res.status(200).json({ ok: true, token });
};
