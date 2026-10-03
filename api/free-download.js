// api/free-download.js
// Zdarma e-book: bez platby, jen e-mail + nepředzaškrtnutý souhlas se zasíláním
// novinek. Pošle podepsaný odkaz ke stažení (stejný princip jako u placených
// produktů, jen s delší platností a vyšším počtem povolených stažení).
//
// Ochrana proti zneužití (aby přes nás nikdo nemohl zahlcovat cizí schránky):
//  - skryté pole "web" (honeypot) — vyplní ho jen roboti,
//  - max. 5 žádostí za hodinu z jedné IP adresy,
//  - na jeden e-mail max. 1 odeslání za 15 minut.
//
// Potřebné proměnné prostředí: DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL

const crypto = require('crypto');
const { findProduct } = require('./_lib/shop');
const { getSecret, createDownloadToken } = require('./_lib/tokens');
const { sendEmail } = require('./_lib/email');
const { writeJson } = require('./_lib/storage');
const { setApiHeaders, getBaseUrl, isAllowedOrigin, clientIp, rateLimit, parseJsonBody } = require('./_lib/security');

const HOTOVO = { ok: true };

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(email);
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

  const secret = getSecret('DOWNLOAD_SIGNING_SECRET');
  const baseUrl = getBaseUrl();
  if (!secret || !baseUrl) {
    res.status(503).json({ error: 'Stahování je dočasně nedostupné. Napište nám prosím na info.pebmedia@gmail.com.' });
    return;
  }

  const body = parseJsonBody(req);
  if (!body) {
    res.status(400).json({ error: 'Neplatná data.' });
    return;
  }

  // Honeypot: tváříme se, že je hotovo, ať robot nepozná, že ho odhalil.
  if (body.web) {
    res.status(200).json(HOTOVO);
    return;
  }

  const { productId, souhlasNovinky } = body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (typeof productId !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ error: 'Zadejte prosím platný e-mail.' });
    return;
  }

  const product = findProduct(productId);
  if (!product || !product.zdarma) {
    res.status(404).json({ error: 'Produkt zdarma nenalezen.' });
    return;
  }

  if (!(await rateLimit(`free-ip:${clientIp(req)}`, 5, 60 * 60 * 1000))) {
    res.status(429).json({ error: 'Příliš mnoho žádostí. Zkuste to prosím za hodinu.' });
    return;
  }

  // Stejná odpověď jako při úspěchu — nikdo tak nezjistí, jestli adresa už u nás je.
  if (!(await rateLimit(`free-email:${productId}:${email}`, 1, 15 * 60 * 1000))) {
    res.status(200).json(HOTOVO);
    return;
  }

  const orderId = `free-${crypto.randomUUID()}`;

  const token = createDownloadToken({
    orderId,
    productId,
    soubor: product.soubor,
    maxStazeni: 10,
    platnostHodin: 72
  }, secret);

  const downloadUrl = `${baseUrl}/api/download?token=${encodeURIComponent(token)}`;

  try {
    // Souhlas s novinkami se ukládá jen do privátního úložiště — nikde se
    // nepředává třetím stranám a není dostupný přes žádnou veřejnou URL.
    try {
      await writeJson(`odberatele/${orderId}.json`, {
        email,
        productId,
        souhlasNovinky: souhlasNovinky === true,
        vytvorenoAt: new Date().toISOString()
      }, { onlyIfNew: true });
    } catch (err) {
      console.error('Nepodařilo se uložit záznam o stažení zdarma (odkaz se přesto pošle)', err.message);
    }

    await sendEmail({
      to: email,
      subject: `Ke stažení: ${product.nazev} — PEBMedia`,
      text: `Děkujeme za zájem!\n\nOdkaz ke stažení „${product.nazev}“ (platný 72 hodin):\n${downloadUrl}\n\nPokud jste o e-book nežádali, tento e-mail prosím ignorujte.\n\nPEBMedia`
    });

    res.status(200).json(HOTOVO);
  } catch (err) {
    console.error('Chyba při odesílání odkazu zdarma', err);
    res.status(500).json({ error: 'Odkaz se nepodařilo odeslat. Zkuste to prosím znovu.' });
  }
};
