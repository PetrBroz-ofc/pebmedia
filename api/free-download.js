// api/free-download.js
// Zdarma e-book: bez platby, jen e-mail + nepředzaškrtnutý souhlas se zasíláním
// novinek. Pošle podepsaný odkaz ke stažení (stejný princip jako u placených
// produktů, jen s delší platností a vyšším počtem povolených stažení).
//
// Potřebné proměnné prostředí: DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL

const { findProduct } = require('./_lib/shop');
const { createDownloadToken } = require('./_lib/tokens');
const { sendEmail } = require('./_lib/email');
const { put } = require('@vercel/blob');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL } = process.env;
  if (!DOWNLOAD_SIGNING_SECRET) {
    res.status(500).json({ error: 'Server není nakonfigurovaný.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { productId, email, souhlasNovinky } = body || {};

  if (!productId || !isValidEmail(email)) {
    res.status(400).json({ error: 'Zadejte prosím platný e-mail.' });
    return;
  }

  const product = findProduct(productId);
  if (!product || !product.zdarma) {
    res.status(404).json({ error: 'Produkt zdarma nenalezen.' });
    return;
  }

  const baseUrl = PUBLIC_BASE_URL || `https://${req.headers.host}`;
  const orderId = `free-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const token = createDownloadToken({
    orderId,
    productId,
    soubor: product.soubor,
    maxStazeni: 10,
    platnostHodin: 72
  }, DOWNLOAD_SIGNING_SECRET);

  const downloadUrl = `${baseUrl}/api/download?token=${encodeURIComponent(token)}`;

  try {
    // Souhlas s novinkami se jen zaloguje k adrese — nikde se nepředává třetím
    // stranám. Pokud Petr bude chtít posílat newsletter, může si tyto adresy
    // vyexportovat z Vercel logů nebo napojit na e-mailový nástroj později.
    try {
      await put(`odberatele/${orderId}.json`, JSON.stringify({
        email,
        productId,
        souhlasNovinky: !!souhlasNovinky,
        vytvorenoAt: new Date().toISOString()
      }), { access: 'public', addRandomSuffix: false, contentType: 'application/json' });
    } catch (err) {
      console.error('Nepodařilo se uložit záznam o stažení zdarma (odkaz se přesto pošle)', err);
    }

    await sendEmail({
      to: email,
      subject: `Ke stažení: ${product.nazev} — PEBMedia`,
      text: `Děkujeme o zájem!\n\nOdkaz ke stažení „${product.nazev}“ (platný 72 hodin):\n${downloadUrl}\n\nPEBMedia`
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Chyba při odesílání odkazu zdarma', err);
    res.status(500).json({ error: 'Odkaz se nepodařilo odeslat. Zkuste to prosím znovu.' });
  }
};
