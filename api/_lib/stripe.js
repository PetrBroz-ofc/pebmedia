// api/_lib/stripe.js
// Minimální obálka nad Stripe REST API — bez instalace balíčku "stripe",
// stejně jako zbytek projektu používá přímé fetch volání (viz api/contact.js
// pro Resend). Funguje jak v testovacím (sk_test_...), tak ostrém režimu —
// podle toho, jaký STRIPE_SECRET_KEY je nastavený v prostředí.

const crypto = require('crypto');

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * Převede vnořený objekt na application/x-www-form-urlencoded tělo
 * ve formátu, který Stripe API očekává (např. line_items[0][price_data][currency]).
 */
function toFormBody(obj, prefix) {
  const params = new URLSearchParams();
  function walk(value, key) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${key}[${i}]`));
    } else if (typeof value === 'object') {
      Object.keys(value).forEach((k) => walk(value[k], `${key}[${k}]`));
    } else {
      params.append(key, String(value));
    }
  }
  Object.keys(obj).forEach((k) => walk(obj[k], prefix ? `${prefix}[${k}]` : k));
  return params;
}

async function stripeRequest(path, body, secretKey, method = 'POST') {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: method === 'GET' ? undefined : toFormBody(body)
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || 'Neznámá chyba Stripe API';
    throw new Error(msg);
  }
  return data;
}

/**
 * Vytvoří Stripe Checkout Session pro jednorázovou platbu v CZK.
 */
async function createCheckoutSession({ productName, unitAmountKc, productId, successUrl, cancelUrl, metadata }, secretKey) {
  return stripeRequest('/checkout/sessions', {
    mode: 'payment',
    'line_items': [
      {
        quantity: 1,
        price_data: {
          currency: 'czk',
          unit_amount: Math.round(unitAmountKc * 100),
          product_data: { name: productName }
        }
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: 'cs',
    // Nedokončená platba propadne po 30 minutách (minimum, které Stripe dovolí).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: { productId, ...metadata }
  }, secretKey);
}

/**
 * Načte Checkout Session přímo ze Stripe API. Webhook podle ní ověřuje stav
 * platby — nevěří jen obsahu doručené události.
 */
async function retrieveCheckoutSession(sessionId, secretKey) {
  if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{10,255}$/.test(sessionId)) {
    throw new Error('Neplatné ID Checkout Session.');
  }
  return stripeRequest(`/checkout/sessions/${sessionId}`, null, secretKey, 'GET');
}

/**
 * Ověří podpis Stripe webhooku (hlavička "Stripe-Signature").
 * Stripe podepisuje HMAC-SHA256 řetězce "{timestamp}.{syrové tělo}".
 * @param {string} rawBody syrové (neparsované) tělo requestu
 * @param {string} sigHeader hodnota hlavičky stripe-signature
 * @param {string} secret STRIPE_WEBHOOK_SECRET
 * @param {number} toleranceSeconds povolené stáří požadavku (ochrana proti replay)
 */
function verifyStripeWebhookSignature(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!sigHeader) return false;

  // Hlavička může obsahovat víc podpisů v1 (např. během rotace tajemství) —
  // stačí, když sedí kterýkoli z nich.
  let timestamp = null;
  const signatures = [];
  for (const kv of String(sigHeader).split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = kv.slice(0, i).trim();
    const v = kv.slice(i + 1).trim();
    if (k === 't') timestamp = v;
    if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedBuf = Buffer.from(crypto.createHmac('sha256', secret).update(signedPayload).digest('hex'));

  return signatures.some((signature) => {
    const sigBuf = Buffer.from(signature);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

module.exports = { createCheckoutSession, retrieveCheckoutSession, verifyStripeWebhookSignature, stripeRequest };
