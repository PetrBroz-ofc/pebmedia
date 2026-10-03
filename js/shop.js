// js/shop.js
// Sdílená logika obchodu — načtení katalogu z data/shop.json, vykreslení karet
// a zpracování nákupu/formuláře zdarma. Žádný framework, žádný build krok —
// stejný princip jako js/main.js.
//
// Stránky obchodu nemají žádné inline skripty (kvůli přísné Content Security
// Policy). Co se má na stránce spustit, určují data-atributy na <body>:
//   data-root="../"                 relativní cesta ke kořeni webu
//   data-shop-page="prehled"        přehled kategorií (#categoryGrid)
//   data-shop-page="kategorie"      výpis kategorie (#productGrid), + data-kategorie
//   data-shop-page="vouchery"       vouchery s nákupem (#voucherGrid)
//   data-shop-page="ebooky"         e-booky (#ebookList)
//   data-shop-page="detail"         detail produktu, + data-product-id

(function () {
  'use strict';

  const KONTAKT_EMAIL = 'info.pebmedia@gmail.com';

  function pathToRoot() {
    return document.body.getAttribute('data-root') || './';
  }

  /** Escapuje text pro bezpečné vložení do HTML (obrana proti XSS). */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCena(product) {
    if (product.zdarma) return 'Zdarma';
    return `${product.cena_kc.toLocaleString('cs-CZ')} Kč`;
  }

  async function loadShop() {
    // no-cache = prohlížeč se vždy zeptá serveru, jestli nemá novější katalog (ceny, nové produkty).
    const res = await fetch(pathToRoot() + 'data/shop.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Katalog produktů se nepodařilo načíst.');
    const shop = await res.json();
    // Skryté produkty (např. bez dodaného obsahu) se na webu vůbec nezobrazí.
    shop.products = (shop.products || []).filter((p) => !p.skryto);
    return shop;
  }

  /**
   * Fotka nebo video produktu (data/shop.json → media). thumb = náhled v kartě:
   * video se jen naznačí prvním snímkem, přehrává se až na detailu.
   */
  function mediaHtml(m, root, opts) {
    if (!m) return '';
    const thumb = opts && opts.thumb;
    const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
    const poster = m.poster ? ` poster="${esc(root + m.poster)}"` : '';
    if (m.type === 'video') {
      return thumb
        ? `<video src="${esc(root + m.src)}#t=0.1"${poster} muted playsinline preload="metadata"${dims} aria-label="${esc(m.alt)}"></video><span class="media-play" aria-hidden="true"></span>`
        : `<video src="${esc(root + m.src)}"${poster} controls playsinline preload="metadata"${dims} aria-label="${esc(m.alt)}"></video>`;
    }
    return `<img src="${esc(root + m.src)}" alt="${esc(m.alt)}"${dims} loading="lazy" decoding="async">`;
  }

  function cardMedia(product, root) {
    const m = (product.media || [])[0];
    return m ? `<div class="product-media${m.type === 'video' ? ' is-video' : ''}">${mediaHtml(m, root, { thumb: true })}</div>` : '';
  }

  function productCardHtml(product, root) {
    const priceClass = product.zdarma ? 'price free' : 'price';
    const href = product.kategorie === 'doplnky'
      ? `${root}obchod/doplnky/${product.slug || product.id.replace(/^doplnek-/, '')}/`
      : `${root}obchod/${product.kategorie}/#${product.id}`;
    return `
      <article class="product-card" id="${esc(product.id)}">
        ${cardMedia(product, root)}
        <h3>${esc(product.nazev)}</h3>
        <p>${esc(product.popis)}</p>
        <div class="${priceClass}">${esc(formatCena(product))}</div>
        <a class="btn btn-primary" href="${esc(href)}">${product.kategorie === 'doplnky' ? 'Zobrazit detail' : (product.zdarma ? 'Stáhnout zdarma' : 'Koupit')}</a>
      </article>
    `;
  }

  function consentHtml(id, coSeStane) {
    return `
      <div class="consent-row">
        <input type="checkbox" id="consent-${id}">
        <label for="consent-${id}">Souhlasím se zahájením plnění (${coSeStane}) před uplynutím lhůty pro odstoupení od smlouvy a beru na vědomí, že tím ztrácím právo na odstoupení od smlouvy. Viz <a href="${pathToRoot()}obchod/podminky/">obchodní podmínky</a>.</label>
      </div>
      <button class="btn btn-accent" id="buy-${id}">Koupit</button>
      <div class="form-error" id="buyErr-${id}" role="alert"></div>
    `;
  }

  function showLoadError(el, err) {
    el.innerHTML = '<p>Katalog se nepodařilo načíst. Zkuste to prosím později.</p>';
    console.error(err);
  }

  async function initCategoryListing(kategorie, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const products = shop.products.filter((p) => p.kategorie === kategorie);
      el.innerHTML = products.map((p) => productCardHtml(p, pathToRoot())).join('');
    } catch (err) {
      showLoadError(el, err);
    }
  }

  async function initOverview(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const root = pathToRoot();
      const counts = {};
      shop.products.forEach((p) => { counts[p.kategorie] = (counts[p.kategorie] || 0) + 1; });
      el.innerHTML = Object.keys(shop.categories).map((key) => {
        const cat = shop.categories[key];
        const pocet = counts[key] || 0;
        const akce = pocet
          ? `<a class="btn btn-secondary" href="${root}obchod/${esc(key)}/">Zobrazit (${pocet})</a>`
          : '<span class="btn btn-secondary" aria-disabled="true">Připravujeme</span>';
        return `
          <div class="category-card">
            <h2>${esc(cat.nazev)}</h2>
            <p>${esc(cat.popis)}</p>
            ${akce}
          </div>
        `;
      }).join('');
    } catch (err) {
      showLoadError(el, err);
    }
  }

  async function initVouchers(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const vouchery = shop.products.filter((p) => p.kategorie === 'vouchery');
      el.innerHTML = vouchery.map((p, i) => `
        <article class="product-card voucher-card" id="${esc(p.id)}">
          ${cardMedia(p, pathToRoot())}
          <h3>${esc(p.nazev)}</h3>
          <p>${esc(p.popis)}</p>
          <div class="price">${esc(formatCena(p))}</div>
          <p class="voucher-note">Od koupě můžete odstoupit do 14 dnů, pokud voucher neuplatníte. <a href="${pathToRoot()}obchod/podminky/#odstoupeni">Podmínky</a></p>
          <button class="btn btn-accent" id="buy-${i}">Koupit</button>
          <div class="form-error" id="buyErr-${i}" role="alert"></div>
        </article>
      `).join('');
      vouchery.forEach((p, i) => {
        initBuyBox({ buttonId: `buy-${i}`, errorId: `buyErr-${i}`, checkboxId: `consent-${i}`, productId: p.id });
      });
    } catch (err) {
      showLoadError(el, err);
    }
  }

  async function initEbooks(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const ebooky = shop.products.filter((p) => p.kategorie === 'ebooky');
      if (!ebooky.length) {
        el.innerHTML = '<p>E-booky připravujeme. Zatím se můžete podívat na <a href="../doplnky/">doplňky pro web</a> nebo <a href="../vouchery/">dárkové vouchery</a>.</p>';
        return;
      }
      el.innerHTML = ebooky.map((p, i) => {
        if (p.zdarma) {
          return `
            <div class="ebook-card" id="${esc(p.id)}">
              <div>
                ${cardMedia(p, pathToRoot())}
                <h2>${esc(p.nazev)}</h2>
                <p>${esc(p.popis)}</p>
                <div class="price free">Zdarma</div>
              </div>
              <div>
                <form class="free-form" id="freeForm-${i}">
                  <input type="email" name="email" placeholder="Váš e-mail" autocomplete="email" maxlength="254" required aria-label="Váš e-mail">
                  <div class="hp-field" aria-hidden="true">
                    <label>Nevyplňujte <input type="text" name="web" tabindex="-1" autocomplete="off"></label>
                  </div>
                  <label class="newsletter-row">
                    <input type="checkbox" name="souhlasNovinky">
                    <span>Chci dostávat novinky a tipy od PEBMedia e-mailem (nepovinné, souhlas můžete kdykoli odvolat — viz <a href="${pathToRoot()}privacy.html">ochrana osobních údajů</a>).</span>
                  </label>
                  <button type="submit" class="btn btn-accent">Stáhnout zdarma</button>
                  <div id="freeMsg-${i}" role="status"></div>
                </form>
              </div>
            </div>
          `;
        }
        return `
          <div class="ebook-card" id="${esc(p.id)}">
            <div>
              ${cardMedia(p, pathToRoot())}
              <h2>${esc(p.nazev)}</h2>
              <p>${esc(p.popis)}</p>
            </div>
            <div>
              <div class="price">${esc(formatCena(p))}</div>
              ${consentHtml(i, 'okamžité zpřístupnění ke stažení')}
            </div>
          </div>
        `;
      }).join('');

      ebooky.forEach((p, i) => {
        if (p.zdarma) {
          initFreeForm({ formId: `freeForm-${i}`, productId: p.id, messageId: `freeMsg-${i}` });
        } else {
          initBuyBox({ buttonId: `buy-${i}`, errorId: `buyErr-${i}`, checkboxId: `consent-${i}`, productId: p.id });
        }
      });
    } catch (err) {
      showLoadError(el, err);
    }
  }

  /**
   * Zavolá API obchodu. Když serverové funkce nejsou k dispozici (web běží
   * jen staticky, např. na GitHub Pages), vrátí srozumitelnou chybu
   * s kontaktem místo technické hlášky.
   */
  async function postApi(path, payload) {
    let res;
    try {
      res = await fetch(`${pathToRoot()}api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      throw offlineError();
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson) throw offlineError();
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Něco se nepovedlo. Zkuste to prosím znovu.');
    return data;
  }

  function offlineError() {
    const err = new Error(`Online platby právě spouštíme. Zatím objednávejte e-mailem na ${KONTAKT_EMAIL} — ozveme se obratem.`);
    err.offline = true;
    return err;
  }

  /** Zobrazí chybu jako text (+ případně odkaz na e-mail), nikdy jako HTML. */
  function showError(el, err, productId) {
    if (!el) return;
    el.textContent = err.message || 'Něco se nepovedlo. Zkuste to prosím znovu.';
    if (err.offline) {
      const a = document.createElement('a');
      a.href = `mailto:${KONTAKT_EMAIL}?subject=${encodeURIComponent('Objednávka z obchodu: ' + productId)}`;
      a.textContent = ' Napsat e-mail';
      el.appendChild(a);
    }
    el.classList.add('visible');
  }

  /**
   * Napojí nákupní tlačítko na detailu placeného produktu na api/checkout.
   */
  function initBuyBox({ buttonId, errorId, checkboxId, productId }) {
    const btn = document.getElementById(buttonId);
    const errorEl = document.getElementById(errorId);
    const checkbox = document.getElementById(checkboxId);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      if (errorEl) { errorEl.classList.remove('visible'); errorEl.textContent = ''; }

      if (checkbox && !checkbox.checked) {
        showError(errorEl, new Error('Pro dokončení nákupu je potřeba zaškrtnout souhlas níže.'), productId);
        return;
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Přesměrovávám na platbu…';

      try {
        const data = await postApi('checkout', { productId, souhlasOdstoupeni: checkbox ? checkbox.checked : true });
        // Přesměrovat jen na platební bránu Stripe, nikam jinam.
        const url = new URL(data.url);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Neplatná adresa platby.');
        window.location.href = url.href;
      } catch (err) {
        showError(errorEl, err, productId);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }

  /**
   * Napojí formulář pro e-book zdarma (e-mail + souhlas s novinkami) na api/free-download.
   */
  function initFreeForm({ formId, productId, messageId }) {
    const form = document.getElementById(formId);
    const messageEl = document.getElementById(messageId);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim();
      const souhlasNovinky = form.querySelector('input[name="souhlasNovinky"]');
      const web = form.querySelector('input[name="web"]');
      const submitBtn = form.querySelector('button[type="submit"]');

      if (messageEl) { messageEl.textContent = ''; messageEl.className = ''; }
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Odesílám…';

      try {
        await postApi('free-download', {
          productId,
          email,
          souhlasNovinky: souhlasNovinky ? souhlasNovinky.checked : false,
          web: web ? web.value : ''
        });
        if (messageEl) {
          messageEl.textContent = 'Hotovo! Odkaz ke stažení jsme poslali na váš e-mail.';
          messageEl.className = 'form-success';
        }
        form.reset();
      } catch (err) {
        if (messageEl) {
          messageEl.className = 'form-error';
          showError(messageEl, err, productId);
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  function autoInit() {
    const body = document.body;
    const year = document.getElementById('shopYear');
    if (year) year.textContent = new Date().getFullYear();

    switch (body.getAttribute('data-shop-page')) {
      case 'prehled': initOverview('categoryGrid'); break;
      case 'kategorie': initCategoryListing(body.getAttribute('data-kategorie'), 'productGrid'); break;
      case 'vouchery': initVouchers('voucherGrid'); break;
      case 'ebooky': initEbooks('ebookList'); break;
      case 'detail':
        initBuyBox({ buttonId: 'buy-0', errorId: 'buyErr-0', checkboxId: 'consent-0', productId: body.getAttribute('data-product-id') });
        break;
      default: break;
    }
  }

  window.PEBShop = { mediaHtml, loadShop, initCategoryListing, initOverview, initVouchers, initEbooks, initBuyBox, initFreeForm, formatCena };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
