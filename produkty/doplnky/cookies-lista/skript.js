/* ==========================================================================
   Cookies lišta — PEBMedia
   Logika souhlasu: zobrazení, uložení volby, podrobné nastavení.
   Důležité: žádné nepotřebné (analytické/marketingové) skripty se
   nespouští, dokud uživatel neudělí souhlas — viz funkce loadScriptsAfterConsent().
   ========================================================================== */

(function () {
  var STORAGE_KEY = 'pebCookieConsent';

  var bar = document.getElementById('clBar');
  var modal = document.getElementById('clModal');
  if (!bar || !modal) return;

  var acceptBtn = document.getElementById('clAccept');
  var rejectBtn = document.getElementById('clReject');
  var settingsBtn = document.getElementById('clSettings');
  var modalSaveBtn = document.getElementById('clModalSave');
  var modalRejectBtn = document.getElementById('clModalReject');
  var analyticsCheckbox = document.getElementById('clAnalytics');
  var marketingCheckbox = document.getElementById('clMarketing');

  function getConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveConsent(consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (e) {
      // Local storage nemusí být dostupný (např. v soukromém okně) — lištu
      // v takovém případě pouze skryjeme na dobu této návštěvy.
    }
    applyConsent(consent);
    hideBar();
    hideModal();
  }

  // -------------------------------------------------------------------
  // SEM doplňte vlastní načítání skriptů podle uděleného souhlasu
  // (např. Google Analytics, Facebook Pixel apod.). Tato funkce se volá
  // AŽ POTÉ, co uživatel souhlas udělí — nikdy předem.
  // -------------------------------------------------------------------
  function applyConsent(consent) {
    if (consent.analytics) {
      // Příklad: načtení analytického skriptu
      // var s = document.createElement('script');
      // s.src = 'https://example.com/analytics.js';
      // document.head.appendChild(s);
    }
    if (consent.marketing) {
      // Příklad: načtení marketingového skriptu
    }
  }

  function showBar() { bar.hidden = false; }
  function hideBar() { bar.hidden = true; }
  function showModal() { modal.hidden = false; }
  function hideModal() { modal.hidden = true; }

  // Při načtení stránky: pokud už souhlas existuje, jen ho aplikujeme.
  // Pokud ne, zobrazíme lištu.
  var existing = getConsent();
  if (existing) {
    applyConsent(existing);
  } else {
    showBar();
  }

  acceptBtn.addEventListener('click', function () {
    saveConsent({ necessary: true, analytics: true, marketing: true, ts: Date.now() });
  });

  rejectBtn.addEventListener('click', function () {
    saveConsent({ necessary: true, analytics: false, marketing: false, ts: Date.now() });
  });

  settingsBtn.addEventListener('click', function () {
    showModal();
  });

  modalRejectBtn.addEventListener('click', function () {
    analyticsCheckbox.checked = false;
    marketingCheckbox.checked = false;
    saveConsent({ necessary: true, analytics: false, marketing: false, ts: Date.now() });
  });

  modalSaveBtn.addEventListener('click', function () {
    saveConsent({
      necessary: true,
      analytics: !!analyticsCheckbox.checked,
      marketing: !!marketingCheckbox.checked,
      ts: Date.now()
    });
  });

  // Zavření modálu klávesou Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) {
      hideModal();
    }
  });
})();
