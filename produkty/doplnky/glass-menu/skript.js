/* ==========================================================================
   Glass menu — PEBMedia
   Logika: otevírání/zavírání mobilního menu + sklený efekt při scrollu.
   Bez závislostí, čistý JavaScript.
   ========================================================================== */

(function () {
  var header = document.getElementById('gmHeader');
  var toggle = document.getElementById('gmToggle');
  var menu = document.getElementById('gmMenu');

  if (!toggle || !menu || !header) return;

  function openMenu() {
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Zavřít menu');
  }

  function closeMenu() {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Otevřít menu');
  }

  function isOpen() {
    return menu.classList.contains('is-open');
  }

  // Klik na hamburger přepíná stav menu
  toggle.addEventListener('click', function () {
    if (isOpen()) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Zavření klávesou Escape (přístupnost)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      closeMenu();
      toggle.focus();
    }
  });

  // Zavření po kliknutí mimo menu
  document.addEventListener('click', function (e) {
    if (isOpen() && !menu.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  // Zavření po kliknutí na odkaz v menu (mobilní zobrazení)
  menu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (isOpen()) closeMenu();
    });
  });

  // Vizuální změna lišty po odscrollování stránky
  function handleScroll() {
    if (window.scrollY > 8) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
})();
