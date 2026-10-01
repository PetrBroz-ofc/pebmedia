/* ==========================================================================
   Kontaktní formulář — PEBMedia
   Validace na straně klienta a odeslání dat.
   Bez vlastního backendu — v README najdete návod na napojení přes
   Formspree (bez psaní serveru) nebo na vlastní endpoint.
   ========================================================================== */

(function () {
  var form = document.getElementById('kfForm');
  if (!form) return;

  var status = document.getElementById('kfStatus');
  var submitBtn = document.getElementById('kfSubmit');

  // ---------------------------------------------------------------------
  // SEM vložte adresu, kam se mají data formuláře odesílat.
  // Možnost A — Formspree (viz README): https://formspree.io/f/VASE_ID
  // Možnost B — vlastní serverless endpoint, např. "/api/kontakt"
  // Pokud necháte prázdné, formulář se neodešle a zobrazí se chyba.
  // ---------------------------------------------------------------------
  var ENDPOINT_URL = '';

  var fields = [
    { id: 'kfName', errorId: 'kfNameError', validate: function (v) {
        return v.trim().length >= 2 ? '' : 'Zadejte prosím své jméno (alespoň 2 znaky).';
      } },
    { id: 'kfEmail', errorId: 'kfEmailError', validate: function (v) {
        var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(v.trim()) ? '' : 'Zadejte prosím platnou e-mailovou adresu.';
      } },
    { id: 'kfMessage', errorId: 'kfMessageError', validate: function (v) {
        return v.trim().length >= 10 ? '' : 'Zpráva by měla mít alespoň 10 znaků.';
      } }
  ];

  function setFieldError(field, message) {
    var input = document.getElementById(field.id);
    var errorEl = document.getElementById(field.errorId);
    var wrapper = input.closest('.kf-field');

    if (message) {
      wrapper.classList.add('has-error');
      errorEl.textContent = message;
    } else {
      wrapper.classList.remove('has-error');
      errorEl.textContent = '';
    }
  }

  function validateForm() {
    var isValid = true;
    fields.forEach(function (field) {
      var input = document.getElementById(field.id);
      var message = field.validate(input.value);
      if (message) isValid = false;
      setFieldError(field, message);
    });
    return isValid;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = '';
    status.className = 'kf-status';

    if (!validateForm()) {
      status.textContent = 'Zkontrolujte prosím zvýrazněná pole.';
      status.classList.add('is-error');
      return;
    }

    if (!ENDPOINT_URL) {
      status.textContent = 'Formulář zatím není napojen na žádnou adresu — viz README.md (ENDPOINT_URL ve skript.js).';
      status.classList.add('is-error');
      return;
    }

    submitBtn.disabled = true;
    status.textContent = 'Odesílám…';

    var data = {
      jmeno: document.getElementById('kfName').value.trim(),
      email: document.getElementById('kfEmail').value.trim(),
      zprava: document.getElementById('kfMessage').value.trim()
    };

    fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Odeslání se nezdařilo.');
        status.textContent = 'Děkujeme, zpráva byla odeslána!';
        status.classList.add('is-success');
        form.reset();
      })
      .catch(function () {
        status.textContent = 'Zprávu se nepodařilo odeslat. Zkuste to prosím později.';
        status.classList.add('is-error');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
