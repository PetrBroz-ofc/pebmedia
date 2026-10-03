#!/usr/bin/env node
// scripts/predgeneruj.js
//
// Předgeneruje obsah webu do statického HTML, aby ho viděli i roboti, kteří
// nespouštějí JavaScript (AI vyhledávače: GPTBot, ClaudeBot, PerplexityBot…),
// a aby Google nemusel čekat na vykreslení.
//
// Jediný zdroj pravdy jsou data/content.json a data/shop.json — skript NIC
// nevymýšlí, jen přenáší data do HTML, strukturovaných dat a souborů pro roboty:
//   - index.html          obsah sekcí + JSON-LD (firma, služby s cenami, FAQ)
//   - obchod/*            výpisy produktů + JSON-LD (drobečková navigace, seznamy)
//   - llms.txt            souhrn webu v Markdownu pro AI asistenty
//   - sitemap.xml         všechny indexovatelné stránky
//   - js/content-fallback.js   offline záloha obsahu
//
// Prohlížeč po načtení obsah stejně překreslí z živého data/content.json,
// takže změny z administrace se projeví hned i bez spuštění tohoto skriptu.
//
// Spuštění:  node scripts/predgeneruj.js        (nebo: npm run predgeneruj)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://pebmedia.cz';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const readJson = (f) => JSON.parse(read(f));

/**
 * Zapíše soubor se stejnými konci řádků, jaké má existující soubor (na Windows
 * CRLF kvůli autocrlf, v GitHub Actions LF); vrací true při změně.
 */
function write(f, text) {
  const full = path.join(ROOT, f);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  const eol = existing !== null ? (existing.includes('\r\n') ? '\r\n' : '\n') : (process.platform === 'win32' ? '\r\n' : '\n');
  const out = text.replace(/\r?\n/g, eol);
  if (existing === out) return false;
  fs.writeFileSync(full, out);
  return true;
}

const content = readJson('data/content.json');
const shop = readJson('data/shop.json');
const visibleProducts = shop.products.filter((p) => !p.skryto);

// Každý zobrazený produkt musí mít aspoň jednu fotku nebo video, které opravdu existuje.
const bezMedii = visibleProducts.filter((p) => !(p.media || []).some((m) => m && m.src && fs.existsSync(path.join(ROOT, m.src))));
if (bezMedii.length) {
  console.error(`Produkty bez fotky/videa (doplňte "media" v data/shop.json): ${bezMedii.map((p) => p.id).join(', ')}`);
  process.exit(1);
}
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const visible = (x) => x.visible !== false;

// Lidsky čitelné názvy kategorií služeb (nadpisy v content.json jsou slogany).
const NAZVY_KATEGORII = {
  'cat-web': 'Tvorba webových stránek a e-shopů',
  'cat-branding': 'Branding a vizuální identita',
  'cat-security': 'Kybernetická bezpečnost webu',
  'cat-tech': 'AI integrace a automatizace'
};

/** "Od 12 800 Kč" → { price: 12800, od: true }, "490 Kč / měsíc" → { price: 490, mesicne: true } */
function parsePrice(text) {
  const m = String(text || '').replace(/ /g, ' ').match(/(\d[\d ]*)\s*Kč/);
  if (!m) return null;
  return {
    price: Number(m[1].replace(/ /g, '')),
    od: /^\s*od\b/i.test(text),
    mesicne: /měsíc/i.test(text)
  };
}

function offerFor(name, description, priceText, url) {
  const p = parsePrice(priceText);
  const offer = {
    '@type': 'Offer',
    itemOffered: { '@type': 'Service', name, ...(description ? { description } : {}) },
    url
  };
  if (p) {
    offer.priceCurrency = 'CZK';
    if (p.od || p.mesicne) {
      offer.priceSpecification = {
        '@type': p.mesicne ? 'UnitPriceSpecification' : 'PriceSpecification',
        priceCurrency: 'CZK',
        minPrice: p.price,
        ...(p.mesicne ? { unitText: 'měsíc', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } } : {})
      };
    } else {
      offer.price = p.price;
    }
  }
  return offer;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Strukturovaná data (JSON-LD)
// ---------------------------------------------------------------------------
function organizationLd() {
  const g = content.general;
  const sameAs = [g.social && g.social.instagram].filter(Boolean); // LinkedIn/Facebook zatím nejsou založené
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${BASE}/#organization`,
    name: g.brand,
    slogan: g.claim,
    url: `${BASE}/`,
    logo: `${BASE}/assets/logo-mark-p.png`,
    image: `${BASE}/${content.seo.ogImage || 'assets/og-image.jpg'}`,
    description: content.seo.description,
    email: g.email,
    telephone: g.phone.replace(/\s+/g, ''),
    identifier: { '@type': 'PropertyValue', propertyID: 'IČO', value: g.ico },
    founder: { '@type': 'Person', name: 'Petr Brož' },
    priceRange: 'Kč',
    currenciesAccepted: 'CZK',
    legalName: g.provozovatel.jmeno,
    address: {
      '@type': 'PostalAddress',
      streetAddress: g.provozovatel.ulice,
      addressLocality: g.provozovatel.obec,
      postalCode: g.provozovatel.psc,
      addressRegion: 'Liberecký kraj',
      addressCountry: 'CZ'
    },
    areaServed: { '@type': 'Country', name: 'Česká republika' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: g.email,
      telephone: g.phone.replace(/\s+/g, ''),
      availableLanguage: ['cs']
    },
    knowsAbout: content.services.categories.slice().sort(byOrder).map((c) => NAZVY_KATEGORII[c.id] || stripTags(c.title)),
    sameAs,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Služby PEBMedia',
      itemListElement: [
        ...content.services.categories.slice().sort(byOrder).map((c) => ({
          '@type': 'OfferCatalog',
          name: NAZVY_KATEGORII[c.id] || stripTags(c.title),
          description: stripTags(c.text),
          itemListElement: c.items.slice().sort(byOrder).map((it) => offerFor(stripTags(it.name), null, it.price, `${BASE}/#sluzby`))
        })),
        {
          '@type': 'OfferCatalog',
          name: 'Balíčky',
          itemListElement: content.packages.items.filter(visible).sort(byOrder).map((p) =>
            offerFor(stripTags(p.name), stripTags(p.description) + (p.features && p.features.length ? ` Obsahuje: ${p.features.map(stripTags).join(', ')}.` : ''), p.price, `${BASE}/#balicky`))
        }
      ]
    }
  };
}

function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE}/#website`,
    url: `${BASE}/`,
    name: content.general.brand,
    description: content.seo.description,
    publisher: { '@id': `${BASE}/#organization` },
    inLanguage: 'cs-CZ'
  };
}

function faqLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: content.faq.items.filter(visible).sort(byOrder).map((f) => ({
      '@type': 'Question',
      name: stripTags(f.question),
      acceptedAnswer: { '@type': 'Answer', text: stripTags(f.answer) }
    }))
  };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${BASE}${url}` }))
  };
}

function productUrl(p) {
  return p.kategorie === 'doplnky'
    ? `/obchod/doplnky/${p.slug || p.id.replace(/^doplnek-/, '')}/`
    : `/obchod/${p.kategorie}/#${p.id}`;
}

function productLd(p) {
  return {
    '@type': 'Product',
    name: p.nazev,
    description: p.popis,
    url: `${BASE}${productUrl(p)}`,
    image: (p.media || []).map((m) => `${BASE}/${m.poster || m.src}`).filter((u) => !/\.(mp4|webm)$/.test(u)),
    ...((p.media || []).some((m) => m.type === 'video') ? { subjectOf: (p.media || []).filter((m) => m.type === 'video').map((m) => ({
      '@type': 'VideoObject', name: m.alt, description: m.alt, contentUrl: `${BASE}/${m.src}`,
      ...(m.poster ? { thumbnailUrl: `${BASE}/${m.poster}` } : {}), ...(m.uploadDate ? { uploadDate: m.uploadDate } : {})
    })) } : {}),
    brand: { '@type': 'Brand', name: 'PEBMedia' },
    offers: {
      '@type': 'Offer',
      url: `${BASE}${productUrl(p)}`,
      priceCurrency: 'CZK',
      price: p.zdarma ? 0 : p.cena_kc,
      availability: 'https://schema.org/InStock',
      seller: { '@id': `${BASE}/#organization` }
    }
  };
}

function itemListLd(name, products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, item: productLd(p) }))
  };
}

/** Nahradí všechny JSON-LD bloky v dokumentu novými (vloží je na konec <head>). */
function setJsonLd(document, blocks) {
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    const next = s.nextSibling;
    if (next && next.nodeType === 3 && !next.textContent.trim()) next.remove();
    s.remove();
  });
  for (const block of blocks) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = `\n${JSON.stringify(block, null, 2)}\n`;
    document.head.appendChild(s);
    document.head.appendChild(document.createTextNode('\n'));
  }
}

function setRobots(document, index) {
  const meta = document.querySelector('meta[name="robots"]');
  if (meta) meta.setAttribute('content', index ? 'index, follow' : 'noindex, follow');
}

// ---------------------------------------------------------------------------
// Společné rozložení všech stránek: povinné údaje o provozovateli, patička
// s právními odkazy, lokální písma (žádné Google Fonts kvůli GDPR).
// ---------------------------------------------------------------------------
const P = content.general.provozovatel;
const SIDLO = `${P.ulice}, ${P.castObce}, ${P.psc} ${P.obec}`;
const UDAJE = {
  jmeno: P.jmeno,
  ico: P.ico,
  sidlo: SIDLO,
  rejstrik: P.rejstrik,
  dph: P.dph,
  zivnostenskyUrad: P.zivnostenskyUrad,
  email: content.general.email,
  telefon: content.general.phone
};

function legalFooterHtml(root) {
  const odkazy = [
    ['obchod/podminky/', 'Obchodní podmínky'],
    ['obchod/reklamacni-rad/', 'Reklamační řád'],
    ['obchod/odstoupeni/', 'Odstoupení od smlouvy'],
    ['privacy.html', 'Ochrana osobních údajů', 'footerPrivacy'],
    ['privacy.html#cookies', 'Cookies'],
    ['voucher.html', 'Podmínky voucheru']
  ];
  return `
      <p class="footer-operator">Provozovatel: <strong>${P.jmeno}</strong> · IČO ${P.ico} · sídlo ${SIDLO} · ${P.rejstrik} · ${P.dph}</p>
      <nav class="footer-legal-links" aria-label="Právní informace">
        ${odkazy.map(([href, text, id]) => `<a${id ? ` id="${id}"` : ''} href="${root}${href}">${text}</a>`).join('\n        ')}
      </nav>
      <span class="footer-copy" id="footerCopyright">${content.footer.copyright}</span>
    `;
}

function applyLayout(d, file) {
  const root = '../'.repeat(file.split('/').length - 1);

  // Písma: místo Google Fonts lokální css/fonts.css.
  d.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]').forEach((l) => {
    const prev = l.previousSibling;
    if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
    l.remove();
  });
  d.querySelectorAll('head').forEach((head) => {
    for (const node of [...head.childNodes]) {
      if (node.nodeType === 8 && /Fonty/.test(node.textContent)) node.remove();
    }
  });
  const styleCss = d.querySelector('link[href*="css/style.css"]');
  const ensureLink = (href, after) => {
    const name = href.split('?')[0];
    if (d.querySelector(`link[href*="${name}"]`)) return d.querySelector(`link[href*="${name}"]`);
    const link = d.createElement('link');
    link.rel = 'stylesheet';
    link.href = root + href;
    if (after) after.after(d.createTextNode('\n'), link); else d.head.appendChild(link);
    return link;
  };
  if (styleCss) {
    if (!d.querySelector('link[href*="css/fonts.css"]')) {
      const f = d.createElement('link');
      f.rel = 'stylesheet';
      f.href = `${root}css/fonts.css?v=1`;
      styleCss.before(f, d.createTextNode('\n'));
    }
    const last = d.querySelector('link[href*="css/shop.css"]') || styleCss;
    ensureLink('css/legal.css?v=1', last);
  }

  // Údaje o provozovateli v textech (data-udaj="…").
  d.querySelectorAll('[data-udaj]').forEach((n) => {
    const k = n.getAttribute('data-udaj');
    if (k === 'email-odkaz') { n.setAttribute('href', `mailto:${UDAJE.email}`); n.textContent = UDAJE.email; return; }
    if (k === 'email-odstoupeni') {
      n.setAttribute('href', `mailto:${UDAJE.email}?subject=${encodeURIComponent('Odstoupení od smlouvy')}&body=${encodeURIComponent('Oznamuji, že tímto odstupuji od smlouvy o nákupu tohoto produktu:\n\nDatum objednání / zaplacení:\nKód voucheru nebo číslo objednávky:\nJméno a příjmení:\nE-mail použitý při nákupu:\n')}`);
      return;
    }
    if (UDAJE[k] !== undefined) n.textContent = UDAJE[k];
  });

  // Patička s identifikací provozovatele a právními odkazy — na každé stránce.
  let block = d.getElementById('footerLegal');
  if (!block) {
    block = d.createElement('div');
    block.id = 'footerLegal';
    const bottom = d.querySelector('footer .footer-bottom');
    if (bottom) {
      bottom.replaceWith(block);
    } else {
      const footer = d.createElement('footer');
      footer.className = 'site-footer shop-footer';
      const container = d.createElement('div');
      container.className = 'container';
      container.appendChild(block);
      footer.appendChild(container);
      const firstScript = [...d.body.children].find((c) => c.tagName === 'SCRIPT' || c.tagName === 'DIALOG');
      d.body.insertBefore(footer, firstScript || null);
      d.body.insertBefore(d.createTextNode('\n'), footer);
    }
  }
  block.className = 'footer-bottom footer-legal';
  block.innerHTML = legalFooterHtml(root);
}

// ---------------------------------------------------------------------------
// Vykreslení stránky v jsdom (spustí skutečný js/main.js nebo js/shop.js)
// ---------------------------------------------------------------------------
async function renderPage(file, scriptFile, { onDocument } = {}) {
  const html = read(file);
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { throw e; });
  const dom = new JSDOM(html, {
    url: `${BASE}/${file.replace(/index\.html$/, '')}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });
  const w = dom.window;
  w.fetch = async (url) => {
    const u = String(url);
    const data = u.endsWith('data/content.json') ? content : u.endsWith('data/shop.json') ? shop : null;
    if (!data) throw new Error(`predgeneruj: neočekávaný fetch ${u}`);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => JSON.parse(JSON.stringify(data)) };
  };
  w.scrollTo = () => {};

  if (scriptFile) {
    w.eval(read(scriptFile));
    await new Promise((r) => setTimeout(r, 100));
  }

  const d = w.document;
  // Úklid stavu, který patří jen do živého prohlížeče.
  d.querySelectorAll('.is-visible').forEach((e) => e.classList.remove('is-visible'));
  d.querySelectorAll('.is-active').forEach((e) => e.classList.remove('is-active'));
  d.querySelectorAll('[data-lightbox-bound]').forEach((e) => e.removeAttribute('data-lightbox-bound'));
  d.querySelectorAll('[aria-current="location"]').forEach((e) => e.removeAttribute('aria-current'));
  ['scrollProgress'].forEach((id) => { const n = d.getElementById(id); if (n) n.removeAttribute('style'); });
  d.querySelectorAll('.nav-indicator').forEach((n) => { n.removeAttribute('style'); n.classList.remove('is-visible'); });
  const msgs = d.getElementById('helpWidgetMessages');
  if (msgs) msgs.innerHTML = '';
  d.body.removeAttribute('style');
  if (d.body.getAttribute('class') === '') d.body.removeAttribute('class');

  applyLayout(d, file);
  if (onDocument) onDocument(d);

  // Prázdné řádky se nesmí při opakovaném běhu hromadit (idempotence).
  d.head.childNodes.forEach((n) => { if (n.nodeType === 3 && !n.textContent.trim()) n.textContent = '\n'; });
  while (d.body.lastChild && d.body.lastChild.nodeType === 3 && !d.body.lastChild.textContent.trim()) d.body.lastChild.remove();
  d.body.appendChild(d.createTextNode('\n'));
  const changed = write(file, dom.serialize().replace(/\s*$/, '\n'));
  w.close();
  return changed;
}

// ---------------------------------------------------------------------------
// llms.txt — souhrn pro AI asistenty (https://llmstxt.org)
// ---------------------------------------------------------------------------
function llmsTxt() {
  const g = content.general;
  const L = [];
  L.push(`# ${g.brand}`, '');
  L.push(`> ${content.seo.description}`, '');
  L.push(`${stripTags(content.about.text)}`, '');
  L.push('## Základní údaje', '');
  L.push(`- Web: ${BASE}/`);
  L.push(`- E-mail: ${g.email}`);
  L.push(`- Telefon: ${g.phone}`);
  L.push(`- Provozovatel: ${g.provozovatel.jmeno}, IČO ${g.ico}, sídlo ${g.provozovatel.ulice}, ${g.provozovatel.castObce}, ${g.provozovatel.psc} ${g.provozovatel.obec} (${g.provozovatel.rejstrik}, ${g.provozovatel.dph})`);
  L.push(`- Sídlo / působnost: ${g.address}; zakázky po celé České republice`);
  if (g.social && g.social.instagram) L.push(`- Instagram: ${g.social.instagram}`);
  L.push('');
  L.push('## Služby a orientační ceny', '');
  content.services.categories.slice().sort(byOrder).forEach((c) => {
    L.push(`### ${NAZVY_KATEGORII[c.id] || stripTags(c.title)}`, '');
    L.push(stripTags(c.text), '');
    c.items.slice().sort(byOrder).forEach((it) => L.push(`- ${stripTags(it.name)}: ${stripTags(it.price)}`));
    if (c.note) L.push('', stripTags(c.note));
    L.push('');
  });
  if (content.services.priceNote) L.push(stripTags(content.services.priceNote), '');
  L.push('## Balíčky', '');
  content.packages.items.filter(visible).sort(byOrder).forEach((p) => {
    L.push(`- **${stripTags(p.name)}** (${stripTags(p.price)}): ${stripTags(p.description)} Obsahuje: ${p.features.map(stripTags).join(', ')}.`);
  });
  if (content.packages.priceNote) L.push('', stripTags(content.packages.priceNote));
  L.push('');
  L.push('## Jak spolupráce probíhá', '');
  content.process.steps.forEach((s, i) => L.push(`${i + 1}. **${stripTags(s.title)}** — ${stripTags(s.text)}`));
  L.push('');
  L.push('## Ukázky realizovaných webů', '');
  content.portfolio.items.slice().sort(byOrder).forEach((p) => {
    L.push(`- ${stripTags(p.title)} (${stripTags(p.category)})${p.link ? `: ${p.link}` : ''}`);
  });
  L.push('');
  L.push('## Časté otázky', '');
  content.faq.items.filter(visible).sort(byOrder).forEach((f) => {
    L.push(`### ${stripTags(f.question)}`, '', stripTags(f.answer), '');
  });
  L.push('## Obchod', '');
  L.push(`Dárkové vouchery na služby a hotové doplňky pro weby: ${BASE}/obchod/`, '');
  visibleProducts.forEach((p) => L.push(`- [${p.nazev}](${BASE}${productUrl(p)}): ${p.zdarma ? 'zdarma' : `${p.cena_kc} Kč`} — ${p.popis}`));
  L.push('');
  L.push('## Důležité stránky', '');
  L.push(`- [Hlavní stránka](${BASE}/): služby, balíčky, portfolio, reference, kontakt`);
  L.push(`- [Obchod](${BASE}/obchod/)`);
  L.push(`- [Podmínky využití voucheru](${BASE}/voucher.html)`);
  L.push(`- [Obchodní podmínky obchodu](${BASE}/obchod/podminky/)`);
  L.push(`- [Reklamační řád](${BASE}/obchod/reklamacni-rad/)`);
  L.push(`- [Odstoupení od smlouvy](${BASE}/obchod/odstoupeni/)`);
  L.push(`- [Ochrana osobních údajů a cookies](${BASE}/privacy.html)`);
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Sitemap — všechny stránky s robots "index"
// ---------------------------------------------------------------------------
/** Všechny HTML stránky webu (i nové, které ještě nejsou v gitu). */
function htmlFiles(dir = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (['node_modules', 'produkty', '.git', '.github', 'api', 'scripts', 'assets', '.claude'].includes(e.name)) continue;
      out.push(...htmlFiles(rel));
    } else if (e.name.endsWith('.html') && e.name !== 'admin.html') {
      out.push(rel);
    }
  }
  return out.sort();
}

function sitemapXml() {
  const files = htmlFiles();
  const today = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const f of files) {
    const html = read(f);
    const robots = (html.match(/name="robots" content="([^"]*)"/) || [])[1] || 'index';
    if (/noindex/.test(robots)) continue;
    const dirty = execSync(`git status --porcelain -- "${f}"`, { cwd: ROOT }).toString().trim();
    const lastmod = dirty ? today : (execSync(`git log -1 --format=%cs -- "${f}"`, { cwd: ROOT }).toString().trim() || today);
    const loc = `${BASE}/${f.replace(/index\.html$/, '')}`;
    const priority = f === 'index.html' ? '1.0' : f.startsWith('obchod/') && f.split('/').length <= 3 ? '0.8' : f.startsWith('obchod/doplnky/') ? '0.7' : '0.4';
    entries.push(`  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
async function main() {
  const zmeny = [];
  const zaznam = (f, changed) => { if (changed) zmeny.push(f); };

  zaznam('index.html', await renderPage('index.html', 'js/main.js', {
    onDocument: (d) => {
      // Náhledy při sdílení (Facebook, LinkedIn, X, WhatsApp…) = stejný titulek a popis jako pro Google.
      const meta = (sel, value) => { const m = d.querySelector(sel); if (m) m.setAttribute('content', value); };
      meta('meta[property="og:title"]', content.seo.title);
      meta('meta[property="og:description"]', content.seo.description);
      meta('meta[name="twitter:title"]', content.seo.title);
      meta('meta[name="twitter:description"]', content.seo.description);
      setJsonLd(d, [organizationLd(), websiteLd(), faqLd()]);
    }
  }));

  const obchod = [['Obchod', '/obchod/']];
  zaznam('obchod/index.html', await renderPage('obchod/index.html', 'js/shop.js', {
    onDocument: (d) => setJsonLd(d, [breadcrumbLd([['PEBMedia', '/'], ...obchod]), itemListLd('Obchod PEBMedia', visibleProducts)])
  }));
  for (const [kat, nazev] of [['doplnky', 'Doplňky pro váš web'], ['vouchery', 'Vouchery']]) {
    const produkty = visibleProducts.filter((p) => p.kategorie === kat);
    zaznam(`obchod/${kat}/index.html`, await renderPage(`obchod/${kat}/index.html`, 'js/shop.js', {
      onDocument: (d) => setJsonLd(d, [breadcrumbLd([['PEBMedia', '/'], ...obchod, [nazev, `/obchod/${kat}/`]]), itemListLd(nazev, produkty)])
    }));
  }
  const ebooky = visibleProducts.filter((p) => p.kategorie === 'ebooky');
  zaznam('obchod/ebooky/index.html', await renderPage('obchod/ebooky/index.html', 'js/shop.js', {
    onDocument: (d) => {
      // Prázdná kategorie se neindexuje (tenký obsah); jakmile e-book přibude, zapne se sama.
      setRobots(d, ebooky.length > 0);
      setJsonLd(d, [breadcrumbLd([['PEBMedia', '/'], ...obchod, ['E-booky', '/obchod/ebooky/']]), ...(ebooky.length ? [itemListLd('E-booky', ebooky)] : [])]);
    }
  }));
  for (const p of visibleProducts.filter((x) => x.kategorie === 'doplnky')) {
    const f = `${productUrl(p).slice(1)}index.html`;
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    zaznam(f, await renderPage(f, 'js/shop.js', {
      onDocument: (d) => {
        // Náhled na detailu = všechna média produktu ze shop.json (fotky i videa).
        const preview = d.querySelector('.product-preview');
        if (preview) preview.innerHTML = `\n      ${p.media.map((m) => d.defaultView.PEBShop.mediaHtml(m, '../../../')).join('\n      ')}\n    `;
        setJsonLd(d, [
        { '@context': 'https://schema.org', ...productLd(p) },
        breadcrumbLd([['PEBMedia', '/'], ...obchod, ['Doplňky', '/obchod/doplnky/'], [p.nazev, productUrl(p)]])
        ]);
      }
    }));
  }
  zaznam('obchod/podminky/index.html', await renderPage('obchod/podminky/index.html', null, {
    onDocument: (d) => setJsonLd(d, [breadcrumbLd([['PEBMedia', '/'], ...obchod, ['Obchodní podmínky', '/obchod/podminky/']])])
  }));

  // Ostatní stránky (právní texty, děkujeme/zrušeno…) — jen společné rozložení.
  const hotovo = new Set(['index.html', 'obchod/index.html', 'obchod/doplnky/index.html', 'obchod/vouchery/index.html',
    'obchod/ebooky/index.html', 'obchod/podminky/index.html',
    ...visibleProducts.filter((x) => x.kategorie === 'doplnky').map((p) => `${productUrl(p).slice(1)}index.html`)]);
  for (const f of htmlFiles().filter((x) => !hotovo.has(x))) {
    zaznam(f, await renderPage(f, null));
  }

  zaznam('llms.txt', write('llms.txt', llmsTxt()));

  // Offline záloha obsahu — zachová hlavičkový komentář souboru.
  const fallback = read('js/content-fallback.js');
  const marker = 'window.__PEBMEDIA_FALLBACK_CONTENT__';
  const header = fallback.slice(0, fallback.indexOf(marker));
  zaznam('js/content-fallback.js', write('js/content-fallback.js', `${header}${marker} = ${JSON.stringify(content, null, 2)};\n`));

  zaznam('sitemap.xml', write('sitemap.xml', sitemapXml()));

  console.log(zmeny.length ? `Změněno:\n  ${zmeny.join('\n  ')}` : 'Vše je aktuální, nic se nezměnilo.');
}

main().catch((err) => {
  console.error('Předgenerování selhalo:', err);
  process.exit(1);
});
