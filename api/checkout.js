// api/checkout.js
// Vytvoří Stripe Checkout Session pro vybraný produkt. Cena se VŽDY bere
// ze serveru (data/shop.json) podle productId — nikdy z těla požadavku.
//
// Potřebné proměnné prostředí:
//   STRIPE_SECRET_KEY - tajný klíč Stripe (sk_test_... v testovacím režimu)
//   PUBLIC_BASE_URL   - veřejná adresa webu (např. https://pebmedia.cz), pro success/cancel URL

const { findProduct } = require('./_lib/shop');
const { createCheckoutSession } = require('./_lib/stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { STRIPE_SECRET_KEY, PUBLIC_BASE_URL } = process.env;
  if (!STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'Platby nejsou nakonfigurované (chybí STRIPE_SECRET_KEY na serveru).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { productId, souhlasOdstoupeni } = body || {};

  if (!productId) {
    res.status(400).json({ error: 'Chybí productId.' });
    return;
  }

  // Zaškrtnutí souhlasu se zahájením plnění před uplynutím lhůty pro odstoupení
  // je u digitálního obsahu povinné (§ 1837 občanského zákoníku) — bez něj
  // zákazník nemůže nákup dokončit.
  if (!souhlasOdstoupeni) {
    res.status(400).json({ error: 'Pro dokončení nákupu digitálního obsahu je potřeba zaškrtnout souhlas se zahájením plnění.' });
    return;
  }

  const product = findProduct(productId);
  if (!product) {
    res.status(404).json({ error: 'Produkt nenalezen.' });
    return;
  }
  if (product.zdarma || !product.cena_kc) {
    res.status(400).json({ error: 'Tento produkt je zdarma — použijte /api/free-download.' });
    return;
  }

  const baseUrl = PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const session = await createCheckoutSession({
      productName: product.nazev,
      unitAmountKc: product.cena_kc,
      productId: product.id,
      successUrl: `${baseUrl}/obchod/dekuji/?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/obchod/zruseno/`,
      metadata: {
        souhlasOdstoupeniAt: String(Date.now())
      }
    }, STRIPE_SECRET_KEY);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Chyba při vytváření Stripe Checkout Session', err);
    res.status(500).json({ error: 'Platbu se nepodařilo zahájit. Zkuste to prosím znovu.' });
  }
};
