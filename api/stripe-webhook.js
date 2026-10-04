// api/stripe-webhook.js
// Zpracuje potvrzení platby ze Stripe (checkout.session.completed a
// checkout.session.async_payment_succeeded):
//  - u voucheru vygeneruje unikátní kód a pošle ho e-mailem,
//  - u souboru (doplněk/e-book) vygeneruje podepsaný odkaz ke stažení a pošle ho e-mailem,
//  - objednávku uloží do privátního úložiště.
//
// BEZPEČNOST:
//  - ověřuje podpis Stripe (STRIPE_WEBHOOK_SECRET) nad syrovým tělem,
//  - stav platby si znovu načte přímo ze Stripe API a zkontroluje, že je
//    zaplaceno, v CZK a přesně za cenu z katalogu,
//  - je idempotentní: Stripe stejnou událost může poslat víckrát, ale zákazník
//    dostane vždy jen jeden voucher (opakované doručení pošle stejný kód znovu,
//    nikdy nevygeneruje nový).
//
// Potřebné proměnné prostředí:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL
//
// Nastavení ve Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL: https://pebmedia.cz/api/stripe-webhook
//   Události: checkout.session.completed, checkout.session.async_payment_succeeded

const { findProduct } = require('./_lib/shop');
const { verifyStripeWebhookSignature, retrieveCheckoutSession } = require('./_lib/stripe');
const { getSecret, createDownloadToken, generateVoucherCode } = require('./_lib/tokens');
const { sendEmail } = require('./_lib/email');
const { readJson, writeJson } = require('./_lib/storage');
const { zapsatVoucher } = require('./_lib/vouchery');
const { setApiHeaders, getBaseUrl, readRawBody } = require('./_lib/security');

const ZPRACOVAT = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

/**
 * Konec platnosti voucheru z obchodu: 12 měsíců ode dne zakoupení
 * (obchodní podmínky čl. 9.2). Vrací datum ve tvaru RRRR-MM-DD podle českého času.
 */
function platnostVoucheru(datumNakupu) {
  const dnes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(datumNakupu); // RRRR-MM-DD
  const [r, m, d] = dnes.split('-').map(Number);
  const konec = new Date(Date.UTC(r + 1, m - 1, d));
  if (konec.getUTCMonth() !== m - 1) konec.setUTCDate(0); // 29. 2. → 28. 2.
  return konec.toISOString().slice(0, 10);
}

function formatDatum(iso) {
  const [r, m, d] = String(iso).split('-').map(Number);
  return `${d}. ${m}. ${r}`;
}

/**
 * Najde existující objednávku, nebo ji atomicky založí. Při souběhu dvou
 * doručení téže události vyhraje první zápis a druhé si přečte jeho data.
 */
async function nacistNeboZalozit(orderPath, novaObjednavka) {
  const existujici = await readJson(orderPath);
  if (existujici) return existujici.data;
  if (await writeJson(orderPath, novaObjednavka, { onlyIfNew: true })) return novaObjednavka;
  const poSoubehu = await readJson(orderPath);
  if (!poSoubehu) throw new Error(`Objednávku ${orderPath} se nepodařilo založit.`);
  return poSoubehu.data;
}

async function zpracovatPlatbu(session, { stripeKey, downloadSecret, baseUrl }) {
  const orderId = session.id;
  const productId = session.metadata && session.metadata.productId;
  const email = session.customer_details && session.customer_details.email;

  if (session.payment_status !== 'paid') {
    console.log(`Webhook: session ${orderId} zatím není zaplacená (${session.payment_status}) — čekám na další událost.`);
    return;
  }

  const product = productId && findProduct(productId);
  if (!product || !email) {
    console.error('Webhook: chybí produkt nebo e-mail', orderId, productId);
    return;
  }

  // Zaplacená částka musí přesně odpovídat ceně v katalogu.
  if (session.currency !== 'czk' || session.amount_total !== Math.round(product.cena_kc * 100)) {
    console.error('Webhook: nesouhlasí částka nebo měna — objednávku NEVYŘIZUJI', orderId, session.amount_total, session.currency);
    return;
  }

  const orderPath = `objednavky/${orderId}.json`;
  const order = await nacistNeboZalozit(orderPath, {
    orderId,
    productId,
    typ: product.typ,
    email,
    zaplacenoKc: session.amount_total / 100,
    kodVoucheru: product.typ === 'voucher' ? generateVoucherCode() : undefined,
    hodnotaKc: product.typ === 'voucher' ? product.hodnota_kc : undefined,
    platnostDo: product.typ === 'voucher' ? platnostVoucheru(new Date()) : undefined,
    soubor: product.typ === 'voucher' ? undefined : product.soubor,
    souhlasOdstoupeniAt: (session.metadata && session.metadata.souhlasOdstoupeniAt) || null,
    vytvorenoAt: new Date().toISOString(),
    stav: 'zaplaceno'
  });

  if (order.stav === 'odeslano') {
    console.log(`Webhook: objednávka ${orderId} už byla vyřízena — přeskakuji duplicitní událost.`);
    return;
  }

  if (product.typ === 'voucher') {
    await sendEmail({
      to: email,
      subject: `Váš voucher PEBMedia — ${order.kodVoucheru}`,
      text: `Děkujeme za nákup!\n\nVáš dárkový poukaz na služby PEBMedia v hodnotě ${order.hodnotaKc} Kč:\n\nKód: ${order.kodVoucheru}\nPlatnost do: ${formatDatum(order.platnostDo)}\n\nKód uplatníte při objednávce služby, stačí ho zmínit v poptávce na info.pebmedia@gmail.com. Hodnota voucheru se odečte od ceny služby; voucher lze uplatnit jednou, nevyčerpaný rozdíl se nevrací a voucher nelze směnit za peníze.\n\nOd koupě voucheru můžete odstoupit do 14 dnů od zaplacení, pokud ho do té doby neuplatníte. Stačí napsat na info.pebmedia@gmail.com. Obchodní podmínky: ${baseUrl}/obchod/podminky/\n\nPEBMedia`
    });
    console.log(`[Voucher] Kód odeslán zákazníkovi (objednávka ${orderId}).`);
  } else {
    const token = createDownloadToken({
      orderId,
      productId,
      soubor: product.soubor,
      maxStazeni: 5,
      platnostHodin: 24
    }, downloadSecret);
    const downloadUrl = `${baseUrl}/api/download?token=${encodeURIComponent(token)}`;

    await sendEmail({
      to: email,
      subject: `Ke stažení: ${product.nazev} — PEBMedia`,
      text: `Děkujeme za nákup!\n\nOdkaz ke stažení „${product.nazev}“ (platný 24 hodin, max. 5 stažení):\n${downloadUrl}\n\nOdkaz je osobní, prosím nepřeposílejte ho.\n\nPotvrzujeme, že jste před nákupem výslovně souhlasili se zpřístupněním digitálního obsahu před uplynutím lhůty pro odstoupení od smlouvy a vzali jste na vědomí, že tím právo na odstoupení zaniká (§ 1837 písm. l) občanského zákoníku). Obchodní podmínky: ${baseUrl}/obchod/podminky/\n\nPEBMedia`
    });
    console.log(`[Stažení] Odkaz odeslán zákazníkovi (objednávka ${orderId}).`);
  }

  await writeJson(orderPath, { ...order, stav: 'odeslano', odeslanoAt: new Date().toISOString() });

  // Zápis voucheru do interní správy voucherů (Supabase). Výsledek jde do kopie
  // objednávky; selhání nesmí zablokovat zákazníka ani vyvolat opakování webhooku.
  let sprava = null;
  if (order.kodVoucheru) {
    try {
      const r = await zapsatVoucher({ kod: order.kodVoucheru, hodnotaKc: order.hodnotaKc, platnostDo: order.platnostDo });
      sprava = r === 'zapsano' ? 'ano' : 'přeskočeno (není nastaven klíč Supabase)';
    } catch (err) {
      console.error('Zápis voucheru do správy voucherů selhal', err.message);
      sprava = 'NE, chyba při zápisu — doplň voucher do správy ručně';
    }
  }

  // Kopie objednávky provozovateli. Až po označení „odesláno“: kdyby tenhle e-mail
  // selhal, Stripe nesmí událost opakovat (zákazník by dostal e-mail dvakrát).
  try {
    const radky = [
      `Produkt: ${product.nazev}`,
      `Zaplaceno: ${order.zaplacenoKc} Kč`,
      ...(order.kodVoucheru ? [`Kód voucheru: ${order.kodVoucheru}`, `Platnost do: ${formatDatum(order.platnostDo)}`] : []),
      `Zákazník: ${email}`,
      `Datum: ${new Date().toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })}`,
      `Platba ve Stripe: ${orderId}`,
      ...(sprava ? [`Zapsáno do správy voucherů: ${sprava}`] : [])
    ];
    await sendEmail({
      to: process.env.ORDER_NOTIFY_EMAIL || 'info.pebmedia@gmail.com',
      subject: `Nová objednávka: ${product.nazev}${order.kodVoucheru ? ` (${order.kodVoucheru})` : ''}`,
      text: `Na webu proběhl nákup.\n\n${radky.join('\n')}\n`
    });
  } catch (err) {
    console.error('Kopii objednávky provozovateli se nepodařilo odeslat (zákazník svůj e-mail dostal)', err.message);
  }
}

async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const downloadSecret = getSecret('DOWNLOAD_SIGNING_SECRET');
  const baseUrl = getBaseUrl();

  if (!stripeKey || !webhookSecret || !downloadSecret || !baseUrl) {
    console.error('Webhook není plně nakonfigurovaný (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DOWNLOAD_SIGNING_SECRET, PUBLIC_BASE_URL).');
    res.status(500).json({ error: 'Server není nakonfigurovaný.' });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    res.status(413).json({ error: 'Požadavek je příliš velký.' });
    return;
  }

  if (!verifyStripeWebhookSignature(rawBody, req.headers['stripe-signature'], webhookSecret)) {
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

  if (!ZPRACOVAT.has(event.type)) {
    res.status(200).json({ received: true, ignored: event.type });
    return;
  }

  // Zpracujeme celou objednávku PŘED odpovědí: na Vercelu se funkce po odeslání
  // odpovědi může zastavit a e-mail by se nikdy neodeslal. Při chybě vrátíme 500
  // a Stripe událost zopakuje (díky idempotenci bez duplicit).
  try {
    const session = await retrieveCheckoutSession(event.data && event.data.object && event.data.object.id, stripeKey);
    await zpracovatPlatbu(session, { stripeKey, downloadSecret, baseUrl });
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Chyba při zpracování zaplacené objednávky — Stripe to zkusí znovu', err);
    res.status(500).json({ error: 'Zpracování selhalo.' });
  }
}

module.exports = handler;
// Syrové tělo je potřeba kvůli ověření podpisu — výchozí parsování těla vypínáme.
module.exports.config = { api: { bodyParser: false } };
