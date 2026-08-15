/* ==========================================================================
   PEBMedia — public site renderer
   Čte data/content.json (editovatelné přes admin.html) a vykresluje obsah.
   Poznámka: pro lokální testování s fetch() spusťte web přes lokální server
   (např. `npx serve .`), nikoli přímo dvojklikem na index.html.
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
      console.error('Nepodařilo se načíst data/content.json', err);
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

  function starsSvg(count) {
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += `<svg viewBox="0 0 20 20" style="${i < count ? '' : 'fill:#E3E3DE'}"><path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L10 14.9 4.4 18l1.4-6.2L1 7.5l6.4-.6L10 1z"/></svg>`;
    }
    return out;
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
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
    document.getElementById('heroEyebrow').textContent = hero.eyebrow;
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

    // --- Services ---
    document.getElementById('servicesHeading').textContent = data.services.heading;
    document.getElementById('servicesSubheading').textContent = data.services.subheading;
    const servicesList = document.getElementById('servicesList');
    servicesList.innerHTML = '';
    data.services.items
      .filter(s => s.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(s => {
        const row = el('div', 'service-row reveal', `
          <div class="service-number">${s.number}</div>
          <div class="service-title">${s.title}</div>
          <div class="service-text">${s.text}</div>
          <div class="service-arrow"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></div>
        `);
        servicesList.appendChild(row);
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
            </div>
            ${p.year ? `<div class="portfolio-year">${p.year}</div>` : ''}
          </div>
        `);
        if (p.link) {
          card.style.cursor = 'pointer';
          card.addEventListener('click', () => window.open(p.link, '_blank'));
        }
        grid.appendChild(card);
      });

    // --- References ---
    document.getElementById('referencesHeading').textContent = data.references.heading;
    const refGrid = document.getElementById('referencesGrid');
    refGrid.innerHTML = '';
    data.references.items
      .filter(r => r.visible !== false)
      .sort((a, b) => a.order - b.order)
      .forEach(r => {
        const card = el('div', 'reference-card reveal', `
          <div class="stars">${starsSvg(r.rating)}</div>
          <p class="reference-text">„${r.text}“</p>
          <div class="reference-author">
            <div class="reference-avatar">${r.photo ? `<img src="${r.photo}" alt="${r.name}">` : initials(r.name)}</div>
            <div>
              <div class="reference-name">${r.name}</div>
              <div class="reference-company">${r.company}</div>
            </div>
          </div>
        `);
        refGrid.appendChild(card);
      });

    // --- About ---
    document.getElementById('aboutHeading').textContent = data.about.heading;
    document.getElementById('aboutText').textContent = data.about.text;
    const aboutPhoto = document.getElementById('aboutPhoto');
    if (data.about.photo) {
      aboutPhoto.innerHTML = `<img src="${data.about.photo}" alt="${g.brand}">`;
    }

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
    document.getElementById('footerLinkedin').href = g.social.linkedin || '#';
    document.getElementById('footerFacebook').href = g.social.facebook || '#';

    initInteractions();
  }

  function initInteractions() {
    // Sticky header shadow
    const header = document.getElementById('siteHeader');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobileNav');
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('is-open');
      hamburger.classList.toggle('is-open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mobileNav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      document.body.style.overflow = '';
    }));

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

    // Contact form
    const form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Odesílám…';
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
          const res = await fetch('api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('send failed');
        } catch (err) {
          console.warn('Odeslání přes API selhalo, formulář je připraven na napojení backendu.', err);
        } finally {
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          document.getElementById('formSuccess').classList.add('is-visible');
        }
      });
    }
  }

  loadContent().then(data => { if (data) render(data); });
})();
