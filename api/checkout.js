// api/checkout.js
// Vytvoří Stripe Checkout Session pro vybraný produkt. Cena se VŽDY bere
// ze serveru (data/shop.json) podle productId — nikdy z těla požadavku.
//
// Potřebné proměnné prostředí:
//   STRIPE_SECRET_KEY - tajný klíč Stripe (sk_test_... v testovacím režimu)
//   PUBLIC_BASE_URL   - veřejná adresa webu (např. https://pebmedia.cz), pro success/cancel URL

const { findProduct } = require('./_lib/shop');
const { createCheckoutSession } = require('./_lib/stripe');
const { setApiHeaders, getBaseUrl, isAllowedOrigin, clientIp, rateLimit, parseJsonBody } = require('./_lib/security');

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

  const { STRIPE_SECRET_KEY } = process.env;
  const baseUrl = getBaseUrl();
  if (!STRIPE_SECRET_KEY || !baseUrl) {
    console.error('Checkout: chybí STRIPE_SECRET_KEY nebo platná PUBLIC_BASE_URL.');
    res.status(503).json({ error: 'Online platby jsou dočasně nedostupné. Napište nám prosím na info.pebmedia@gmail.com.' });
    return;
  }

  if (!(await rateLimit(`checkout:${clientIp(req)}`, 20, 10 * 60 * 1000))) {
    res.status(429).json({ error: 'Příliš mnoho pokusů. Zkuste to prosím za pár minut.' });
    return;
  }

  const body = parseJsonBody(req);
  const productId = body && body.productId;
  const souhlasOdstoupeni = body && body.souhlasOdstoupeni === true;

  if (typeof productId !== 'string' || productId.length > 100) {
    res.status(400).json({ error: 'Chybí productId.' });
    return;
  }

  const product = findProduct(productId);
  if (!product) {
    res.status(404).json({ error: 'Produkt nenalezen.' });
    return;
  }
  if (product.zdarma || !Number.isFinite(product.cena_kc) || product.cena_kc <= 0) {
    res.status(400).json({ error: 'Tento produkt nelze koupit.' });
    return;
  }

  // U digitálního obsahu (doplňky, e-booky) je souhlas se zahájením plnění před
  // uplynutím lhůty pro odstoupení povinný (§ 1837 písm. l) OZ) — bez něj nákup
  // nejde dokončit. Voucher digitálním obsahem není: spotřebitel má 14 dní na
  // odstoupení (obchodní podmínky čl. 7.2), souhlas se proto nevyžaduje.
  const jeDigitalniObsah = product.typ !== 'voucher';
  if (jeDigitalniObsah && !souhlasOdstoupeni) {
    res.status(400).json({ error: 'Pro dokončení nákupu digitálního obsahu je potřeba zaškrtnout souhlas se zahájením plnění.' });
    return;
  }

  try {
    const session = await createCheckoutSession({
      productName: product.nazev,
      unitAmountKc: product.cena_kc,
      productId: product.id,
      successUrl: `${baseUrl}/obchod/dekuji/?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/obchod/zruseno/`,
      metadata: jeDigitalniObsah ? { souhlasOdstoupeniAt: String(Date.now()) } : {}
    }, STRIPE_SECRET_KEY);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Chyba při vytváření Stripe Checkout Session', err);
    res.status(500).json({ error: 'Platbu se nepodařilo zahájit. Zkuste to prosím znovu.' });
  }
};
