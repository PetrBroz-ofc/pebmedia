// api/_lib/vouchery.js
// Zapíše voucher prodaný v obchodě do interní správy voucherů PEBMedia
// (Supabase, tabulka "vouchers" — aplikace pebmedia-vocuhery).
//
// Potřebné proměnné prostředí (jinak se zápis přeskočí):
//   SUPABASE_URL               - např. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  - serverový klíč (Secret ve Vercelu, NIKDY do prohlížeče ani do repozitáře)

const ZDROJ = 'Online obchod';

function nastaveno() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Vloží voucher se stavem "active". Je idempotentní: kód voucheru je v tabulce
 * unikátní, opakovaný zápis téhož kódu se ignoruje (Stripe může událost poslat víckrát).
 * @returns {Promise<'zapsano'|'preskoceno'>}
 */
async function zapsatVoucher({ kod, hodnotaKc, platnostDo, zdroj = ZDROJ }) {
  if (!nastaveno()) return 'preskoceno';
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/vouchers?on_conflict=voucher_id`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify({
      voucher_id: kod,
      amount: hodnotaKc,
      status: 'active',
      valid_until: platnostDo,
      school: String(zdroj).slice(0, 200)
    })
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'zapsano';
}

module.exports = { zapsatVoucher };
