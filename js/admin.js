/* ==========================================================================
   PEBMedia — admin panel logic
   Ukládání probíhá přes api/content.js (Vercel serverless funkce), která
   commitne data/content.json do GitHub repozitáře -> Vercel web se sám
   znovu nasadí. Bez nasazeného backendu funguje admin jen jako náhled
   (uložení skončí chybou — viz README.md pro nastavení).
   ========================================================================== */

(function () {
  'use strict';

  const TOKEN_KEY = 'pebmedia_admin_token';
  let CONTENT = null;
  let unsavedPanels = new Set();

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function showToast(message, isError) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function setSaveStatus(panel, text, type) {
    const node = document.querySelector(`[data-status="${panel}"]`);
    if (!node) return;
    node.textContent = text;
    node.className = 'save-status' + (type ? ' is-' + type : '');
  }

  /* ---------------------------------------------------------------------
     AUTH
     --------------------------------------------------------------------- */

  async function login(password) {
    const res = await fetch('api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Nesprávné heslo.');
    }
    const data = await res.json();
    return data.token;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $('#loginPassword').value;
    const errEl = $('#loginError');
    errEl.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const token = await login(pass);
      sessionStorage.setItem(TOKEN_KEY, token);
      await enterAdmin();
    } catch (err) {
      errEl.textContent = err.message || 'Přihlášení se nezdařilo. Zkontrolujte prosím API nastavení (viz README.md).';
    } finally {
      submitBtn.disabled = false;
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  /* ---------------------------------------------------------------------
     LOAD / SAVE CONTENT
     --------------------------------------------------------------------- */

  async function fetchContent() {
    try {
      const res = await fetch('api/content', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* fall through */ }
    // Fallback pro lokální náhled bez nasazeného API
    const res2 = await fetch('data/content.json', { cache: 'no-store' });
    return await res2.json();
  }

  async function saveSection(panelKey) {
    setSaveStatus(panelKey, 'Ukládám…');
    try {
      const res = await fetch('api/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken()
        },
        body: JSON.stringify(CONTENT)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Uložení se nezdařilo.');
      }
      setSaveStatus(panelKey, 'Uloženo ✓', 'ok');
      showToast('Změny byly uloženy.');
      unsavedPanels.delete(panelKey);
    } catch (err) {
      setSaveStatus(panelKey, err.message, 'error');
      showToast('Uložení se nezdařilo — zkontrolujte nastavení API (README.md).', true);
    }
  }

  /* ---------------------------------------------------------------------
     GENERIC data-bind INPUTS
     --------------------------------------------------------------------- */

  function bindSimpleFields(root) {
    $$('[data-bind]', root).forEach(input => {
      const path = input.getAttribute('data-bind');
      const val = getPath(CONTENT, path);
      if (val !== undefined) input.value = val;
      input.addEventListener('input', () => {
        setPath(CONTENT, path, input.value);
        const panel = input.closest('.panel').id.replace('panel-', '');
        unsavedPanels.add(panel);
        setSaveStatus(panel, 'Neuložené změny');
      });
    });
  }

  /* ---------------------------------------------------------------------
     REPEATABLE ITEM LISTS (services, portfolio, references, process, faq)
     --------------------------------------------------------------------- */

  function makeItemListController(opts) {
    // opts: { container, items, panel, titleFn, badgeFn, renderBody, newItem, hasOrder }
    const container = document.getElementById(opts.container);

    function sortedItems() {
      if (opts.hasOrder === false) return opts.items;
      return opts.items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function markDirty() {
      unsavedPanels.add(opts.panel);
      setSaveStatus(opts.panel, 'Neuložené změny');
    }

    function renderAll() {
      container.innerHTML = '';
      sortedItems().forEach(item => container.appendChild(renderRow(item)));
    }

    function renderRow(item) {
      const tpl = document.getElementById('tpl-service').content.cloneNode(true);
      const row = tpl.querySelector('.item-row');
      row.dataset.id = item.id;
      const titleEl = row.querySelector('.item-row-title');
      const badgeEl = row.querySelector('.badge');
      const bodyEl = row.querySelector('.item-row-body');

      function refreshHead() {
        titleEl.textContent = opts.titleFn(item);
        const b = opts.badgeFn ? opts.badgeFn(item) : null;
        if (b) {
          badgeEl.textContent = b.text;
          badgeEl.classList.toggle('is-off', !!b.off);
          badgeEl.style.display = '';
        } else {
          badgeEl.style.display = 'none';
        }
      }
      refreshHead();

      bodyEl.innerHTML = opts.renderBody(item);
      // bind body fields generically via data-field attr
      $$('[data-field]', bodyEl).forEach(input => {
        const key = input.getAttribute('data-field');
        const type = input.getAttribute('type');
        if (key === 'featuresText') {
          // Special case: textarea (one line per item) <-> item.features array
          input.value = (item.features || []).join('\n');
          input.addEventListener('input', () => {
            item.features = input.value.split('\n').map(s => s.trim()).filter(Boolean);
            markDirty();
          });
          return;
        }
        if (type === 'checkbox') {
          input.checked = !!item[key];
          input.addEventListener('change', () => { item[key] = input.checked; refreshHead(); markDirty(); });
        } else {
          input.value = item[key] !== undefined ? item[key] : '';
          input.addEventListener('input', () => { item[key] = input.value; refreshHead(); markDirty(); });
        }
      });
      // rating stars special case
      const starsWrap = $('.rating-stars', bodyEl);
      if (starsWrap) {
        function renderStars() {
          starsWrap.innerHTML = '';
          for (let i = 1; i <= 5; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = '★';
            b.className = i <= (item.rating || 0) ? 'is-active' : '';
            b.addEventListener('click', () => { item.rating = i; renderStars(); markDirty(); });
            starsWrap.appendChild(b);
          }
        }
        renderStars();
      }

      row.querySelector('[data-action="toggle-body"]').addEventListener('click', () => {
        bodyEl.hidden = !bodyEl.hidden;
      });
      row.querySelector('[data-action="remove"]').addEventListener('click', () => {
        if (!confirm('Opravdu smazat tuto položku?')) return;
        opts.items.splice(opts.items.indexOf(item), 1);
        markDirty();
        renderAll();
      });
      if (opts.hasOrder !== false) {
        row.querySelector('[data-action="up"]').addEventListener('click', () => {
          const arr = sortedItems();
          const idx = arr.indexOf(item);
          if (idx > 0) {
            const other = arr[idx - 1];
            const tmp = item.order; item.order = other.order; other.order = tmp;
            markDirty(); renderAll();
          }
        });
        row.querySelector('[data-action="down"]').addEventListener('click', () => {
          const arr = sortedItems();
          const idx = arr.indexOf(item);
          if (idx < arr.length - 1) {
            const other = arr[idx + 1];
            const tmp = item.order; item.order = other.order; other.order = tmp;
            markDirty(); renderAll();
          }
        });
      } else {
        row.querySelector('[data-action="up"]').style.display = 'none';
        row.querySelector('[data-action="down"]').style.display = 'none';
      }

      return row;
    }

    document.getElementById(opts.addBtn).addEventListener('click', () => {
      const item = opts.newItem();
      opts.items.push(item);
      markDirty();
      renderAll();
    });

    renderAll();
  }

  function initServiceCategoryList(containerId, addBtnId, category) {
    makeItemListController({
      container: containerId,
      addBtn: addBtnId,
      items: category.items,
      panel: 'services',
      titleFn: it => it.name || 'Nová položka',
      badgeFn: it => ({ text: it.price || '—' }),
      renderBody: it => `
        <div class="field-grid">
          <div class="field"><label>Název položky</label><input data-field="name"></div>
          <div class="field"><label>Cena (např. „Od 9 800 Kč“)</label><input data-field="price"></div>
        </div>
      `,
      newItem: () => ({ id: uid('svc'), name: 'Nová položka', price: 'Od 0 Kč', order: category.items.length + 1 })
    });
  }

  function initItemLists() {
    initServiceCategoryList('svcCatWebList', 'addSvcCatWeb', CONTENT.services.categories[0]);
    initServiceCategoryList('svcCatBrandingList', 'addSvcCatBranding', CONTENT.services.categories[1]);
    initServiceCategoryList('svcCatSecurityList', 'addSvcCatSecurity', CONTENT.services.categories[2]);
    initServiceCategoryList('svcCatTechList', 'addSvcCatTech', CONTENT.services.categories[3]);

    makeItemListController({
      container: 'packagesItemList',
      addBtn: 'addPackage',
      items: CONTENT.packages.items,
      panel: 'packages',
      titleFn: it => it.name || 'Nový balíček',
      badgeFn: it => {
        if (it.visible === false) return { text: 'skryto', off: true };
        return it.highlight ? { text: it.highlight } : { text: it.price || '—' };
      },
      renderBody: it => `
        <div class="field-grid">
          <div class="field"><label>Název balíčku</label><input data-field="name"></div>
          <div class="field"><label>Cena</label><input data-field="price"></div>
          <div class="field"><label>Zvýraznění (štítek)</label><input data-field="highlight" placeholder="např. NEJOBLÍBENĚJŠÍ"></div>
          <div class="field"><label>Text tlačítka</label><input data-field="cta"></div>
        </div>
        <div class="field full"><label>Krátký popis</label><input data-field="description"></div>
        <div class="field full"><label>Funkce balíčku (jedna na řádek)</label><textarea data-field="featuresText" style="min-height:140px;"></textarea></div>
        <label class="item-toggle"><input type="checkbox" data-field="visible"> Zobrazit na webu</label>
      `,
      newItem: () => ({ id: uid('pkg'), name: 'NOVÝ BALÍČEK', price: '0 Kč', highlight: '', description: '', features: [], cta: 'Chci tento balíček', visible: true, order: CONTENT.packages.items.length + 1 })
    });

    makeItemListController({
      container: 'portfolioItemList',
      addBtn: 'addPortfolio',
      items: CONTENT.portfolio.items,
      panel: 'portfolio',
      titleFn: it => it.title || 'Nový projekt',
      badgeFn: it => it.featured ? { text: 'featured' } : null,
      renderBody: it => `
        <div class="field-grid">
          <div class="field"><label>Název projektu</label><input data-field="title"></div>
          <div class="field"><label>Kategorie</label><input data-field="category"></div>
          <div class="field"><label>Rok</label><input data-field="year"></div>
          <div class="field"><label>Odkaz (nepovinné)</label><input data-field="link" placeholder="https://..."></div>
        </div>
        <div class="field full"><label>Popis</label><textarea data-field="text"></textarea></div>
        <div class="field full"><label>URL obrázku</label><input data-field="image"><span class="field-hint">Cesta k obrázku, např. assets/nazev.jpg</span></div>
        <label class="item-toggle"><input type="checkbox" data-field="featured"> Zvýraznit (featured — přes celou šířku)</label>
      `,
      newItem: () => ({ id: uid('pf'), title: 'Nový projekt', category: 'Web development', text: '', year: String(new Date().getFullYear()), image: 'assets/portfolio-placeholder-1.svg', link: '', featured: false, order: CONTENT.portfolio.items.length + 1 })
    });

    makeItemListController({
      container: 'referencesItemList',
      addBtn: 'addReference',
      items: CONTENT.references.items,
      panel: 'references',
      titleFn: it => `${it.name || 'Nová reference'} — ${it.company || ''}`,
      badgeFn: it => it.visible === false ? { text: 'skryto', off: true } : { text: 'viditelné' },
      renderBody: it => `
        <div class="field-grid">
          <div class="field"><label>Jméno</label><input data-field="name"></div>
          <div class="field"><label>Firma</label><input data-field="company"></div>
        </div>
        <div class="field full"><label>Text reference</label><textarea data-field="text"></textarea></div>
        <div class="field full"><label>URL fotografie (nepovinné)</label><input data-field="photo"></div>
        <div class="field"><label>Hodnocení</label><div class="rating-stars"></div></div>
        <label class="item-toggle"><input type="checkbox" data-field="visible"> Zobrazit na webu</label>
      `,
      newItem: () => ({ id: uid('ref'), name: '', company: '', text: '', rating: 5, photo: '', visible: true, order: CONTENT.references.items.length + 1 })
    });

    makeItemListController({
      container: 'processItemList',
      addBtn: 'addProcess',
      items: CONTENT.process.steps,
      panel: 'process',
      hasOrder: false,
      titleFn: it => `${it.number} · ${it.title || 'Nový krok'}`,
      renderBody: it => `
        <div class="field-grid">
          <div class="field"><label>Číslo</label><input data-field="number"></div>
          <div class="field"><label>Název kroku</label><input data-field="title"></div>
        </div>
        <div class="field full"><label>Popis</label><textarea data-field="text"></textarea></div>
      `,
      newItem: () => ({ id: uid('step'), number: String(CONTENT.process.steps.length + 1).padStart(2, '0'), title: 'Nový krok', text: '' })
    });

    makeItemListController({
      container: 'faqItemList',
      addBtn: 'addFaq',
      items: CONTENT.faq.items,
      panel: 'faq',
      titleFn: it => it.question || 'Nová otázka',
      badgeFn: it => it.visible === false ? { text: 'skryto', off: true } : { text: 'viditelné' },
      renderBody: it => `
        <div class="field full"><label>Otázka</label><input data-field="question"></div>
        <div class="field full"><label>Odpověď</label><textarea data-field="answer"></textarea></div>
        <label class="item-toggle"><input type="checkbox" data-field="visible"> Zobrazit na webu</label>
      `,
      newItem: () => ({ id: uid('faq'), question: 'Nová otázka', answer: '', visible: true, order: CONTENT.faq.items.length + 1 })
    });
  }

  /* ---------------------------------------------------------------------
     CONTACT project types (textarea <-> array)
     --------------------------------------------------------------------- */

  function initProjectTypesField() {
    const field = $('#projectTypesField');
    field.value = CONTENT.contact.projectTypes.join('\n');
    field.addEventListener('input', () => {
      CONTENT.contact.projectTypes = field.value.split('\n').map(s => s.trim()).filter(Boolean);
      unsavedPanels.add('contact');
      setSaveStatus('contact', 'Neuložené změny');
    });
  }

  /* ---------------------------------------------------------------------
     NAV / PANEL SWITCHING
     --------------------------------------------------------------------- */

  function initNav() {
    $$('.nav-item[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-item').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        $$('.panel').forEach(p => p.classList.remove('is-active'));
        $('#panel-' + btn.dataset.panel).classList.add('is-active');
        $('#sidebar').classList.remove('is-open');
      });
    });
    $('#mobileMenuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));
  }

  function initSaveButtons() {
    $$('[data-save]').forEach(btn => {
      btn.addEventListener('click', () => saveSection(btn.getAttribute('data-save')));
    });
  }

  function renderDashboard() {
    const serviceItemCount = CONTENT.services.categories.reduce((sum, c) => sum + c.items.length, 0);
    const stats = [
      ['Položky služeb', serviceItemCount],
      ['Balíčky', CONTENT.packages.items.length],
      ['Portfolio projektů', CONTENT.portfolio.items.length],
      ['Reference', CONTENT.references.items.length],
      ['FAQ položek', CONTENT.faq.items.length]
    ];
    $('#dashboardStats').innerHTML = `
      <h3>Rychlý přehled</h3>
      <div class="field-grid" style="margin-top:14px;">
        ${stats.map(([label, val]) => `
          <div style="padding:14px;border:1px solid var(--border);border-radius:8px;">
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--ink-faint);text-transform:uppercase;">${label}</div>
            <div style="font-family:var(--font-display);font-size:24px;font-weight:600;margin-top:4px;">${val}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ---------------------------------------------------------------------
     BOOT
     --------------------------------------------------------------------- */

  async function enterAdmin() {
    $('#loginScreen').style.display = 'none';
    $('#adminApp').classList.add('is-visible');
    try {
      CONTENT = await fetchContent();
    } catch (err) {
      showToast('Nepodařilo se načíst obsah webu.', true);
      return;
    }
    bindSimpleFields(document);
    initItemLists();
    initProjectTypesField();
    initNav();
    initSaveButtons();
    renderDashboard();

    window.addEventListener('beforeunload', (e) => {
      if (unsavedPanels.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // Auto-login if token already present (session)
  if (getToken()) {
    enterAdmin();
  }
})();
