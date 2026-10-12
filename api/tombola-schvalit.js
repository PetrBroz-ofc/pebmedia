// api/tombola-schvalit.js
// Schválení nebo zamítnutí žádosti o voucher do tomboly (odkaz z e-mailu pro PEBMedia).
//   GET  ?t=<token>  → přehled žádosti a formulář (hodnota, platnost); sám nic nemění,
//                      takže ho nespustí ani automatická kontrola odkazů v e-mailu
//   POST t, akce=schvalit|zamitnout, hodnota, pocet, platnost → vydá vouchery (PDF e-mailem
//                      organizátorovi + zápis do správy voucherů) nebo žádost zamítne
//
// Token je podepsaný DOWNLOAD_SIGNING_SECRET a platí 60 dní. Stav žádosti se mění
// atomicky, takže dvojí odeslání formuláře nevydá dva vouchery.

const { setApiHeaders, parseJsonBody } = require('./_lib/security');
const { readJson, writeJson, updateJson } = require('./_lib/storage');
const { sendEmail } = require('./_lib/email');
const { getSecret, verifyToken, generateVoucherCode } = require('./_lib/tokens');
const { zapsatVoucher } = require('./_lib/vouchery');
const { vytvoritVoucherPdf } = require('./_lib/voucherPdf');

const HODNOTY = [500, 1000, 1500, 2000, 2500, 3000, 5000];
const MAX_POCET = 50; // víc voucherů najednou (např. pro celou školu)
/** Kódy vydané pro žádost (starší žádosti mají jen jeden `kod`). */
const kodyZadosti = (d) => (Array.isArray(d.kody) && d.kody.length ? d.kody : d.kod ? [d.kod] : []);
const voucheru = (n) => (n === 1 ? 'voucher' : n < 5 ? 'vouchery' : 'voucherů');

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
      const kody = kodyZadosti(z);
      stranka(res, 200, 'Už schváleno', `<span class="stav">Schváleno</span><h1>${esc(z.akce)}</h1><p>${kody.length} ${voucheru(kody.length)} po ${esc(z.hodnotaKc)} Kč (platnost do ${esc(formatDatum(z.platnostDo))}) ${kody.length === 1 ? 'byl odeslán' : 'byly odeslány'} na ${esc(z.email)}: <strong>${kody.map(esc).join(', ')}</strong></p>${prehled(z)}`);
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
<label for="pocet">Počet voucherů</label>
<input id="pocet" name="pocet" type="number" min="1" max="${MAX_POCET}" step="1" value="${esc(kodyZadosti(z).length || 1)}" required inputmode="numeric">
<p class="tlumene">Každý voucher dostane vlastní kód. Všechny přijdou v jednom PDF (jeden voucher na stránku) a všechny se zapíší do správy voucherů.</p>
<label for="platnost">Platnost do</label>
<input id="platnost" name="platnost" type="date" value="${esc(platnost)}" required>
<div class="tlacitka"><button class="ano" name="akce" value="schvalit">Schválit a poslat vouchery</button></div>
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
  const pocet = Number(body.pocet || 1);
  const platnost = String(body.platnost || '');
  const dnes = new Date().toISOString().slice(0, 10);
  if (body.akce !== 'schvalit' || !HODNOTY.includes(hodnota) || !Number.isInteger(pocet) || pocet < 1 || pocet > MAX_POCET || !/^\d{4}-\d{2}-\d{2}$/.test(platnost) || platnost <= dnes) {
    stranka(res, 400, 'Chyba', `<p class="chyba">Vyberte hodnotu voucheru, počet 1 až ${MAX_POCET} a platnost v budoucnu.</p><p>Vraťte se v prohlížeči zpět a opravte to.</p>`);
    return;
  }

  // Atomicky přiděl kódy (jen jednou, i při dvojím odeslání formuláře). Při opakování
  // po chybě se už přidělené kódy použijí znovu a jen se doplní nebo zkrátí na nový počet.
  let vydat = null;
  const po = await updateJson(cesta, (d) => {
    if (!d || d.stav === 'schvaleno' || d.stav === 'zamitnuto') return undefined;
    const kody = kodyZadosti(d).slice(0, pocet);
    while (kody.length < pocet) kody.push(generateVoucherCode());
    vydat = { ...d, stav: 'vydava', kody, kod: kody[0], hodnotaKc: hodnota, platnostDo: platnost };
    return vydat;
  });
  if (!vydat) {
    const hotove = po ? kodyZadosti(po) : [];
    stranka(res, 200, 'Už vyřízeno', `<h1>${esc(z.akce)}</h1><p>Žádost už byla vyřízená (${po && po.stav === 'schvaleno' ? `${hotove.length} ${voucheru(hotove.length)}: ${hotove.map(esc).join(', ')}` : 'zamítnuto'}).</p>`);
    return;
  }
  const kody = vydat.kody;

  const jeden = kody.length === 1;
  const nazevPdf = jeden ? `voucher-pebmedia-${kody[0]}.pdf` : `vouchery-pebmedia-${kody.length}x${hodnota}.pdf`;

  // 1) Nejdřív PDF a e-mail organizátorovi: to je to hlavní a nesmí to čekat na nic jiného.
  let pdf;
  try {
    pdf = await vytvoritVoucherPdf(kody.map((kod) => ({ kod, hodnotaKc: hodnota, platnostDo: platnost })));
    await sendEmail({
      to: vydat.email,
      subject: `${jeden ? 'Váš voucher' : `Vaše vouchery (${kody.length})`} PEBMedia do tomboly — ${vydat.akce}`,
      attachments: [{ filename: nazevPdf, content: pdf.toString('base64') }],
      text: `Dobrý den,\n\nrádi přispějeme do tomboly na akci „${vydat.akce}“. V příloze posíláme ${jeden ? `dárkový voucher PEBMedia v hodnotě ${hodnota.toLocaleString('cs-CZ')} Kč` : `${kody.length} ${voucheru(kody.length)} PEBMedia, každý v hodnotě ${hodnota.toLocaleString('cs-CZ')} Kč (jeden voucher na stránku)`} jako PDF připravené k tisku.\n\n${jeden ? 'Kód' : 'Kódy'}: ${kody.join(', ')}\nPlatnost do: ${formatDatum(platnost)}\n\nVýherce voucher uplatní při objednávce služby PEBMedia (web, e-shop, logo a další), stačí kód zmínit v poptávce na info.pebmedia@gmail.com. Každý kód lze uplatnit jednou. Podmínky voucheru: https://pebmedia.cz/voucher.html\n\nAť se akce vydaří! Budeme rádi, když nás na sociálních sítích akce označí (@pebmedia).\n\nPEBMedia\nhttps://pebmedia.cz`
    });
  } catch (err) {
    console.error('Tombola: vytvoření nebo odeslání voucherů selhalo', err);
    stranka(res, 502, 'Nepodařilo se odeslat', `<p class="chyba">${jeden ? 'Voucher je připravený' : `${kody.length} ${voucheru(kody.length)} je připraveno`} (${kody.map(esc).join(', ')}), ale ${pdf ? 'e-mail se nepodařilo odeslat' : 'PDF se nepodařilo vytvořit'}. Otevřete prosím odkaz z e-mailu znovu a zkuste to ještě jednou (kódy zůstanou stejné).</p><p class="tlumene">Důvod: ${esc(String(err && err.message || err).slice(0, 400))}</p>`);
    return;
  }

  // 2) Zápis do správy voucherů (všechny kódy jedním požadavkem).
  let sprava;
  try {
    const r = await zapsatVoucher({ kody, hodnotaKc: hodnota, platnostDo: platnost, zdroj: `Tombola: ${vydat.akce}` });
    sprava = r === 'zapsano' ? `ano (${kody.length})` : 'přeskočeno (ve Vercelu chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY)';
  } catch (err) {
    console.error('Tombola: zápis do správy voucherů selhal', err.message);
    sprava = `NE (${String(err.message).slice(0, 160)}), doplňte kódy do správy ručně`;
  }
  // Konečný stav se zapíše přímo (bez kontroly verze): žádost je od přidělení kódů
  // zamčená ve stavu „vydava“ a Blob chvíli po zápisu vrací starou verzi, takže
  // atomická úprava by tu zbytečně selhávala (a e-mail už v tu chvíli odešel).
  try {
    await writeJson(cesta, { ...vydat, stav: 'schvaleno', schvalenoAt: new Date().toISOString(), sprava });
  } catch (err) {
    console.error('Tombola: uložení stavu „schváleno“ selhalo (vouchery už odešly)', err.message);
  }

  // 3) Kopie pro PEBMedia i s PDF (kdyby organizátor e-mail nenašel, jde ho přeposlat).
  try {
    await sendEmail({
      to: process.env.ORDER_NOTIFY_EMAIL || 'info.pebmedia@gmail.com',
      subject: `Odesláno: ${kody.length} ${voucheru(kody.length)} do tomboly — ${vydat.akce}`,
      attachments: [{ filename: nazevPdf, content: pdf.toString('base64') }],
      text: `Vouchery do tomboly byly odeslány.\n\nAkce: ${vydat.akce}\nOrganizátor: ${vydat.jmeno}, ${vydat.email}\nPočet: ${kody.length} × ${hodnota.toLocaleString('cs-CZ')} Kč\nPlatnost do: ${formatDatum(platnost)}\nKódy: ${kody.join(', ')}\nZapsáno do správy voucherů: ${sprava}\n\nPDF je v příloze, kdyby bylo potřeba ho organizátorovi přeposlat.\n`
    });
  } catch (err) {
    console.error('Tombola: kopii pro PEBMedia se nepodařilo odeslat', err.message);
  }

  stranka(res, 200, 'Schváleno', `<span class="stav">Schváleno</span><h1>${esc(vydat.akce)}</h1><p>${kody.length} ${voucheru(kody.length)} po ${hodnota.toLocaleString('cs-CZ')} Kč (platnost do ${esc(formatDatum(platnost))}) ${jeden ? 'odešel' : 'odešly'} jako PDF na ${esc(vydat.email)}. Kopii s PDF jsme poslali i vám.</p><p><strong>${kody.map(esc).join(', ')}</strong></p><p class="tlumene">Zapsáno do správy voucherů: ${esc(sprava)}</p>`);
};

