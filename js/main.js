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

  /**
   * Text zprávy jako bezpečné DOM uzly: žádné HTML z modelu, jen odstavce
   * a odkazy na https adresy, e-maily a telefon (ochrana proti XSS).
   */
  function textToNodes(text) {
    const frag = document.createDocumentFragment();
    const re = /(https?:\/\/[^\s<>"')]+|(?:www\.)?pebmedia\.cz(?:\/[^\s<>"')]*)?|[\w.+-]+@[\w-]+\.[\w.-]+|\+420(?:\s?\d{3}){3})/g;
    String(text).split(/\n{2,}/).forEach((odstavec, i) => {
      if (i) frag.appendChild(document.createElement('br'));
      if (i) frag.appendChild(document.createElement('br'));
      let last = 0;
      odstavec.replace(re, (m, _g, idx) => {
        frag.appendChild(document.createTextNode(odstavec.slice(last, idx)));
        const cisty = m.replace(/[.,;:!?]+$/, '');
        const a = document.createElement('a');
        if (/@/.test(cisty)) a.href = 'mailto:' + cisty;
        else if (/^\+420/.test(cisty)) a.href = 'tel:' + cisty.replace(/\s/g, '');
        else a.href = /^https?:/.test(cisty) ? cisty : 'https://' + cisty.replace(/^www\./, '');
        if (/^https?:/.test(a.href) && !/^https:\/\/(www\.)?pebmedia\.cz/.test(a.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.textContent = cisty;
        frag.appendChild(a);
        frag.appendChild(document.createTextNode(m.slice(cisty.length)));
        last = idx + m.length;
        return m;
      });
      frag.appendChild(document.createTextNode(odstavec.slice(last)));
    });
    return frag;
  }

  function initHelpWidget(faqItems) {
    const widget = document.getElementById('helpWidget');
    if (!widget) return;
    const toggle = document.getElementById('helpWidgetToggle');
    const messages = document.getElementById('helpWidgetMessages');
    const questionsWrap = document.getElementById('helpWidgetQuestions');
    const contactLink = document.getElementById('helpWidgetContactLink');
    const form = document.getElementById('helpWidgetForm');
    const input = document.getElementById('helpWidgetInput');
    const historie = []; // konverzace pro AI asistenta (posílá se jen při dotazu)

    function addMessage(text, from) {
      const zprava = el('div', 'help-msg help-msg-' + from);
      zprava.appendChild(textToNodes(text));
      messages.appendChild(zprava);
      messages.scrollTop = messages.scrollHeight;
      return zprava;
    }

    // Stránka může přijít už předgenerovaná (scripts/predgeneruj.js) — začít načisto.
    messages.innerHTML = '';
    addMessage('Dobrý den, jsem AI asistent PEBMedia. Poradím s webem, e-shopem, brandingem i s nákupem v obchodě. Napište dotaz, nebo vyberte častou otázku níže.', 'bot');

    questionsWrap.innerHTML = '';
    faqItems.forEach(f => {
      const btn = el('button', 'help-widget-question-btn', f.question);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        addMessage(f.question, 'user');
        historie.push({ role: 'user', content: f.question }, { role: 'assistant', content: f.answer });
        setTimeout(() => addMessage(f.answer, 'bot'), 250);
      });
      questionsWrap.appendChild(btn);
    });

    if (form && input) {
      let odesila = false;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dotaz = input.value.trim();
        if (!dotaz || odesila) return;
        odesila = true;
        input.value = '';
        addMessage(dotaz, 'user');
        historie.push({ role: 'user', content: dotaz });
        const pise = addMessage('Píšu odpověď…', 'bot');
        pise.classList.add('is-typing');
        try {
          const res = await fetch('api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: historie.slice(-16) })
          });
          const json = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
          pise.remove();
          if (json && res.ok && json.reply) {
            historie.push({ role: 'assistant', content: json.reply });
            addMessage(json.reply, 'bot');
            if (window.PEBZvuk) window.PEBZvuk.play('success');
          } else {
            historie.pop();
            addMessage((json && json.error) || 'AI asistent tady zatím neběží. Napište nám prosím na info.pebmedia@gmail.com, ozveme se obratem.', 'bot');
            if (window.PEBZvuk) window.PEBZvuk.play('error');
          }
        } catch (err) {
          pise.remove();
          historie.pop();
          addMessage('Spojení se nepodařilo. Zkuste to prosím znovu, nebo napište na info.pebmedia@gmail.com.', 'bot');
        } finally {
          odesila = false;
          input.focus();
        }
      });
    }

    if (contactLink) {
      contactLink.addEventListener('click', () => {
        widget.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    }

    toggle.addEventListener('click', () => {
      const isOpen = widget.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) messages.scrollTop = messages.scrollHeight;
    });

    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && widget.classList.contains('is-open')) {
        widget.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Escape zavře widget a vrátí fokus na přepínač (WCAG 2.1.2)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && widget.classList.contains('is-open')) {
        widget.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
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
    (data.schools.logos || []).forEach(s => {
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

    initHelpWidget(
      data.faq.items.filter(f => f.visible !== false).sort((a, b) => a.order - b.order)
    );

    // --- CTA ---
    document.getElementById('ctaHeading').textContent = data.ctaSection.heading;
    document.getElementById('ctaText').textContent = data.ctaSection.text;
    document.getElementById('ctaButton').textContent = data.ctaSection.cta;

    // --- Contact ---
    document.getElementById('contactHeading').textContent = data.contact.heading;
    document.getElementById('contactText').textContent = data.contact.text;
    document.getElementById('contactEmail').textContent = g.email;
    document.getElementById('contactPhone').textContent = g.phone;
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
    const links = Array.from(nav.querySelectorAll('a'));
    let activeLink = null;

    const moveTo = (link) => {
      if (!link) { indicator.classList.remove('is-visible'); return; }
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
      indicator.classList.add('is-visible');
    };

    links.forEach((link) => {
      link.addEventListener('mouseenter', () => moveTo(link));
      link.addEventListener('focus', () => moveTo(link));
    });
    nav.addEventListener('mouseleave', () => moveTo(activeLink));
    nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget)) moveTo(activeLink); });
    window.addEventListener('resize', () => moveTo(activeLink), { passive: true });

    if (!('IntersectionObserver' in window)) return;
    const sections = links
      .map((link) => {
        const id = (link.getAttribute('href') || '').startsWith('#') ? link.getAttribute('href').slice(1) : null;
        const section = id && document.getElementById(id);
        return section ? { link, section } : null;
      })
      .filter(Boolean);

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
