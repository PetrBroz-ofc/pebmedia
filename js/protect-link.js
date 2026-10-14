/* PEBMedia: přechod na PEBMedia Protect.
   Klik na logo: P se změní na zámek, zámek cvakne, objeví se „Protect“,
   zespodu vyjede plocha a otevře se protect.pebmedia.cz.
   Ctrl/Cmd/prostřední tlačítko otevře odkaz normálně, při omezení animací se jde rovnou. */
(function () {
  'use strict';
  var LOCK = '<svg viewBox="0 0 400 400" aria-hidden="true"><rect x="12" y="12" width="376" height="376" rx="88" fill="#0B6E63"/><path d="M150 196V146a50 50 0 0 1 100 0v50" fill="none" stroke="#F6F6F3" stroke-width="34" stroke-linecap="round"/><rect x="112" y="186" width="176" height="132" rx="22" fill="#F6F6F3"/><circle cx="200" cy="244" r="17" fill="#0B6E63"/><rect x="191" y="248" width="18" height="34" rx="9" fill="#0B6E63"/></svg>';
  var busy = false;

  function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function curtain(href) {
    var c = document.createElement('div');
    c.className = 'protect-curtain';
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<span class="protect-curtain-brand">' + LOCK + 'PEBMedia<span class="logo-protect-tag">Protect</span></span>';
    document.body.appendChild(c);
    void c.offsetWidth;
    document.body.classList.add('is-leaving-protect');
    c.classList.add('is-in');
    setTimeout(function () { window.location.href = href; }, 1250);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-protect-link]');
    if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (reduced()) return;
    e.preventDefault();
    if (busy) return;
    busy = true;
    var href = a.href;
    if (!a.classList.contains('logo-protect')) { curtain(href); return; }
    a.classList.add('is-locking');
    setTimeout(function () { a.classList.add('is-locked'); }, 300);
    setTimeout(function () { a.classList.add('is-protect'); }, 560);
    setTimeout(function () { curtain(href); }, 1050);
  });

  // Návrat tlačítkem Zpět: vrátit stránku do původního stavu.
  window.addEventListener('pageshow', function () {
    busy = false;
    document.body.classList.remove('is-leaving-protect');
    Array.prototype.forEach.call(document.querySelectorAll('.protect-curtain'), function (c) { c.parentNode.removeChild(c); });
    Array.prototype.forEach.call(document.querySelectorAll('.logo-protect'), function (l) { l.classList.remove('is-locking', 'is-locked', 'is-protect'); });
  });
})();
