// api/tombola.js
// Žádost o voucher do tomboly (plesy, hasiči, spolky…) ze stránky /tombola/.
// Žádost se jen uloží a odešle ke schválení: voucher má skutečnou hodnotu,
// takže ho vydává až PEBMedia přes odkaz v e-mailu (api/tombola-schvalit.js).
//
// Potřebné proměnné prostředí: BLOB_READ_WRITE_TOKEN, RESEND_API_KEY,
// DOWNLOAD_SIGNING_SECRET (podpis odkazu na schválení).

const crypto = require('crypto');
const { setApiHeaders, getBaseUrl, isAllowedOrigin, clientIp, rateLimit, parseJsonBody } = require('./_lib/security');
const { writeJson, ulozitSoubor } = require('./_lib/storage');
const { sendEmail } = require('./_lib/email');
const { getSecret, signPayload } = require('./_lib/tokens');

const MAX_LOGO = 2 * 1024 * 1024; // 2 MB
const TYPY_AKCE = ['Maturitní ples', 'Ples', 'Hasičský ples', 'Tombola spolku', 'Firemní akce', 'Jiná akce'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** Rozpozná obrázek podle prvních bajtů (nevěří příponě ani typu z prohlížeče). */
function typLoga(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return { ext: 'png', type: 'image/png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

function bezpecnaUrl(v) {
  const s = text(v, 300);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch (e) {
    return '';
  }
}

function formatDatum(iso) {
  const [r, m, d] = String(iso).split('-').map(Number);
  return `${d}. ${m}. ${r}`;
}

module.exports = async function handler(req, res) {
  setApiHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: 'Požadavek není povolený.' });
    return;
  }

  const body = parseJsonBody(req, 4 * 1024 * 1024);
  if (!body) {
    res.status(400).json({ error: 'Neplatný formulář.' });
    return;
  }
  // Past na roboty: skryté pole vyplní jen robot. Tváříme se, že je vše v pořádku.
  if (body.web) {
    res.status(200).json({ ok: true });
    return;
  }

  const ip = clientIp(req);
  if (!(await rateLimit(`tombola-hod:${ip}`, 3, 60 * 60 * 1000)) || !(await rateLimit(`tombola-den:${ip}`, 6, 24 * 60 * 60 * 1000))) {
    res.status(429).json({ error: 'Žádostí bylo odesláno hodně. Napište nám prosím rovnou na info.pebmedia@gmail.com.' });
    return;
  }

  const z = {
    jmeno: text(body.jmeno, 120),
    email: text(body.email, 254).toLowerCase(),
    telefon: text(body.telefon, 40),
    organizace: text(body.organizace, 160),
    akce: text(body.akce, 160),
    typAkce: TYPY_AKCE.includes(body.typAkce) ? body.typAkce : 'Jiná akce',
    datum: /^\d{4}-\d{2}-\d{2}$/.test(body.datum || '') ? body.datum : '',
    misto: text(body.misto, 160),
    hoste: Math.max(0, Math.min(100000, parseInt(body.hoste, 10) || 0)),
    odkaz: bezpecnaUrl(body.odkaz),
    poznamka: text(body.poznamka, 1000),
    souhlas: body.souhlas === true,
    souhlasNabidky: body.souhlasNabidky === true
  };

  const chyby = [];
  if (!z.jmeno) chyby.push('jméno');
  if (!EMAIL.test(z.email)) chyby.push('e-mail');
  if (!z.akce) chyby.push('název akce');
  if (!z.datum) chyby.push('datum akce');
  else if (z.datum < new Date().toISOString().slice(0, 10)) chyby.push('datum akce (musí být v budoucnu)');
  if (!z.misto) chyby.push('místo konání');
  if (!z.souhlas) chyby.push('souhlas se zpracováním údajů');
  if (chyby.length) {
    res.status(400).json({ error: `Zkontrolujte prosím: ${chyby.join(', ')}.` });
    return;
  }
  if (!(await rateLimit(`tombola-email:${z.email}`, 2, 24 * 60 * 60 * 1000))) {
    res.status(429).json({ error: 'Z tohoto e-mailu už žádost dnes přišla. Ozveme se vám, nebo napište na info.pebmedia@gmail.com.' });
    return;
  }

  // Logo (nepovinné) přijde jako data URL; ověříme velikost i skutečný typ obrázku.
  let logo = null;
  if (typeof body.logo === 'string' && body.logo) {
    const m = body.logo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    const buf = m ? Buffer.from(m[2], 'base64') : null;
    const typ = buf && typLoga(buf);
    if (!typ || buf.length > MAX_LOGO) {
      res.status(400).json({ error: 'Logo musí být obrázek PNG, JPG nebo WebP do 2 MB.' });
      return;
    }
    logo = { buf, ...typ };
  }

  const secret = getSecret('DOWNLOAD_SIGNING_SECRET');
  if (!secret) {
    res.status(503).json({ error: 'Formulář je dočasně mimo provoz. Napište nám prosím na info.pebmedia@gmail.com.' });
    return;
  }

  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(6).toString('hex')}`;
  const zadost = {
    id,
    ...z,
    logo: logo ? `tombola/loga/${id}.${logo.ext}` : null,
    stav: 'ceka',
    vytvorenoAt: new Date().toISOString()
  };

  try {
    if (logo) await ulozitSoubor(zadost.logo, logo.buf, logo.type);
    await writeJson(`tombola/zadosti/${id}.json`, zadost, { onlyIfNew: true });
  } catch (err) {
    console.error('Tombola: uložení žádosti selhalo', err.message);
    res.status(500).json({ error: 'Žádost se nepodařilo uložit. Zkuste to prosím znovu, nebo napište na info.pebmedia@gmail.com.' });
    return;
  }

  const baseUrl = getBaseUrl();
  const token = signPayload({ typ: 'tombola', id, exp: Date.now() + 60 * 24 * 60 * 60 * 1000 }, secret);
  const odkazSchvaleni = `${baseUrl}/api/tombola-schvalit?t=${encodeURIComponent(token)}`;

  const radky = [
    `Akce: ${z.akce} (${z.typAkce})`,
    `Datum: ${formatDatum(z.datum)}`,
    `Místo: ${z.misto}`,
    `Počet hostů: ${z.hoste || 'neuvedeno'}`,
    `Organizace: ${z.organizace || 'neuvedeno'}`,
    `Profil akce: ${z.odkaz || 'neuvedeno'}`,
    '',
    `Kontakt: ${z.jmeno}, ${z.email}${z.telefon ? `, ${z.telefon}` : ''}`,
    `Souhlas s nabídkami PEBMedia: ${z.souhlasNabidky ? 'ANO' : 'ne'}`,
    ...(z.poznamka ? ['', `Poznámka: ${z.poznamka}`] : [])
  ];

  try {
    await sendEmail({
      to: process.env.ORDER_NOTIFY_EMAIL || 'info.pebmedia@gmail.com',
      subject: `Žádost o voucher do tomboly: ${z.akce}`,
      text: `Přišla nová žádost o voucher do tomboly.\n\n${radky.join('\n')}\n\nSchválit (vyberete hodnotu a platnost) nebo zamítnout:\n${odkazSchvaleni}\n\nOdkaz platí 60 dní. Nikomu ho nepřeposílejte.\n`,
      attachments: logo ? [{ filename: `logo-${id}.${logo.ext}`, content: logo.buf.toString('base64') }] : undefined
    });
  } catch (err) {
    console.error('Tombola: e-mail ke schválení se nepodařilo odeslat', err.message);
    res.status(502).json({ error: 'Žádost se nepodařilo odeslat. Zkuste to prosím znovu, nebo napište na info.pebmedia@gmail.com.' });
    return;
  }

  try {
    await sendEmail({
      to: z.email,
      subject: `Přijali jsme vaši žádost o voucher do tomboly — ${z.akce}`,
      text: `Dobrý den,\n\nděkujeme za žádost o dárkový voucher PEBMedia do tomboly na akci „${z.akce}“ (${formatDatum(z.datum)}, ${z.misto}).\n\nŽádost teď projdeme. Když ji schválíme, pošleme vám voucher jako PDF připravené k tisku na tento e-mail.\n\nKdybyste chtěli něco doplnit, stačí odpovědět na tento e-mail.\n\nPEBMedia\nhttps://pebmedia.cz`
    });
  } catch (err) {
    console.error('Tombola: potvrzení organizátorovi se nepodařilo odeslat', err.message);
  }

  res.status(200).json({ ok: true });
};

module.exports.TYPY_AKCE = TYPY_AKCE;
