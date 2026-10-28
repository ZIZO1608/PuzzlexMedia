/* The branded "we got your request" email sent to whoever fills in the contact form, in the language of
   the page they used. It never repeats what they wrote (only their first name), so the form can't be
   used to send someone else a message through us. Built with tables and inline styles: that is what
   email clients (Gmail, Outlook, Apple Mail) render reliably. */
'use strict';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const COPY = {
  ar: {
    subject: 'وصلنا طلبك — PuzzleX Media',
    preheader: 'شكرًا لتواصلك معنا. سيتواصل معك فريقنا خلال 48 ساعة.',
    hello: (name) => `مرحبًا ${name}،`,
    intro: 'شكرًا لتواصلك مع PuzzleX Media. وصلنا طلبك بنجاح، وهو الآن بين يدي فريقنا.',
    promise: 'سيتواصل معك أحد أعضاء فريقنا خلال 48 ساعة',
    promiseSub: 'في أيام العمل، عبر البريد الإلكتروني أو الهاتف الذي تركته لنا.',
    nextTitle: 'ماذا يحدث الآن؟',
    steps: ['نراجع طلبك والقطع التي اخترتها.', 'نتواصل معك لنفهم أهدافك وجمهورك بدقة.', 'نرسل لك مقترحًا واضحًا بالخطة والتكلفة والمدة.'],
    ref: 'رقم الطلب',
    urgent: 'لأمر عاجل، راسلنا مباشرة على واتساب:',
    whatsapp: 'راسلنا على واتساب',
    work: 'شاهد أعمالنا',
    signoff: 'مع التحية،',
    team: 'فريق PuzzleX Media',
    tagline: 'كل قطعة لها مكان.',
    why: 'وصلتك هذه الرسالة لأنك أرسلت نموذج التواصل على موقعنا. هذه رسالة تلقائية، ويمكنك الرد عليها مباشرة.',
  },
  en: {
    subject: 'We’ve received your request — PuzzleX Media',
    preheader: 'Thanks for reaching out. Our team will contact you within 48 hours.',
    hello: (name) => `Hi ${name},`,
    intro: 'Thank you for contacting PuzzleX Media. Your request has arrived safely and is now with our team.',
    promise: 'A member of our team will contact you within 48 hours',
    promiseSub: 'On working days, by email or on the phone number you gave us.',
    nextTitle: 'What happens next?',
    steps: ['We review your request and the pieces you picked.', 'We get in touch to understand your goals and audience.', 'We send you a clear proposal: plan, cost and timeline.'],
    ref: 'Request number',
    urgent: 'If it’s urgent, message us directly on WhatsApp:',
    whatsapp: 'Message us on WhatsApp',
    work: 'See our work',
    signoff: 'Best regards,',
    team: 'The PuzzleX Media team',
    tagline: 'Every piece has its place.',
    why: 'You’re receiving this because you sent the contact form on our website. This is an automatic reply; you can answer it directly.',
  },
};

const LIME = '#D7FF00', INK = '#0a0a0b', TEXT = '#1a1a1c', MUTED = '#6b6b70', PAPER = '#f4f4f1';

// m: the saved message; settings: the admin panel's contact details; siteUrl: the public address
function autoReply(m, { settings = {}, siteUrl }) {
  const en = m.lang === 'en';
  const c = COPY[en ? 'en' : 'ar'];
  const dir = en ? 'ltr' : 'rtl', align = en ? 'left' : 'right';
  const first = m.name.trim().split(/\s+/)[0];
  const ref = m.id.slice(0, 8).toUpperCase();
  const base = `${siteUrl}${en ? '/en' : ''}`;
  const wa = settings.whatsapp ? `https://wa.me/${String(settings.whatsapp).replace(/[^\d]/g, '')}` : '';
  const font = en ? 'Arial, Helvetica, sans-serif' : 'Tahoma, Arial, sans-serif';

  const button = (href, label, primary) => `<a href="${esc(href)}" style="display:inline-block;margin:4px;padding:13px 26px;border-radius:999px;font:bold 14px ${font};text-decoration:none;${primary ? `background:${LIME};color:${INK};` : `background:${INK};color:${LIME};`}">${esc(label)}</a>`;

  const html = `<!doctype html>
<html lang="${en ? 'en' : 'ar'}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;font-family:${font};color:${TEXT};text-align:${align};">
  <tr><td style="background:${INK};padding:26px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" dir="ltr"><tr>
      <td style="padding-right:12px;"><img src="${esc(siteUrl)}/assets/apple-touch-icon.png" width="44" height="44" alt="PuzzleX" style="display:block;border:0;border-radius:12px;"></td>
      <td style="font:bold 20px Arial, Helvetica, sans-serif;color:#ffffff;letter-spacing:.5px;">PuzzleX <span style="color:${LIME};">Media</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:5px;background:${LIME};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:36px 32px 8px;">
    <p style="margin:0 0 14px;font-size:20px;font-weight:bold;">${esc(c.hello(first))}</p>
    <p style="margin:0;font-size:15px;line-height:1.9;color:${TEXT};">${esc(c.intro)}</p>
  </td></tr>
  <tr><td style="padding:22px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:16px;">
      <tr><td style="padding:22px 24px;text-align:${align};">
        <p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:${LIME};">${esc(c.promise)}</p>
        <p style="margin:0;font-size:13px;line-height:1.8;color:#cfcfca;">${esc(c.promiseSub)}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 32px 6px;">
    <p style="margin:0 0 12px;font-size:16px;font-weight:bold;">${esc(c.nextTitle)}</p>
    ${c.steps.map((s, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
      <td valign="top" style="width:30px;"><div style="width:24px;height:24px;border-radius:7px;background:${LIME};color:${INK};font:bold 13px/24px Arial, sans-serif;text-align:center;">${i + 1}</div></td>
      <td style="padding-${en ? 'left' : 'right'}:8px;font-size:14px;line-height:1.8;color:${TEXT};">${esc(s)}</td>
    </tr></table>`).join('\n    ')}
  </td></tr>
  <tr><td style="padding:14px 32px 4px;">
    <p style="margin:0;font-size:13px;color:${MUTED};">${esc(c.ref)}: <b dir="ltr" style="color:${TEXT};font-family:Consolas, Menlo, monospace;letter-spacing:1px;">#${esc(ref)}</b></p>
  </td></tr>
  <tr><td align="center" style="padding:26px 32px 10px;">
    ${wa ? `<p style="margin:0 0 10px;font-size:13px;color:${MUTED};">${esc(c.urgent)}</p>${button(wa, c.whatsapp, true)}` : ''}${button(`${base}/work.html`, c.work, !wa)}
  </td></tr>
  <tr><td style="padding:22px 32px 34px;">
    <p style="margin:0;font-size:14px;line-height:1.8;">${esc(c.signoff)}<br><b>${esc(c.team)}</b></p>
  </td></tr>
  <tr><td style="background:${INK};padding:22px 32px;text-align:center;">
    <p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${LIME};">${esc(c.tagline)}</p>
    <p style="margin:0 0 10px;font-size:12px;"><a href="${esc(base)}/" style="color:#ffffff;text-decoration:none;" dir="ltr">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a>${settings.email ? ` &nbsp;·&nbsp; <a href="mailto:${esc(settings.email)}" style="color:#ffffff;text-decoration:none;" dir="ltr">${esc(settings.email)}</a>` : ''}</p>
    <p style="margin:0;font-size:11px;line-height:1.7;color:#8a8a86;">${esc(c.why)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    c.hello(first), '', c.intro, '', `${c.promise}.`, c.promiseSub, '', c.nextTitle,
    ...c.steps.map((s, i) => `${i + 1}. ${s}`), '', `${c.ref}: #${ref}`,
    ...(wa ? ['', c.urgent, wa] : []), '', c.signoff, c.team, '', `${c.tagline} — ${siteUrl}`, '', c.why,
  ].join('\n');

  return { subject: c.subject, html, text };
}

module.exports = { autoReply };
