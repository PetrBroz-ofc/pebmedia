// api/contact.js
// Přijme data z kontaktního formuláře a odešle je e-mailem přes Resend
// (https://resend.com — zdarma do 3000 e-mailů/měsíc, jednoduché nastavení).
// Pokud RESEND_API_KEY není nastaven, poptávka se pouze zaloguje do
// Vercel logu, aby formulář nespadl i bez nastaveného e-mailu.
//
// Potřebné proměnné prostředí:
//   RESEND_API_KEY   - API klíč z resend.com
//   CONTACT_TO_EMAIL - e-mail, na který mají poptávky chodit (např. info@pebmedia.cz)
//   CONTACT_FROM_EMAIL - odesílací adresa ověřená v Resend (např. web@pebmedia.cz)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { name, company, email, phone, projectType, budget, message } = body || {};

  if (!name || !email || !message) {
    res.status(400).json({ error: 'Vyplňte prosím jméno, e-mail a zprávu.' });
    return;
  }

  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = process.env;

  const summary = `
    Nová poptávka z webu PEBMedia

    Jméno: ${name}
    Firma: ${company || '—'}
    E-mail: ${email}
    Telefon: ${phone || '—'}
    Typ projektu: ${projectType || '—'}
    Rozpočet: ${budget || '—'}

    Zpráva:
    ${message}
  `;

  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) {
    console.log('[Kontaktní formulář — RESEND není nastaven]', summary);
    res.status(200).json({ ok: true, note: 'E-mail nebyl odeslán, RESEND_API_KEY není nastaven na serveru.' });
    return;
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: CONTACT_TO_EMAIL,
        reply_to: email,
        subject: `Nová poptávka — ${name}${company ? ' (' + company + ')' : ''}`,
        text: summary
      })
    });
    if (!resendRes.ok) throw new Error(await resendRes.text());
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Chyba při odesílání e-mailu', err);
    res.status(500).json({ error: 'E-mail se nepodařilo odeslat.' });
  }
};
