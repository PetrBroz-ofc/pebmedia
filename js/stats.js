/* Anonymní počítání návštěv (Vercel Web Analytics).
 * Běží jen na pebmedia.cz, ne lokálně ani v náhledech.
 * Bez cookies. Odesílá se jen adresa stránky bez části za # a z parametrů
 * jen "ref" (odkud člověk přišel). Údaje z formulářů, objednávek ani chatu se
 * při počítání nikam neodesílají. Parametry jako session_id po platbě se zahodí.
 */
(function () {
  if (!/^(www\.)?pebmedia\.cz$/.test(location.hostname)) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va('beforeSend', function (event) {
    try {
      var u = new URL(event.url);
      var ref = u.searchParams.get('ref');
      var clean = u.origin + u.pathname + (ref ? '?ref=' + encodeURIComponent(ref.slice(0, 40)) : '');
      return Object.assign({}, event, { url: clean });
    } catch (e) {
      return null;
    }
  });
  var s = document.createElement('script');
  s.defer = true;
  s.src = '/_vercel/insights/script.js';
  document.head.appendChild(s);
})();
