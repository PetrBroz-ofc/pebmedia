// api/_lib/email.js
// Sdílené odesílání e-mailů přes Resend (https://resend.com), stejný princip
// jako původní api/contact.js. Pokud RESEND_API_KEY není nastaven, e-mail se
// jen zaloguje do Vercel logu, aby nic nespadlo i bez nastaveného klíče
// (užitečné při testování Stripe webhooku bez plně nastaveného e-mailu).

async function sendEmail({ to, subject, text, html, attachments }) {
  const { RESEND_API_KEY, CONTACT_FROM_EMAIL } = process.env;

  if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL) {
    console.log('[E-mail — RESEND není nastaven]', { to, subject, text });
    return { ok: true, sent: false, note: 'RESEND_API_KEY nebo CONTACT_FROM_EMAIL není nastaven.' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to,
      // Odesílací adresa (např. obchod@pebmedia.cz) nemá schránku — odpovědi zákazníků
      // proto směřujeme na skutečný e-mail PEBMedia.
      reply_to: process.env.REPLY_TO_EMAIL || 'info.pebmedia@gmail.com',
      subject,
      text,
      html: html || undefined,
      // [{ filename, content (base64) }] — např. PDF e-booku
      attachments: attachments && attachments.length ? attachments : undefined
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend chyba: ${errText}`);
  }

  return { ok: true, sent: true };
}

module.exports = { sendEmail };
