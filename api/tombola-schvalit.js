// api/tombola-schvalit.js
// Schválení nebo zamítnutí žádosti o voucher do tomboly (odkaz z e-mailu pro PEBMedia).
//   GET  ?t=<token>  → přehled žádosti a formulář (hodnota, platnost); sám nic nemění,
//                      takže ho nespustí ani automatická kontrola odkazů v e-mailu
//   POST t, akce=schvalit|zamitnout, hodnota, platnost → vydá voucher (PDF e-mailem
//                      organizátorovi + zápis do správy voucherů) nebo žádost zamítne
//
// Token je podepsaný DOWNLOAD_SIGNING_SECRET a platí 60 dní. Stav žádosti se mění
// atomicky, takže dvojí odeslání formuláře nevydá dva vouchery.

const { setApiHeaders, parseJsonBody } = require('./_lib/security');
const { readJson, updateJson } = require('./_lib/storage');
const { sendEmail } = require('./_lib/email');
const { getSecret, verifyToken, generateVoucherCode } = require('./_lib/tokens');
const { zapsatVoucher } = require('./_lib/vouchery');
const { vytvoritVoucherPdf } = require('./_lib/voucherPdf');

const HODNOTY = [500, 1000, 1500, 2000, 2500, 3000, 5000];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function formatDatum(iso) {
  const [r, m, d] = String(iso).split('-').map(Number);
  return `${d}. ${m}. ${r}`;
}
/** Výchozí platnost: rok od data akce (organizátor ho stihne předat a výherce uplatnit). */
function vychoziPlatnost(datumAkce) {
  const [r, m, d] = String(datumAkce).split('-').map(Number);
  const konec = new Date(Date.UTC(r + 1, m - 1, d));
  if (konec.getUTCMonth() !== m - 1) konec.setUTCDate(0);
  return konec.toISOString().slice(0, 10);
}

function stranka(res, status, titulek, obsah) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(status).send(`<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(titulek)} — PEBMedia</title>
<style>
body{margin:0;background:#F6F6F3;color:#14181B;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:640px;margin:40px auto;padding:0 16px}
.karta{background:#fff;border:1px solid #E3E3DE;border-radius:18px;padding:28px}
h1{font-size:24px;margin:0 0 6px}p{margin:8px 0}.tlumene{color:#565F66;font-size:14px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:18px 0;font-size:15px}dt{color:#565F66}dd{margin:0;overflow-wrap:anywhere}
label{display:block;font-weight:600;margin:16px 0 6px}select,input,textarea{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #CFCFC8;border-radius:10px;font:inherit;background:#fff}
.tlacitka{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
button{border:0;border-radius:999px;padding:12px 22px;font:inherit;font-weight:600;cursor:pointer}
.ano{background:#0B6E63;color:#fff}.ne{background:#fff;color:#B23B3B;border:1px solid #E3C4C4}
.stav{display:inline-block;padding:3px 10px;border-radius:999px;background:#E6EFEC;color:#063E38;font-size:13px;font-weight:600}
.chyba{background:#FBEAEA;color:#7A2323;padding:12px 14px;border-radius:10px}
details{margin-top:18px}summary{cursor:pointer;color:#565F66}
</style></head><body><main><div class="karta">${obsah}</div><p class="tlumene" style="text-align:center">PEBMedia · správa voucherů do tomboly</p></main></body></html>`);
}

function prehled(z) {
  return `<dl>
<dt>Akce</dt><dd>${esc(z.akce)} (${esc(z.typAkce)})</dd>
<dt>Datum</dt><dd>${esc(formatDatum(z.datum))}</dd>
<dt>Místo</dt><dd>${esc(z.misto)}</dd>
<dt>Počet hostů</dt><dd>${z.hoste ? esc(z.hoste) : 'neuvedeno'}</dd>
<dt>Organizace</dt><dd>${esc(z.organizace || 'neuvedeno')}</dd>
<dt>Profil akce</dt><dd>${z.odkaz ? `<a href="${esc(z.odkaz)}" rel="noopener noreferrer" target="_blank">${esc(z.odkaz)}</a>` : 'neuvedeno'}</dd>
<dt>Kontakt</dt><dd>${esc(z.jmeno)}, ${esc(z.email)}${z.telefon ? `, ${esc(z.telefon)}` : ''}</dd>
<dt>Nabídky PEBMedia</dt><dd>${z.souhlasNabidky ? 'souhlasí' : 'nesouhlasí'}</dd>
${z.poznamka ? `<dt>Poznámka</dt><dd>${esc(z.poznamka)}</dd>` : ''}
<dt>Logo</dt><dd>${z.logo ? 'v příloze e-mailu se žádostí' : 'nenahráno'}</dd>
</dl>`;
}

module.exports = async function handler(req, res) {
  setApiHeaders(res);
  const secret = getSecret('DOWNLOAD_SIGNING_SECRET');
  const body = req.method === 'POST' ? (parseJsonBody(req, 8 * 1024) || {}) : {};
  const token = req.method === 'POST' ? body.t : req.query && req.query.t;
  const p = secret && verifyToken(String(token || ''), secret);
  if (!p || p.typ !== 'tombola' || typeof p.id !== 'string' || !/^[0-9a-f-]{10,40}$/.test(p.id) || !(p.exp > Date.now())) {
    stranka(res, 403, 'Neplatný odkaz', '<h1>Odkaz neplatí</h1><p>Odkaz je neplatný nebo vypršel (platí 60 dní).</p>');
    return;
  }
  const cesta = `tombola/zadosti/${p.id}.json`;
  const zaznam = await readJson(cesta);
  if (!zaznam) {
    stranka(res, 404, 'Žádost nenalezena', '<h1>Žádost nenalezena</h1>');
    return;
  }
  const z = zaznam.data;

  if (req.method === 'GET') {
    if (z.stav === 'schvaleno') {
      stranka(res, 200, 'Už schváleno', `<span class="stav">Schváleno</span><h1>${esc(z.akce)}</h1><p>Voucher <strong>${esc(z.kod)}</strong> na ${esc(z.hodnotaKc)} Kč (platnost do ${esc(formatDatum(z.platnostDo))}) byl odeslán na ${esc(z.email)}.</p>${prehled(z)}`);
      return;
    }
    if (z.stav === 'zamitnuto') {
      stranka(res, 200, 'Zamítnuto', `<span class="stav">Zamítnuto</span><h1>${esc(z.akce)}</h1>${prehled(z)}`);
      return;
    }
    const platnost = z.platnostDo || vychoziPlatnost(z.datum);
    stranka(res, 200, 'Žádost o voucher do tomboly', `
<span class="stav">${z.stav === 'vydava' ? 'Vydávání nedokončeno, zkuste znovu' : 'Čeká na schválení'}</span>
<h1>${esc(z.akce)}</h1>
<p class="tlumene">Žádost přišla ${esc(new Date(z.vytvorenoAt).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' }))}.</p>
${prehled(z)}
<form method="post">
<input type="hidden" name="t" value="${esc(token)}">
<label for="hodnota">Hodnota voucheru</label>
<select id="hodnota" name="hodnota">${HODNOTY.map((h) => `<option value="${h}"${h === (z.hodnotaKc || 1000) ? ' selected' : ''}>${h.toLocaleString('cs-CZ')} Kč</option>`).join('')}</select>
<label for="platnost">Platnost do</label>
<input id="platnost" name="platnost" type="date" value="${esc(platnost)}" required>
<div class="tlacitka"><button class="ano" name="akce" value="schvalit">Schválit a poslat voucher</button></div>
<details><summary>Zamítnout žádost</summary>
<label for="duvod">Zpráva organizátorovi (nepovinné, bez ní se nic neposílá)</label>
<textarea id="duvod" name="duvod" rows="3" maxlength="600"></textarea>
<div class="tlacitka"><button class="ne" name="akce" value="zamitnout">Zamítnout</button></div>
</details>
</form>`);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    stranka(res, 405, 'Nepovolená metoda', '<h1>Nepovolená metoda</h1>');
    return;
  }

  // --- Zamítnutí ---
  if (body.akce === 'zamitnout') {
    const duvod = typeof body.duvod === 'string' ? body.duvod.trim().slice(0, 600) : '';
    let zmeneno = false;
    await updateJson(cesta, (d) => {
      if (!d || d.stav !== 'ceka') return undefined;
      zmeneno = true;
      return { ...d, stav: 'zamitnuto', zamitnutoAt: new Date().toISOString() };
    });
    if (zmeneno && duvod) {
      try {
        await sendEmail({ to: z.email, subject: `Žádost o voucher do tomboly — ${z.akce}`, text: `Dobrý den,\n\n${duvod}\n\nPEBMedia\nhttps://pebmedia.cz` });
      } catch (err) {
        console.error('Tombola: zprávu o zamítnutí se nepodařilo odeslat', err.message);
      }
    }
    stranka(res, 200, 'Zamítnuto', `<span class="stav">Zamítnuto</span><h1>${esc(z.akce)}</h1><p>${zmeneno ? (duvod ? 'Žádost je zamítnutá a organizátor dostal vaši zprávu.' : 'Žádost je zamítnutá. Organizátorovi se nic neposlalo.') : 'Žádost už byla vyřízená dřív.'}</p>`);
    return;
  }

  // --- Schválení ---
  const hodnota = Number(body.hodnota);
  const platnost = String(body.platnost || '');
  const dnes = new Date().toISOString().slice(0, 10);
  if (body.akce !== 'schvalit' || !HODNOTY.includes(hodnota) || !/^\d{4}-\d{2}-\d{2}$/.test(platnost) || platnost <= dnes) {
    stranka(res, 400, 'Chyba', '<p class="chyba">Vyberte hodnotu voucheru a platnost v budoucnu.</p><p>Vraťte se v prohlížeči zpět a opravte to.</p>');
    return;
  }

  // Atomicky přiděl kód (jen jednou, i při dvojím odeslání formuláře).
  let vydat = null;
  const po = await updateJson(cesta, (d) => {
    if (!d || d.stav === 'schvaleno' || d.stav === 'zamitnuto') return undefined;
    vydat = { ...d, stav: 'vydava', kod: d.kod || generateVoucherCode(), hodnotaKc: hodnota, platnostDo: platnost };
    return vydat;
  });
  if (!vydat) {
    stranka(res, 200, 'Už vyřízeno', `<h1>${esc(z.akce)}</h1><p>Žádost už byla vyřízená (${po && po.stav === 'schvaleno' ? `voucher ${esc(po.kod)}` : 'zamítnuto'}).</p>`);
    return;
  }

  let sprava;
  try {
    const r = await zapsatVoucher({ kod: vydat.kod, hodnotaKc: hodnota, platnostDo: platnost, zdroj: `Tombola: ${vydat.akce}` });
    sprava = r === 'zapsano' ? 'ano' : 'přeskočeno (není nastaven klíč Supabase)';
  } catch (err) {
    console.error('Tombola: zápis do správy voucherů selhal', err.message);
    sprava = 'NE, doplňte voucher do správy ručně';
  }

  try {
    const pdf = await vytvoritVoucherPdf({ kod: vydat.kod, hodnotaKc: hodnota, platnostDo: platnost });
    await sendEmail({
      to: vydat.email,
      subject: `Váš voucher PEBMedia do tomboly — ${vydat.akce}`,
      attachments: [{ filename: `voucher-pebmedia-${vydat.kod}.pdf`, content: pdf.toString('base64') }],
      text: `Dobrý den,\n\nrádi přispějeme do tomboly na akci „${vydat.akce}“. V příloze posíláme dárkový voucher PEBMedia v hodnotě ${hodnota.toLocaleString('cs-CZ')} Kč jako PDF připravené k tisku.\n\nKód: ${vydat.kod}\nPlatnost do: ${formatDatum(platnost)}\n\nVýherce voucher uplatní při objednávce služby PEBMedia (web, e-shop, logo a další), stačí kód zmínit v poptávce na info.pebmedia@gmail.com. Podmínky voucheru: https://pebmedia.cz/voucher.html\n\nAť se akce vydaří! Budeme rádi, když nás na sociálních sítích akce označí (@pebmedia).\n\nPEBMedia\nhttps://pebmedia.cz`
    });
  } catch (err) {
    console.error('Tombola: odeslání voucheru selhalo', err.message);
    stranka(res, 502, 'Nepodařilo se odeslat', `<p class="chyba">Voucher ${esc(vydat.kod)} je připravený, ale e-mail se nepodařilo odeslat. Otevřete prosím odkaz z e-mailu znovu a zkuste to ještě jednou (kód zůstane stejný).</p>`);
    return;
  }

  await updateJson(cesta, (d) => (d ? { ...d, stav: 'schvaleno', schvalenoAt: new Date().toISOString(), sprava } : undefined));
  stranka(res, 200, 'Schváleno', `<span class="stav">Schváleno</span><h1>${esc(vydat.akce)}</h1><p>Voucher <strong>${esc(vydat.kod)}</strong> na ${hodnota.toLocaleString('cs-CZ')} Kč (platnost do ${esc(formatDatum(platnost))}) odešel jako PDF na ${esc(vydat.email)}.</p><p class="tlumene">Zapsáno do správy voucherů: ${esc(sprava)}</p>`);
};
