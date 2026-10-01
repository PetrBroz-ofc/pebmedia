// js/shop.js
// Sdílená logika obchodu — načtení katalogu z data/shop.json a pomocné funkce
// pro vykreslení karet a zpracování nákupu/formuláře zdarma. Žádný framework,
// žádný build krok — stejný princip jako js/main.js.

(function () {
  'use strict';

  const SHOP_DATA_URL = pathToRoot() + 'data/shop.json';

  function pathToRoot() {
    // Zjistí relativní cestu zpět ke kořeni webu podle hloubky aktuální stránky
    // (data-root atribut na <body>, nastavený v každé šablonové stránce).
    const root = document.body.getAttribute('data-root');
    return root || './';
  }

  function formatCena(product) {
    if (product.zdarma) return 'Zdarma';
    return `${product.cena_kc.toLocaleString('cs-CZ')} Kč`;
  }

  async function loadShop() {
    const res = await fetch(SHOP_DATA_URL);
    if (!res.ok) throw new Error('Katalog produktů se nepodařilo načíst.');
    return res.json();
  }

  function productCardHtml(product, root) {
    const priceClass = product.zdarma ? 'price free' : 'price';
    const href = product.kategorie === 'doplnky'
      ? `${root}obchod/doplnky/${product.id.replace(/^doplnek-/, '')}/`
      : `${root}obchod/${product.kategorie}/#${product.id}`;
    return `
      <article class="product-card" id="${product.id}">
        <h3>${product.nazev}</h3>
        <p>${product.popis}</p>
        <div class="${priceClass}">${formatCena(product)}</div>
        <a class="btn btn-primary" href="${href}">${product.kategorie === 'doplnky' ? 'Zobrazit detail' : (product.zdarma ? 'Stáhnout zdarma' : 'Koupit')}</a>
      </article>
    `;
  }

  async function initCategoryListing(kategorie, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const root = document.body.getAttribute('data-root') || './';
      const products = shop.products.filter((p) => p.kategorie === kategorie);
      el.innerHTML = products.map((p) => productCardHtml(p, root)).join('');
    } catch (err) {
      el.innerHTML = '<p>Katalog se nepodařilo načíst. Zkuste to prosím později.</p>';
      console.error(err);
    }
  }

  async function initOverview(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const shop = await loadShop();
      const root = document.body.getAttribute('data-root') || './';
      const counts = {};
      shop.products.forEach((p) => { counts[p.kategorie] = (counts[p.kategorie] || 0) + 1; });
      el.innerHTML = Object.keys(shop.categories).map((key) => {
        const cat = shop.categories[key];
        return `
          <div class="category-card">
            <h2>${cat.nazev}</h2>
            <p>${cat.popis}</p>
            <a class="btn btn-secondary" href="${root}obchod/${key}/">Zobrazit (${counts[key] || 0})</a>
          </div>
        `;
      }).join('');
    } catch (err) {
      el.innerHTML = '<p>Katalog se nepodařilo načíst. Zkuste to prosím později.</p>';
      console.error(err);
    }
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
        if (errorEl) {
          errorEl.textContent = 'Pro dokončení nákupu je potřeba zaškrtnout souhlas níže.';
          errorEl.classList.add('visible');
        }
        return;
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Přesměrovávám na platbu…';

      try {
        const root = document.body.getAttribute('data-root') || './';
        const res = await fetch(`${root}api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, souhlasOdstoupeni: checkbox ? checkbox.checked : true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Platbu se nepodařilo zahájit.');
        window.location.href = data.url;
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Něco se nepovedlo. Zkuste to prosím znovu.';
          errorEl.classList.add('visible');
        }
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
      const submitBtn = form.querySelector('button[type="submit"]');

      if (messageEl) { messageEl.textContent = ''; messageEl.className = ''; }
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Odesílám…';

      try {
        const root = document.body.getAttribute('data-root') || './';
        const res = await fetch(`${root}api/free-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, email, souhlasNovinky: souhlasNovinky ? souhlasNovinky.checked : false })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Odkaz se nepodařilo odeslat.');
        if (messageEl) {
          messageEl.textContent = 'Hotovo! Odkaz ke stažení jsme poslali na váš e-mail.';
          messageEl.className = 'form-success';
        }
        form.reset();
      } catch (err) {
        if (messageEl) {
          messageEl.textContent = err.message || 'Něco se nepovedlo. Zkuste to prosím znovu.';
          messageEl.className = 'form-error visible';
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  window.PEBShop = { loadShop, initCategoryListing, initOverview, initBuyBox, initFreeForm, formatCena };
})();
