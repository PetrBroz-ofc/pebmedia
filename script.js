// PEB MEDIA — shared interactions

document.addEventListener('DOMContentLoaded', () => {

  /* Mobile nav */
  const burger = document.querySelector('.nav-burger');
  const panel = document.querySelector('.mobile-panel');
  if (burger && panel) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      panel.classList.toggle('open');
      document.body.style.overflow = panel.classList.contains('open') ? 'hidden' : '';
    });
    panel.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      burger.classList.remove('open');
      panel.classList.remove('open');
      document.body.style.overflow = '';
    }));
  }

  /* Reveal on scroll */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* Work list expand/collapse */
  document.querySelectorAll('.work-item').forEach(item => {
    const header = item.querySelector('.work-body');
    if (!header) return;
    header.addEventListener('click', () => {
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.work-item.active').forEach(i => i.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  });

  /* Capability hover reveal (touch fallback: click) */
  document.querySelectorAll('.cap-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.matchMedia('(hover: none)').matches) {
        item.classList.toggle('hover-open');
      }
    });
  });

  /* Status console — live time + coordinates */
  const clock = document.getElementById('status-clock');
  if (clock) {
    const update = () => {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('cs-CZ', {
        timeZone: 'Europe/Prague',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);
      clock.textContent = fmt + ' CET — LIBEREC, CZ';
    };
    update();
    setInterval(update, 15000);
  }

  /* Contact form (front-end only placeholder submit) */
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = document.getElementById('form-status');
      if (status) {
        const lang = window.PEB_LANG || 'cs';
        const dict = window.PEB_I18N && window.PEB_I18N.TRANSLATIONS[lang];
        status.textContent = (dict && dict.form && dict.form.statusPlaceholder) ||
          'Zpráva připravena — napojte formulář na svůj vlastní endpoint (Vercel function / e-mail) pro odesílání.';
        status.classList.add('show');
      }
      form.reset();
    });
  }

});
