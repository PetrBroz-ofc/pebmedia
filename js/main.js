/* ==========================================================================
   PEBMedia — public site renderer
   Čte data/content.json (editovatelné přes admin.html) a vykresluje obsah.
   Pokud fetch selže (typicky při otevření souboru přímo dvojklikem, kdy
   prohlížeč blokuje čtení JSON z disku), použije se offline záloha ze
   souboru js/content-fallback.js, aby stránka nezůstala prázdná.
   Pro plně živý obsah (a fungující admin) web spouštějte přes lokální
   server (např. `npx serve .`) nebo nasazený na Vercelu.
   ========================================================================== */

(function () {
  'use strict';

  const CONTENT_URL = 'data/content.json';

  async function loadContent() {
    try {
      const res = await fetch(CONTENT_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Content fetch failed');
      return await res.json();
    } catch (err) {
      if (window.__PEBMEDIA_FALLBACK_CONTENT__) {
        console.warn('data/content.json se nepodařilo načíst (pravděpodobně náhled přes file://). Používám offline zálohu obsahu z js/content-fallback.js — pro živá data spusťte web přes lokální server nebo jej nasaďte na Vercel.');
        return window.__PEBMEDIA_FALLBACK_CONTENT__;
      }
      console.error('Nepodařilo se načíst data/content.json a offline záloha není dostupná', err);
      document.body.innerHTML =
        '<div style="padding:80px 32px;font-family:sans-serif;max-width:560px;margin:0 auto;text-align:center;">' +
        '<h1 style="font-size:22px;">Obsah se nepodařilo načíst</h1>' +
        '<p style="color:#666;margin-top:12px;">Pokud si stránku prohlížíte lokálně otevřením souboru, spusťte ji prosím přes lokální server (např. <code>npx serve .</code>), protože prohlížeč blokuje načítání JSON souborů přímo z disku.</p>' +
        '</div>';
      return null;
    }
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Jednoduchá vanilla JS obdoba komponenty CountUp (React Bits) — bez
  // závislosti na Reactu/motion, protože web je čisté HTML/CSS/JS.
  // Rozparsuje text typu "20 000 Kč" na předponu/číslo/příponu a animuje
  // počítání od 0 nahoru, jakmile je prvek vidět na obrazovce.
  function countUpOnView(elNode, { duration = 1500 } = {}) {
    if (!elNode) return;
    const targetText = elNode.textContent.trim();
    const match = targetText.match(/^(\D*)([\d\s.,]*\d)(\D*)$/);
    if (!match) return; // text neobsahuje číslo, necháme beze změny

    const [, prefix, numStr, suffix] = match;
    const targetNum = parseInt(numStr.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(targetNum)) return;

    const formatNum = n => Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' ');
    elNode.textContent = `${prefix}0${suffix}`;

    const animate = () => {
      const start = performance.now();
      const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        elNode.textContent = `${prefix}${formatNum(targetNum * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
        else elNode.textContent = targetText;
      };
      requestAnimationFrame(step);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animate();
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      io.observe(elNode);
    } else {
      elNode.textContent = targetText;
    }
  }

  // Poptávka jako krátký kvíz: cíl → rozpočet → termín → kontakt.
  // Bez JavaScriptu zůstává obyčejný formulář; kvíz jen vyplňuje jeho pole.
  function initKviz(form) {
    const quiz = document.getElementById('contactQuiz');
    if (!quiz) return;
    const typ = document.getElementById('f-type');
    const rozpocet = document.getElementById('f-budget');
    const cil = document.getElementById('f-goal');
    const termin = document.getElementById('f-timeline');
    const zprava = document.getElementById('f-message');

    const KROKY = [
      {
        otazka: 'Co je vaším hlavním cílem?',
        moznosti: [
          { text: 'Víc zákazníků a poptávek', typ: 'Web' },
          { text: 'Nový nebo modernější web', typ: 'Redesign' },
          { text: 'Začít prodávat online', typ: 'E-shop' },
          { text: 'Logo a vizuální identita', typ: 'Logo / branding' },
          { text: 'Bezpečný a rychlý web', typ: 'Kyberbezpečnost' },
          { text: 'Ušetřit čas automatizací nebo AI', typ: 'Automatizace' }
        ],
        vyber: (m) => { cil.value = m.text; typ.value = m.typ; }
      },
      {
        otazka: 'Jaký máte přibližný rozpočet?',
        moznosti: [
          { text: 'Do 20 000 Kč', budget: 'do-50k' },
          { text: '20 000 – 50 000 Kč', budget: 'do-50k' },
          { text: '50 000 – 100 000 Kč', budget: '50-100k' },
          { text: 'Víc než 100 000 Kč', budget: '100-200k' },
          { text: 'Zatím nevím', budget: '' }
        ],
        vyber: (m) => { rozpocet.value = m.budget; document.getElementById('f-budget-detail').value = m.text; }
      },
      {
        otazka: 'Kdy byste chtěli začít?',
        moznosti: [{ text: 'Co nejdřív' }, { text: 'Do měsíce' }, { text: 'Do tří měsíců' }, { text: 'Zatím jen zjišťuji' }],
        vyber: (m) => { termin.value = m.text; }
      }
    ];
    const celkem = KROKY.length + 1;
    // S předvyplněnou zprávou (z obchodu, kalkulačky) rovnou na kontakt.
    let krok = zprava.value.trim() ? KROKY.length : 0;
    const odpovedi = [];

    function vykresli() {
      form.classList.toggle('is-quiz-kontakt', krok === KROKY.length);
      quiz.innerHTML = '';
      quiz.appendChild(el('div', 'quiz-hlava', `<span class="quiz-krok">Krok ${krok + 1} ${celkem === 3 || celkem === 4 ? 'ze' : 'z'} ${celkem}</span><span class="quiz-progres" aria-hidden="true"><i style="width:${Math.round(((krok + 1) / celkem) * 100)}%"></i></span>`));
      if (krok < KROKY.length) {
        const k = KROKY[krok];
        const h = el('p', 'quiz-otazka', k.otazka);
        h.tabIndex = -1;
        quiz.appendChild(h);
        const mrizka = el('div', 'quiz-moznosti');
        k.moznosti.forEach((m) => {
          const b = el('button', 'quiz-moznost' + (odpovedi[krok] === m.text ? ' is-active' : ''), m.text);
          b.type = 'button';
          b.addEventListener('click', () => {
            k.vyber(m);
            odpovedi[krok] = m.text;
            if (window.PEBZvuk) window.PEBZvuk.play('tap');
            b.classList.add('is-active');
            setTimeout(() => { krok++; vykresli(); focusOtazka(); }, 200);
          });
          mrizka.appendChild(b);
        });
        quiz.appendChild(mrizka);
      } else {
        const shrnuti = odpovedi.filter(Boolean);
        quiz.appendChild(el('p', 'quiz-otazka', 'Poslední krok: kam vám máme odpovědět?'));
        if (shrnuti.length) quiz.appendChild(el('p', 'quiz-shrnuti', shrnuti.map((o) => `<span>${o}</span>`).join('')));
      }
      if (krok > 0) {
        const zpet = el('button', 'quiz-zpet', '← Zpět');
        zpet.type = 'button';
        zpet.addEventListener('click', () => { krok--; vykresli(); focusOtazka(); });
        quiz.appendChild(zpet);
      }
    }
    function focusOtazka() {
      const h = quiz.querySelector('.quiz-otazka');
      if (h && h.tabIndex === -1) h.focus({ preventScroll: true });
      else if (krok === KROKY.length) document.getElementById('f-name').focus({ preventScroll: true });
    }

    // Kdo přišel s předvyplněnou zprávou (kalkulačka, rychlá pomoc, balíček), jde rovnou na kontakt.
    document.addEventListener('click', (e) => {
      const odkaz = e.target.closest && e.target.closest('a[href$="#kontakt"]');
      if (!odkaz) return;
      setTimeout(() => {
        if (zprava.value.trim() && krok < KROKY.length) { krok = KROKY.length; vykresli(); }
      }, 0);
    });

    quiz.hidden = false;
    form.classList.add('is-quiz');
    vykresli();
  }

  function starsSvg(count) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += `<svg viewBox="0 0 20 20" style="${i < count ? '' : 'fill:#E3E3DE'}"><path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L10 14.9 4.4 18l1.4-6.2L1 7.5l6.4-.6L10 1z"/></svg>`;
    }
    return out;
  }

  function referenceTile(r) {
    return `
      <div class="stars">${starsSvg(r.rating)}</div>
      <p class="reference-text">„${r.text}“</p>
      <div class="reference-company">${r.company}</div>
    `;
  }

  function escAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /**
   * Galerie fotek a videí od studentů (content.json → schools.gallery).
   * Fotky mají dvě velikosti (srcset), videa se v mřížce jen naznačí náhledem
   * a přehrají se až v prohlížeči (lightbox) — stránka tak zůstane rychlá.
   */
  function renderSchoolsGallery(data) {
    const wrap = document.getElementById('schoolsGalleryWrap');
    const grid = document.getElementById('schoolsGallery');
    if (!wrap || !grid) return;
    const items = (data.schools.gallery || [])
      .filter(m => m.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    wrap.hidden = items.length === 0;
    grid.dataset.count = String(Math.min(items.length, 4)); // rozložení se přizpůsobí počtu (viz CSS)
    grid.innerHTML = '';

    items.forEach((m, i) => {
      const isVideo = m.type === 'video';
      const dims = m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
      // focus = bod zaostření výřezu, např. "center 70%" (kde jsou na fotce lidé)
      const focus = /^[a-z0-9 %.]+$/i.test(m.focus || '') ? ` style="object-position: ${m.focus}"` : '';
      let thumb;
      if (!isVideo) {
        thumb = `<img src="${escAttr(m.srcSmall || m.src)}" srcset="${escAttr(m.srcSmall || m.src)} 800w, ${escAttr(m.src)} ${m.width || 1600}w" sizes="(max-width: 640px) 50vw, 25vw"${dims}${focus} alt="${escAttr(m.alt)}" loading="lazy" decoding="async">`;
      } else if (m.poster) {
        thumb = `<img src="${escAttr(m.poster)}"${dims} alt="${escAttr(m.alt)}" loading="lazy" decoding="async">`;
      } else {
        thumb = `<video src="${escAttr(m.src)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>`;
      }
      grid.appendChild(el('figure', 'gallery-item reveal' + (isVideo ? ' is-video' : ''), `
        <button type="button" class="gallery-open" data-index="${i}" aria-label="${isVideo ? 'Přehrát video' : 'Zobrazit fotku'}: ${escAttr(m.alt)}">
          ${thumb}
          ${isVideo ? '<span class="gallery-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' : ''}
        </button>
        ${m.caption ? `<figcaption>${m.caption}</figcaption>` : ''}
      `));
    });

    // Výzva k zaslání dalších fotek — vždy jako poslední dlaždice.
    const email = data.general.email;
    grid.appendChild(el('a', 'gallery-invite reveal', `
      <span class="gallery-invite-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
      <span class="gallery-invite-title">Máte fotky nebo video z plesu?</span>
      <span class="gallery-invite-text">Pošlete nám je a rádi je sem přidáme.</span>
    `));
    const invite = grid.lastElementChild;
    invite.href = `mailto:${email}?subject=${encodeURIComponent('Fotky a videa z maturitního plesu')}`;

    initLightbox(items, grid);
  }

  // Prohlížeč galerie (nativní <dialog>: fokus, Esc a přístupnost řeší prohlížeč).
  const lightbox = { items: [], current: 0, opener: null, ready: false };

  function lightboxShow(i) {
    const { items } = lightbox;
    if (!items.length) return;
    lightbox.current = (i + items.length) % items.length;
    const m = items[lightbox.current];
    const stage = document.getElementById('lightboxStage');
    stage.innerHTML = m.type === 'video'
      ? `<video src="${escAttr(m.src)}" controls autoplay playsinline ${m.poster ? `poster="${escAttr(m.poster)}"` : ''} aria-label="${escAttr(m.alt)}"></video>`
      : `<img src="${escAttr(m.src)}" alt="${escAttr(m.alt)}">`;
    document.getElementById('lightboxCaption').textContent = m.caption || m.alt || '';
    document.getElementById('lightboxCounter').textContent = items.length > 1 ? `${lightbox.current + 1} / ${items.length}` : '';
    document.getElementById('lightboxPrev').hidden = document.getElementById('lightboxNext').hidden = items.length < 2;
  }

  function initLightbox(items, grid) {
    const dialog = document.getElementById('lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    lightbox.items = items;
    if (grid.dataset.lightboxBound) return;
    grid.dataset.lightboxBound = '1';

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.gallery-open');
      if (!btn) return;
      lightbox.opener = btn;
      lightboxShow(Number(btn.dataset.index));
      dialog.showModal();
    });

    if (lightbox.ready) return; // ovládání dialogu stačí navázat jednou
    lightbox.ready = true;
    document.getElementById('lightboxPrev').addEventListener('click', () => lightboxShow(lightbox.current - 1));
    document.getElementById('lightboxNext').addEventListener('click', () => lightboxShow(lightbox.current + 1));
    document.getElementById('lightboxClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') lightboxShow(lightbox.current - 1);
      if (e.key === 'ArrowRight') lightboxShow(lightbox.current + 1);
    });
    dialog.addEventListener('close', () => {
      document.getElementById('lightboxStage').innerHTML = ''; // zastaví přehrávané video
      if (lightbox.opener) lightbox.opener.focus();
    });
    // Swipe na mobilu
    let startX = null;
    dialog.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    dialog.addEventListener('pointerup', (e) => {
      if (startX === null || lightbox.items.length < 2) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 50) lightboxShow(lightbox.current + (dx < 0 ? 1 : -1));
      startX = null;
    });
  }

  function render(data) {
    const g = data.general, seo = data.seo, hero = data.hero, intro = data.intro;

    // --- SEO / meta ---
    document.title = seo.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', seo.description);

    // --- Brand text ---
    ['logoText', 'footerLogoText'].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.textContent = g.brand;
    });

    // --- Hero ---
    document.getElementById('heroHeadline').textContent = hero.headline;
    document.getElementById('heroText').textContent = hero.text;
    document.getElementById('heroCtaPrimary').textContent = hero.ctaPrimary;
    document.getElementById('heroCtaSecondary').textContent = hero.ctaSecondary;
    document.getElementById('headerCta').textContent = hero.ctaPrimary;

    // --- Intro ---
    document.getElementById('introLead').textContent = intro.text;
    const benefitsEl = document.getElementById('introBenefits');
    benefitsEl.innerHTML = '';
    intro.benefits.forEach(b => benefitsEl.appendChild(el('li', null, b)));

    // --- Services (categories with priced sub-items) ---
    document.getElementById('servicesHeading').textContent = data.services.heading;
    document.getElementById('servicesSubheading').textContent = data.services.subheading;
    const catsWrap = document.getElementById('serviceCategories');
    catsWrap.innerHTML = '';
    data.services.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach(cat => {
        const itemsHtml = cat.items
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(it => `
            <div class="service-item-row">
              <span class="service-item-name">${it.name}</span>
              <span class="service-item-price">${it.price}</span>
            </div>
          `).join('');
        const card = el('div', 'service-category reveal', `
          <div class="service-category-head">
            <span class="service-category-number">${cat.number}</span>
            <h3 class="service-category-title">${cat.title}</h3>
            <p class="service-category-text">${cat.text}</p>
          </div>
          <div class="service-category-items">${itemsHtml}</div>
          ${cat.note ? `<p class="service-category-note">${cat.note}</p>` : ''}
        `);
        catsWrap.appendChild(card);
      });
    const svcPriceNote = data.services.priceNote;
    const oldSvcNote = document.getElementById('servicesPriceNote');
    if (oldSvcNote) oldSvcNote.remove();
    if (svcPriceNote) {
      catsWrap.insertAdjacentHTML('afterend', `<p class="price-note reveal" id="servicesPriceNote">${svcPriceNote}</p>`);
    }

    // --- Rychlá pomoc (mikroslužby za pevnou cenu) ---
    const qh = data.quickHelp;
    const qhGrid = document.getElementById('qhGrid');
    if (qh && qhGrid) {
      document.getElementById('qhHeading').textContent = qh.heading;
      document.getElementById('qhSubheading').textContent = qh.subheading;
      document.getElementById('qhNote').textContent = qh.note;
      qhGrid.innerHTML = '';
      qh.items.forEach(s => {
        const karta = el('article', 'qh-card reveal', `
          <div class="qh-card-top"><h3>${s.name}</h3><span class="qh-time">${s.time}</span></div>
          <p>${s.text}</p>
          <div class="qh-card-bottom"><strong class="qh-price">${s.price}</strong><a href="obchod/weby/#${'sluzba-' + s.id.replace(/^qh-/, '')}" class="btn btn-accent btn-small qh-cta">Objednat</a></div>`);
        qhGrid.appendChild(karta);
      });
    }

    // --- Packages (balíčky) ---
    document.getElementById('packagesHeading').textContent = data.packages.heading;
    document.getElementById('packagesSubheading').textContent = data.packages.subheading;
    document.getElementById('packagesPriceNote').textContent = data.packages.priceNote;
    const pkgGrid = document.getElementById('packagesGrid');
    pkgGrid.innerHTML = '';
    data.packages.items
      .filter(p => p.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(p => {
        const card = el('div', 'package-card reveal' + (p.highlight ? ' is-highlight' : ''), `
          ${p.highlight ? `<span class="package-badge">${p.highlight}</span>` : ''}
          <div class="package-name">${p.name}</div>
          <div class="package-price">${p.price}</div>
          <p class="package-description">${p.description}</p>
          <ul class="package-features">
            ${p.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
          <a href="#kontakt" class="btn ${p.highlight ? 'btn-accent' : 'btn-secondary'} package-cta">${p.cta}</a>
        `);
        pkgGrid.appendChild(card);
      });

    if (window.PEBKalkulacka) { window.PEBKalkulacka.init(data); window.PEBKalkulacka.initFlip(); }

    // --- Aplikace ---
    const appsSec = document.getElementById('aplikace');
    if (appsSec && data.apps) {
      document.getElementById('appsHeading').textContent = data.apps.heading;
      document.getElementById('appsSubheading').textContent = data.apps.subheading;
      const appsGrid = document.getElementById('appsGrid');
      appsGrid.innerHTML = '';
      const appIcon = '<svg viewBox="0 0 400 400" aria-hidden="true"><rect x="12" y="12" width="376" height="376" rx="88" fill="#0B6E63"/><path d="M150 196V146a50 50 0 0 1 100 0v50" fill="none" stroke="#F6F6F3" stroke-width="34" stroke-linecap="round"/><rect x="112" y="186" width="176" height="132" rx="22" fill="#F6F6F3"/><circle cx="200" cy="244" r="17" fill="#0B6E63"/><rect x="191" y="248" width="18" height="34" rx="9" fill="#0B6E63"/></svg>';
      (data.apps.items || [])
        .filter(a => a.visible !== false)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach(a => {
          const protect = /protect\.pebmedia\.cz/.test(a.url || '');
          appsGrid.appendChild(el('article', 'app-card reveal', `
            <div class="app-card-head">
              <span class="app-icon">${appIcon}</span>
              <div>
                <h3 class="app-name">${a.name}</h3>
                ${a.tag ? `<span class="app-tag">${a.tag}</span>` : ''}
              </div>
            </div>
            <p class="app-text">${a.text}</p>
            ${(a.features || []).length ? `<ul class="app-features">${a.features.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
            ${a.url ? `<a class="btn btn-primary app-cta" href="${a.url}"${protect ? ' data-protect-link' : ' target="_blank" rel="noopener"'}>${a.cta || 'Otevřít'} <span aria-hidden="true">→</span></a>` : ''}
          `));
        });
      appsSec.hidden = !appsGrid.children.length;
    }

    // --- Na čem právě pracujeme ---
    const wipSec = document.getElementById('rozpracovano');
    if (wipSec && data.inProgress) {
      const w = data.inProgress;
      document.getElementById('wipHeading').textContent = w.heading || '';
      document.getElementById('wipSubheading').textContent = w.subheading || '';
      const stages = w.stages && w.stages.length ? w.stages : ['Návrh', 'Vývoj', 'Testování', 'Spuštění'];
      const icons = {
        perla: '<svg viewBox="0 0 120 120"><path d="M14 22c10 40 28 58 46 58s36-18 46-58" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".45"/><g fill="currentColor"><circle cx="17" cy="33" r="4.5"/><circle cx="24" cy="48" r="5.2"/><circle cx="34" cy="61" r="5.8"/><circle cx="103" cy="33" r="4.5"/><circle cx="96" cy="48" r="5.2"/><circle cx="86" cy="61" r="5.8"/></g><circle class="wip-pearl" cx="60" cy="86" r="15" fill="url(#wipPearl)"/><ellipse cx="54" cy="80" rx="4.5" ry="3" fill="#fff" opacity=".9" transform="rotate(-30 54 80)"/><defs><radialGradient id="wipPearl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#f3e6dc"/><stop offset="1" stop-color="#c9aaa2"/></radialGradient></defs></svg>',
        cad: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-linejoin="round"><g class="wip-cube"><path d="M60 18l34 19.5v39L60 96 26 76.5v-39z" stroke-width="2.4"/><path d="M26 37.5L60 57l34-19.5M60 57v39" stroke-width="2.4"/><path d="M43 27.7l34 19.6M77 27.7L43 47.3" stroke-width="1" opacity=".35" stroke-dasharray="3 4"/></g><circle cx="60" cy="57" r="3.4" fill="currentColor" stroke="none"/><path d="M98 96h10M103 91v10" stroke-width="1.4" opacity=".6"/><path d="M12 24h10M17 19v10" stroke-width="1.4" opacity=".6"/></svg>',
        kniha: '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-linecap="round"><path d="M60 32c-10-8-25-10-38-7v62c13-3 28-1 38 7 10-8 25-10 38-7V25c-13-3-28-1-38 7z" stroke-width="2.4"/><path d="M60 32v62" stroke-width="2.4"/><path d="M32 42c6-1 12 0 18 3M32 54c6-1 12 0 18 3M70 45c6-3 12-4 18-3M70 57c6-3 12-4 18-3" stroke-width="1.6" opacity=".5"/><path class="wip-shield" d="M84 70l12 4v8c0 7-5 12-12 15-7-3-12-8-12-15v-8z" fill="#0B6E63" stroke="#F6F6F3" stroke-width="2"/><path d="M79 83l4 4 7-8" stroke="#F6F6F3" stroke-width="2.2"/></svg>'
      };
      const grid = document.getElementById('wipGrid');
      grid.innerHTML = '';
      (w.items || [])
        .filter(it => it.visible !== false)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach((it, idx) => {
          const cur = Math.min(Math.max(parseInt(it.stage, 10) || 1, 1), stages.length);
          const steps = stages.map((name, i) => {
            const n = i + 1;
            const cls = n < cur ? 'is-done' : n === cur ? 'is-current' : '';
            return `<li class="${cls}"${n === cur ? ' aria-current="step"' : ''}><span class="wip-step-dot"></span><span class="wip-step-name">${name}</span></li>`;
          }).join('');
          const theme = it.icon || 'cad';
          const card = el('article', `wip-card wip-theme-${theme} reveal`, `
            <div class="wip-visual" aria-hidden="true">
              <span class="wip-num">${String(idx + 1).padStart(2, '0')}</span>
              ${it.kind ? `<span class="wip-kind">${it.kind}</span>` : ''}
              <span class="wip-glow"></span>
              <span class="wip-art">${icons[theme] || icons.cad}</span>
            </div>
            <div class="wip-body">
              ${it.category ? `<p class="wip-category">${it.category}</p>` : ''}
              <h3 class="wip-name">${it.name}</h3>
              <p class="wip-text">${it.text || ''}</p>
              ${(it.tags || []).length ? `<ul class="wip-tags">${it.tags.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
              <div class="wip-progress">
                <div class="wip-progress-head"><span>Fáze projektu</span><strong>${stages[cur - 1]}</strong></div>
                <ol class="wip-steps" style="--wip-progress:${(cur - 1) / (stages.length - 1)}" aria-label="Fáze projektu: ${stages[cur - 1]}">${steps}</ol>
              </div>
              ${it.link ? `<a class="wip-link" href="${it.link}" target="_blank" rel="noopener">Podívat se <span aria-hidden="true">→</span></a>` : ''}
            </div>
          `);
          card.style.setProperty('--i', idx);
          grid.appendChild(card);
        });
      wipSec.hidden = !grid.children.length;
    }

    // --- Portfolio ---
    document.getElementById('portfolioHeading').textContent = data.portfolio.heading;
    document.getElementById('portfolioSubheading').textContent = data.portfolio.subheading;
    const grid = document.getElementById('portfolioGrid');
    grid.innerHTML = '';
    data.portfolio.items
      .sort((a, b) => a.order - b.order)
      .forEach(p => {
        const card = el('div', 'portfolio-card reveal' + (p.featured ? ' is-featured' : ''), `
          <div class="portfolio-media">
            <img src="${p.image}" alt="${p.title}" loading="lazy">
          </div>
          <div class="portfolio-body">
            <div>
              <div class="portfolio-title">${p.title}</div>
              <div class="portfolio-meta">${p.category}</div>
              <p class="portfolio-text">${p.text}</p>
              ${p.pripad && p.pripad.problem && p.pripad.reseni && p.pripad.vysledek ? `<details class="portfolio-case">
                <summary>Jak jsme pomohli</summary>
                <dl>
                  <dt>Problém</dt><dd>${p.pripad.problem}</dd>
                  <dt>Řešení</dt><dd>${p.pripad.reseni}</dd>
                  <dt>Výsledek</dt><dd>${p.pripad.vysledek}</dd>
                </dl>
                ${p.pripad.citace ? `<blockquote>„${p.pripad.citace}“${p.pripad.autor ? `<cite>${p.pripad.autor}</cite>` : ''}</blockquote>` : ''}
              </details>` : ''}
              ${p.link ? `<a href="${p.link}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-small portfolio-link">Prohlédnout web</a>` : ''}
            </div>
            ${p.year ? `<div class="portfolio-year">${p.year}</div>` : ''}
          </div>
        `);
        grid.appendChild(card);
      });

    // --- References (static 2-column grid) ---
    document.getElementById('referencesHeading').textContent = data.references.heading;
    const refGrid = document.getElementById('referencesGrid');
    refGrid.innerHTML = '';
    data.references.items
      .filter(r => r.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(r => {
        refGrid.appendChild(el('div', 'reference-card reveal', referenceTile(r)));
      });

    // --- About ---
    document.getElementById('aboutHeading').textContent = data.about.heading;
    document.getElementById('aboutText').textContent = data.about.text;
    // Poznámka: v sekci "O nás" je místo fotky/baneru záměrně jen logo (viz index.html #aboutPhoto).

    // --- Schools ---
    document.getElementById('schoolsHeading').textContent = data.schools.heading;
    document.getElementById('schoolsText').textContent = data.schools.text;
    if (data.schools.stat) {
      document.getElementById('schoolsStatValue').textContent = data.schools.stat.value;
      document.getElementById('schoolsStatLabel').textContent = data.schools.stat.label;
    }
    const schoolsLogos = document.getElementById('schoolsLogos');
    schoolsLogos.innerHTML = '';
    const maxLog = data.schools.logosMax || 10;
    (data.schools.logos || []).slice(0, maxLog).forEach(s => {
      const item = el('div', 'school-logo', `<img src="${s.logo}" alt="${s.name}" loading="lazy">`);
      if (s.link) {
        const a = document.createElement('a');
        a.href = s.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'school-logo';
        a.innerHTML = `<img src="${s.logo}" alt="${s.name}" loading="lazy">`;
        schoolsLogos.appendChild(a);
      } else {
        schoolsLogos.appendChild(item);
      }
    });
    // „a dalších X škol“ – počet zadává PEBMedia v content.json (schools.moreSchools), nepočítá se.
    const dalsi = Number(data.schools.moreSchools) || 0;
    if (dalsi > 0) {
      const slovo = dalsi === 1 ? 'další škola' : dalsi < 5 ? 'další školy' : 'dalších škol';
      schoolsLogos.appendChild(el('div', 'school-logo schools-more', `<span class="schools-more-pocet">+${dalsi.toLocaleString('cs-CZ')}</span><span class="schools-more-text">${slovo}</span>`));
    }

    renderSchoolsGallery(data);

    // --- Process ---
    document.getElementById('processHeading').textContent = data.process.heading;
    const processGrid = document.getElementById('processGrid');
    processGrid.innerHTML = '';
    data.process.steps.forEach(s => {
      processGrid.appendChild(el('div', 'process-step reveal', `
        <div class="process-number">${s.number}</div>
        <div class="process-title">${s.title}</div>
        <div class="process-text">${s.text}</div>
      `));
    });

    // --- FAQ ---
    document.getElementById('faqHeading').textContent = data.faq.heading;
    const faqList = document.getElementById('faqList');
    faqList.innerHTML = '';
    data.faq.items
      .filter(f => f.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(f => {
        const item = el('div', 'faq-item reveal', `
          <button class="faq-question" type="button" aria-expanded="false">
            <span>${f.question}</span>
            <span class="faq-icon"></span>
          </button>
          <div class="faq-answer"><div class="faq-answer-inner">${f.answer}</div></div>
        `);
        const btn = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        btn.addEventListener('click', () => {
          const isOpen = item.classList.contains('is-open');
          faqList.querySelectorAll('.faq-item.is-open').forEach(o => {
            o.classList.remove('is-open');
            o.querySelector('.faq-answer').style.maxHeight = null;
            o.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          });
          if (!isOpen) {
            item.classList.add('is-open');
            answer.style.maxHeight = answer.scrollHeight + 'px';
            btn.setAttribute('aria-expanded', 'true');
          }
        });
        faqList.appendChild(item);
      });


    // --- CTA ---
    document.getElementById('ctaHeading').textContent = data.ctaSection.heading;
    document.getElementById('ctaText').textContent = data.ctaSection.text;
    document.getElementById('ctaButton').textContent = data.ctaSection.cta;

    // --- Contact ---
    // Druhé telefonní číslo je nepovinné; bez něj se řádek skryje.
    function setPhone2(id, value) {
      const n = document.getElementById(id);
      if (!n) return;
      if (value) { n.textContent = value; n.hidden = false; } else { n.hidden = true; }
    }
    document.getElementById('contactHeading').textContent = data.contact.heading;
    document.getElementById('contactText').textContent = data.contact.text;
    document.getElementById('contactEmail').textContent = g.email;
    document.getElementById('contactPhone').textContent = g.phone;
    setPhone2('contactPhone2', g.phone2);
    document.getElementById('contactIco').textContent = g.ico;
    const typeSelect = document.getElementById('f-type');
    typeSelect.innerHTML = '<option value="">Vyberte typ projektu</option>';
    data.contact.projectTypes.forEach(t => {
      const opt = el('option', null, t);
      opt.value = t;
      typeSelect.appendChild(opt);
    });

    // --- Footer ---
    document.getElementById('footerText').textContent = data.footer.text;
    document.getElementById('footerEmail').textContent = g.email;
    document.getElementById('footerPhone').textContent = g.phone;
    setPhone2('footerPhone2', g.phone2);
    document.getElementById('footerCopyright').textContent = data.footer.copyright;
    document.getElementById('footerPrivacy').href = data.footer.privacyLink;
    document.getElementById('footerInstagram').href = g.social.instagram || '#';
    // LinkedIn a Facebook zatím nejsou založené — odkazy v patičce dočasně skryté (viz index.html).

    initInteractions(data);
  }

  /**
   * Navigace: posuvná "pilulka" pod odkazem, na kterém je myš, a zvýraznění
   * sekce, kterou má návštěvník právě na obrazovce (aria-current pro čtečky).
   */
  function initNavIndicator() {
    const nav = document.querySelector('.main-nav');
    const indicator = nav && nav.querySelector('.nav-indicator');
    if (!nav || !indicator) return;
    // Jen odkazy přímo v liště (ne položky rozbalovací nabídky „O nás“).
    const links = Array.from(nav.querySelectorAll(':scope > a, :scope > .nav-drop > a'));
    let activeLink = null;

    const moveTo = (link) => {
      if (!link) { indicator.classList.remove('is-visible'); return; }
      const obal = link.parentElement === nav ? link : link.parentElement;
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${obal.offsetLeft + (obal === link ? 0 : link.offsetLeft)}px)`;
      indicator.classList.add('is-visible');
    };

    links.forEach((link) => {
      link.addEventListener('mouseenter', () => moveTo(link));
      link.addEventListener('focus', () => moveTo(link));
    });
    nav.addEventListener('mouseleave', () => moveTo(activeLink));
    // Po výběru v nabídce „O nás“ ji zavřít (jinak by zůstala otevřená, dokud má položka fokus).
    nav.querySelectorAll('.nav-drop-menu a').forEach((a) => a.addEventListener('click', () => a.blur()));
    nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget)) moveTo(activeLink); });
    window.addEventListener('resize', () => moveTo(activeLink), { passive: true });

    if (!('IntersectionObserver' in window)) return;
    // Odkaz může hlídat víc sekcí (data-sekce="o-nas skoly": „O nás“ svítí i u škol).
    const sections = links
      .flatMap((link) => {
        const href = link.getAttribute('href') || '';
        const ids = link.dataset.sekce ? link.dataset.sekce.split(/\s+/) : href.startsWith('#') ? [href.slice(1)] : [];
        return ids.map((id) => document.getElementById(id)).filter(Boolean).map((section) => ({ link, section }));
      });

    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });
      const current = sections.find((s) => visible.has(s.section));
      const next = current ? current.link : null;
      if (next === activeLink) return;
      if (activeLink) { activeLink.classList.remove('is-active'); activeLink.removeAttribute('aria-current'); }
      activeLink = next;
      if (activeLink) { activeLink.classList.add('is-active'); activeLink.setAttribute('aria-current', 'location'); }
      if (!nav.matches(':hover')) moveTo(activeLink);
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s.section));
  }

  function initInteractions(data) {
    const g = data.general;

    // Patička: tlačítko Nahoru a postupné vyjetí velkého nápisu
    const toTop = document.getElementById('toTop');
    if (toTop && !toTop._bound) {
      toTop._bound = true;
      toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
    const mark = document.querySelector('.footer-wordmark');
    if (mark && 'IntersectionObserver' in window && !mark._armed) {
      mark._armed = true;
      mark.classList.add('is-armed');
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) { mark.classList.add('in-view'); obs.disconnect(); }
      }, { threshold: 0.3 });
      obs.observe(mark);
    }

    // Sticky header shadow
    const header = document.getElementById('siteHeader');
    const progressBar = document.getElementById('scrollProgress');
    let scrollTicking = false;
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        header.classList.toggle('is-scrolled', window.scrollY > 8);
        if (progressBar) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          progressBar.style.setProperty('--progress', max > 0 ? Math.min(window.scrollY / max, 1).toFixed(4) : 0);
        }
        scrollTicking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    initNavIndicator();

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobileNav');
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('is-open');
      hamburger.classList.toggle('is-open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    const closeMobileNav = () => {
      mobileNav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));

    // Escape zavře mobilní menu a vrátí fokus na hamburger (WCAG 2.1.2)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
        closeMobileNav();
        hamburger.focus();
      }
    });

    // Reveal on scroll
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealEls.forEach(e => io.observe(e));
    } else {
      revealEls.forEach(e => e.classList.add('is-visible'));
    }

    // Animované počítání čísla ve statistice sekce "Školy" (viz countUpOnView výše)
    countUpOnView(document.getElementById('schoolsStatValue'));

    // Contact form (odesíláno nativním POST na Web3Forms — bez fetch/AJAX,
    // aby formulář fungoval spolehlivě i bez CORS. Web3Forms po odeslání
    // přesměruje zpět na náš web pomocí "redirect", kde zobrazíme poděkování.)
    const form = document.getElementById('contactForm');
    if (form) {
      const successEl = document.getElementById('formSuccess');
      const errorEl = document.getElementById('formError');
      const formErrorEmail = document.getElementById('formErrorEmail');
      if (formErrorEmail) formErrorEmail.textContent = g.email;

      // Návratová URL se skládá dynamicky, aby fungovala i po přepnutí
      // na vlastní doménu pebmedia.cz.
      const nextField = document.getElementById('formNext');
      if (nextField) {
        const base = window.location.origin + window.location.pathname;
        nextField.value = `${base}?sent=1#kontakt`;
      }

      form.addEventListener('submit', () => {
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Odesílám…';
        // Formulář se odešle běžným (nativním) POST požadavkem prohlížeče —
        // žádný preventDefault, žádný fetch.
      });

      // Poptávka přenesená z obchodu (kalkulačka, služby): předvyplnit zprávu a typ projektu.
      try {
        const prenesena = JSON.parse(sessionStorage.getItem('pebmedia-poptavka') || 'null');
        if (prenesena && typeof prenesena.text === 'string') {
          const zprava = document.getElementById('f-message');
          const typ = document.getElementById('f-type');
          if (zprava && !zprava.value.trim()) zprava.value = prenesena.text.slice(0, 3000);
          if (typ && [...typ.options].some(o => o.value === prenesena.typ)) typ.value = prenesena.typ;
          setTimeout(() => { const k = document.getElementById('kontakt'); if (k) k.scrollIntoView({ block: 'start' }); }, 200);
        }
        sessionStorage.removeItem('pebmedia-poptavka');
      } catch (e) { /* soukromé okno nebo poškozená data */ }

      initKviz(form);

      // Po návratu z Web3Forms (?sent=1) zobrazíme poděkování a vyčistíme URL.
      const params = new URLSearchParams(window.location.search);
      if (params.get('sent') === '1') {
        successEl.classList.add('is-visible');
        errorEl.classList.remove('is-visible');
        params.delete('sent');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + '#kontakt';
        window.history.replaceState({}, '', cleanUrl);
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  loadContent().then(data => { if (data) render(data); });
})();
