// api/stripe-webhook.js
// Zpracuje potvrzení platby ze Stripe (checkout.session.completed):
//  - u voucheru vygeneruje unikátní kód a pošle ho e-mailem,
//  - u souboru (doplněk/e-book) vygeneruje podepsaný odkaz ke stažení a pošle ho e-mailem,
//  - objednávku uloží do úložiště (pro případnou kontrolu).
//
// DŮLEŽITÉ: tahle funkce potřebuje SYROVÉ (neparsované) tělo požadavku kvůli
// ověření podpisu, proto je níže vypnutý výchozí bodyParser.
//
// Potřebné proměnné prostředí:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL
//
// Nastavení ve Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL: https://pebmedia.cz/api/stripe-webhook
//   Událost: checkout.session.completed

const { findProduct } = require('./_lib/shop');
const { verifyStripeWebhookSignature } = require('./_lib/stripe');
const { createDownloadToken, generateVoucherCode } = require('./_lib/tokens');
const { sendEmail } = require('./_lib/email');
const { put } = require('@vercel/blob');

module.exports.config = {
  api: { bodyParser: false }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function saveOrder(order) {
  try {
    await put(`objednavky/${order.orderId}.json`, JSON.stringify(order, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json'
    });
  } catch (err) {
    // Uložení objednávky je jen pro evidenci — pokud selže (např. Blob store
    // zatím není připojený), e-mail zákazníkovi přesto pošleme.
    console.error('Nepodařilo se uložit objednávku do úložiště', err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { STRIPE_WEBHOOK_SECRET, DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL } = process.env;

  if (!STRIPE_WEBHOOK_SECRET || !DOWNLOAD_SIGNING_SECRET) {
    console.error('Webhook není plně nakonfigurovaný (chybí STRIPE_WEBHOOK_SECRET nebo DOWNLOAD_SIGNING_SECRET).');
    res.status(500).json({ error: 'Server není nakonfigurovaný.' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signatureOk = verifyStripeWebhookSignature(rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);

  if (!signatureOk) {
    res.status(400).json({ error: 'Neplatný podpis webhooku.' });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    res.status(400).json({ error: 'Neplatné tělo požadavku.' });
    return;
  }

  // Odpovíme Stripe hned 200, zbytek zpracujeme — Stripe očekává rychlou odpověď
  // a při chybě/timeoutu by událost posílal znovu.
  res.status(200).json({ received: true });

  if (event.type !== 'checkout.session.completed') return;

  const session = event.data.object;
  const productId = session.metadata && session.metadata.productId;
  const email = session.customer_details && session.customer_details.email;
  const orderId = session.id;

  if (!productId || !email) {
    console.error('Webhook: chybí productId nebo e-mail v session', session.id);
    return;
  }

  const product = findProduct(productId);
  if (!product) {
    console.error('Webhook: produkt nenalezen', productId);
    return;
  }

  const baseUrl = PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    if (product.typ === 'voucher') {
      const code = generateVoucherCode();

      await saveOrder({
        orderId,
        productId,
        typ: 'voucher',
        email,
        hodnotaKc: product.hodnota_kc,
        kodVoucheru: code,
        souhlasOdstoupeniAt: session.metadata.souhlasOdstoupeniAt || null,
        vytvorenoAt: new Date().toISOString(),
        stav: 'zaplaceno'
      });

      await sendEmail({
        to: email,
        subject: `Váš voucher PEBMedia — ${code}`,
        text: `Děkujeme za nákup!\n\nVáš dárkový poukaz na služby PEBMedia v hodnotě ${product.hodnota_kc} Kč:\n\nKód: ${code}\n\nKód uplatníte při objednávce služby — stačí ho zmínit v poptávce na info.pebmedia@gmail.com.\n\nPEBMedia`
      });

      console.log(`[Voucher] Vygenerován a odeslán kód ${code} pro ${email} (objednávka ${orderId}).`);
      console.log('[Voucher] Pozn.: tento kód zatím není propojený s interním nástrojem pebmedia-vocuhery — pokud ho tam chcete mít evidovaný automaticky, je to samostatný krok k domluvě.');
    } else {
      // 'soubor' nebo placený 'ebook'
      const token = createDownloadToken({
        orderId,
        productId,
        soubor: product.soubor,
        maxStazeni: 5,
        platnostHodin: 24
      }, DOWNLOAD_SIGNING_SECRET);

      const downloadUrl = `${baseUrl}/api/download?token=${encodeURIComponent(token)}`;

      await saveOrder({
        orderId,
        productId,
        typ: product.typ,
        email,
        soubor: product.soubor,
        souhlasOdstoupeniAt: session.metadata.souhlasOdstoupeniAt || null,
        vytvorenoAt: new Date().toISOString(),
        stav: 'zaplaceno'
      });

      await sendEmail({
        to: email,
        subject: `Ke stažení: ${product.nazev} — PEBMedia`,
        text: `Děkujeme za nákup!\n\nOdkaz ke stažení „${product.nazev}“ (platný 24 hodin, max. 5 stažení):\n${downloadUrl}\n\nPEBMedia`
      });

      console.log(`[Stažení] Odkaz odeslán na ${email} pro produkt ${productId} (objednávka ${orderId}).`);
    }
  } catch (err) {
    console.error('Chyba při zpracování zaplacené objednávky', err);
  }
};
