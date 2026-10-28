/* The emails the contact form sends, all in one PuzzleX layout:
     autoReply  → the sender: "we got your request, we'll contact you within 48 hours", in the page's language
     teamAlert  → the team: the whole request, with reply / WhatsApp / admin-panel buttons
     reminder   → the team: requests nobody has opened yet, so the 48-hour promise is kept
   The sender's email never repeats what they typed (only their first name and the services they
   picked from our list), so the form can't be used to send someone else a message through us.
   Tables and inline styles: that is what Gmail, Outlook and Apple Mail render reliably. */
'use strict';

const { serviceNames } = require('./services');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const LIME = '#D7FF00', INK = '#0a0a0b', TEXT = '#1a1a1c', MUTED = '#6b6b70', PAPER = '#f4f4f1', LINE = '#e6e6e0', GREEN = '#25D366';
const TZ = 'Asia/Damascus'; // the team's clock: Friday is the day off

const isFriday = (date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date) === 'Fri';
const fmtDate = (iso, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-SY-u-nu-latn', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));
const digits = (s) => String(s || '').replace(/[^\d]/g, '');
const shortUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

const SOCIALS = [['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['x', 'X']];

/* ---------- the shared frame ---------- */
function layout({ lang, title, preheader, siteUrl, settings = {}, rows, tagline, note }) {
  const en = lang === 'en';
  const dir = en ? 'ltr' : 'rtl', align = en ? 'left' : 'right';
  const font = en ? 'Arial, Helvetica, sans-serif' : 'Tahoma, Arial, sans-serif';
  const link = (href, text) => `<a href="${esc(href)}" style="color:#ffffff;text-decoration:none;" dir="ltr">${esc(text)}</a>`;
  const footerLinks = [
    link(`${siteUrl}${en ? '/en' : ''}/`, shortUrl(siteUrl)),
    settings.email && link(`mailto:${settings.email}`, settings.email),
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const socials = SOCIALS.filter(([k]) => /^https?:\/\//.test(settings[k] || ''))
    .map(([k, name]) => `<a href="${esc(settings[k])}" style="color:${LIME};text-decoration:none;font-weight:bold;">${name}</a>`).join(' &nbsp;·&nbsp; ');
  return `<!doctype html>
<html lang="${en ? 'en' : 'ar'}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
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
${rows.join('\n')}
  <tr><td style="background:${INK};padding:22px 32px;text-align:center;">
    <p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:${LIME};">${esc(tagline)}</p>
    <p style="margin:0 0 ${socials ? 8 : 10}px;font-size:12px;">${footerLinks}</p>
    ${socials ? `<p style="margin:0 0 10px;font-size:12px;">${socials}</p>` : ''}
    <p style="margin:0;font-size:11px;line-height:1.7;color:#8a8a86;">${esc(note)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// building blocks for the rows
const row = (html, pad = '8px 32px') => `  <tr><td style="padding:${pad};">${html}</td></tr>`;
const button = (href, label, style, font) => {
  const colors = { lime: `background:${LIME};color:${INK};`, ink: `background:${INK};color:${LIME};`, green: `background:${GREEN};color:${INK};` }[style];
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px;padding:13px 24px;border-radius:999px;font:bold 14px ${font};text-decoration:none;${colors}">${esc(label)}</a>`;
};
const tags = (names, en) => names.map((n) => `<span style="display:inline-block;margin:${en ? "0 6px 6px 0" : "0 0 6px 6px"};padding:5px 12px;border-radius:999px;background:${LIME};color:${INK};font-size:12px;font-weight:bold;">${esc(n)}</span>`).join('');
const kv = (pairs, align) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};">${pairs.map(([k, v]) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:12px;color:${MUTED};width:110px;vertical-align:top;text-align:${align};">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${TEXT};text-align:${align};">${v}</td></tr>`).join('')}
    </table>`;

/* ---------- 1 · the sender's confirmation ---------- */
const REPLY = {
  ar: {
    subject: 'وصلنا طلبك — PuzzleX Media',
    preheader: 'شكرًا لتواصلك معنا. سيتواصل معك فريقنا خلال 48 ساعة.',
    hello: (name) => `مرحبًا ${name}،`,
    intro: 'شكرًا لتواصلك مع PuzzleX Media. وصلنا طلبك بنجاح، وهو الآن بين يدي فريقنا.',
    promise: 'سيتواصل معك أحد أعضاء فريقنا خلال 48 ساعة',
    promiseSub: 'عبر البريد الإلكتروني أو الهاتف الذي تركته لنا.',
    friday: 'اليوم الجمعة، يوم عطلتنا الأسبوعية — لذلك تبدأ الـ48 ساعة من صباح السبت.',
    summary: 'ملخص طلبك', services: 'القطع المطلوبة', via: 'أُرسل عبر', date: 'التاريخ', ref: 'رقم الطلب',
    channel: { email: 'البريد الإلكتروني', whatsapp: 'واتساب' },
    nextTitle: 'ماذا يحدث الآن؟',
    steps: ['نراجع طلبك والقطع التي اخترتها.', 'نتواصل معك لنفهم أهدافك وجمهورك بدقة.', 'نرسل لك مقترحًا واضحًا بالخطة والتكلفة والمدة.'],
    urgent: 'لأمر عاجل، راسلنا مباشرة على واتساب:',
    whatsapp: 'راسلنا على واتساب', work: 'شاهد أعمالنا',
    signoff: 'مع التحية،', team: 'فريق PuzzleX Media',
    tagline: 'كل قطعة لها مكان.',
    why: 'وصلتك هذه الرسالة لأنك أرسلت نموذج التواصل على موقعنا. هذه رسالة تلقائية، ويمكنك الرد عليها مباشرة.',
  },
  en: {
    subject: 'We’ve received your request — PuzzleX Media',
    preheader: 'Thanks for reaching out. Our team will contact you within 48 hours.',
    hello: (name) => `Hi ${name},`,
    intro: 'Thank you for contacting PuzzleX Media. Your request has arrived safely and is now with our team.',
    promise: 'A member of our team will contact you within 48 hours',
    promiseSub: 'By email, or on the phone number you gave us.',
    friday: 'Today is Friday, our weekly day off — so the 48 hours start on Saturday morning.',
    summary: 'Your request', services: 'Pieces needed', via: 'Sent by', date: 'Date', ref: 'Request number',
    channel: { email: 'Email', whatsapp: 'WhatsApp' },
    nextTitle: 'What happens next?',
    steps: ['We review your request and the pieces you picked.', 'We get in touch to understand your goals and audience.', 'We send you a clear proposal: plan, cost and timeline.'],
    urgent: 'If it’s urgent, message us directly on WhatsApp:',
    whatsapp: 'Message us on WhatsApp', work: 'See our work',
    signoff: 'Best regards,', team: 'The PuzzleX Media team',
    tagline: 'Every piece has its place.',
    why: 'You’re receiving this because you sent the contact form on our website. This is an automatic reply; you can answer it directly.',
  },
};

// m: the saved message; settings: the admin panel's contact details; siteUrl: the public address
function autoReply(m, { settings = {}, siteUrl }) {
  const lang = m.lang === 'en' ? 'en' : 'ar', en = lang === 'en';
  const c = REPLY[lang];
  const align = en ? 'left' : 'right';
  const font = en ? 'Arial, Helvetica, sans-serif' : 'Tahoma, Arial, sans-serif';
  const first = m.name.trim().split(/\s+/)[0];
  const ref = m.id.slice(0, 8).toUpperCase();
  const base = `${siteUrl}${en ? '/en' : ''}`;
  const wa = digits(settings.whatsapp) ? `https://wa.me/${digits(settings.whatsapp)}` : '';
  const names = serviceNames(lang);
  const services = m.services.map((s) => names[s]).filter(Boolean);
  const sub = isFriday(new Date(m.date)) ? c.friday : c.promiseSub;

  const rows = [
    row(`<p style="margin:0 0 14px;font-size:20px;font-weight:bold;">${esc(c.hello(first))}</p>
    <p style="margin:0;font-size:15px;line-height:1.9;">${esc(c.intro)}</p>`, '36px 32px 8px'),
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:16px;">
      <tr><td style="padding:22px 24px;text-align:${align};">
        <p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:${LIME};">${esc(c.promise)}</p>
        <p style="margin:0;font-size:13px;line-height:1.8;color:#cfcfca;">${esc(sub)}</p>
      </td></tr>
    </table>`, '22px 32px'),
    row(`<p style="margin:0 0 10px;font-size:16px;font-weight:bold;">${esc(c.summary)}</p>
    ${kv([
      [c.services, services.length ? tags(services, en) : '—'],
      [c.via, esc(c.channel[m.channel] || c.channel.email)],
      [c.date, esc(fmtDate(m.date, lang))],
      [c.ref, `<b dir="ltr" style="font-family:Consolas, Menlo, monospace;letter-spacing:1px;">#${esc(ref)}</b>`],
    ], align)}`, '8px 32px 18px'),
    row(`<p style="margin:0 0 12px;font-size:16px;font-weight:bold;">${esc(c.nextTitle)}</p>
    ${c.steps.map((s, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
      <td valign="top" style="width:30px;"><div style="width:24px;height:24px;border-radius:7px;background:${LIME};color:${INK};font:bold 13px/24px Arial, sans-serif;text-align:center;">${i + 1}</div></td>
      <td style="padding-${en ? 'left' : 'right'}:8px;font-size:14px;line-height:1.8;">${esc(s)}</td>
    </tr></table>`).join('\n    ')}`),
    `  <tr><td align="center" style="padding:22px 32px 10px;">
    ${wa ? `<p style="margin:0 0 10px;font-size:13px;color:${MUTED};">${esc(c.urgent)}</p>${button(wa, c.whatsapp, 'lime', font)}` : ''}${button(`${base}/work.html`, c.work, wa ? 'ink' : 'lime', font)}
  </td></tr>`,
    row(`<p style="margin:0;font-size:14px;line-height:1.8;">${esc(c.signoff)}<br><b>${esc(c.team)}</b></p>`, '22px 32px 34px'),
  ];
  const html = layout({ lang, title: c.subject, preheader: c.preheader, siteUrl, settings, rows, tagline: c.tagline, note: c.why });
  const text = [
    c.hello(first), '', c.intro, '', `${c.promise}.`, sub, '',
    `${c.summary}:`, `- ${c.services}: ${services.join(en ? ', ' : '، ') || '—'}`, `- ${c.via}: ${c.channel[m.channel] || c.channel.email}`,
    `- ${c.date}: ${fmtDate(m.date, lang)}`, `- ${c.ref}: #${ref}`, '',
    c.nextTitle, ...c.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(wa ? ['', c.urgent, wa] : []), '', c.signoff, c.team, '', `${c.tagline} — ${siteUrl}`, '', c.why,
  ].join('\n');
  return { subject: c.subject, html, text };
}

/* ---------- 2 · the team's alert for a new request (Arabic: the team's language) ---------- */
function teamAlert(m, { settings = {}, siteUrl }) {
  const font = 'Tahoma, Arial, sans-serif';
  const names = serviceNames('ar');
  const services = m.services.map((s) => names[s] || s);
  const wa = m.channel === 'whatsapp';
  const phone = digits(m.phone);
  const replySubject = m.lang === 'en' ? 'Re: your request — PuzzleX Media' : 'ردًا على طلبك — PuzzleX Media';
  const badge = wa
    ? `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${GREEN};color:${INK};font-size:12px;font-weight:bold;">🟢 أُرسل عبر واتساب — تحقّق من محادثات واتساب</span>`
    : `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${LIME};color:${INK};font-size:12px;font-weight:bold;">📧 أُرسل عبر البريد الإلكتروني</span>`;
  const link = (href, text) => `<a href="${esc(href)}" style="color:${TEXT};font-weight:bold;" dir="ltr">${esc(text)}</a>`;

  const rows = [
    row(`${badge}
    <p style="margin:16px 0 4px;font-size:22px;font-weight:bold;">${esc(m.name)}</p>
    ${m.company ? `<p style="margin:0;font-size:14px;color:${MUTED};">${esc(m.company)}</p>` : ''}`, '30px 32px 10px'),
    row(kv([
      ['البريد', link(`mailto:${m.email}`, m.email)],
      ...(m.phone ? [['الهاتف', link(`tel:${phone}`, m.phone)]] : []),
      ['القطع المطلوبة', tags(services)],
      ['لغة الصفحة', m.lang === 'en' ? 'الإنجليزية' : 'العربية'],
      ['التاريخ', esc(fmtDate(m.date, 'ar'))],
    ], 'right'), '10px 32px'),
    row(`<p style="margin:0 0 8px;font-size:13px;color:${MUTED};">الرسالة</p>
    <div dir="auto" style="padding:16px 18px;border-radius:14px;background:${PAPER};font-size:14px;line-height:1.9;white-space:pre-wrap;">${esc(m.message)}</div>`, '14px 32px'),
    `  <tr><td align="center" style="padding:18px 32px 30px;">
    ${button(`mailto:${m.email}?subject=${encodeURIComponent(replySubject)}`, 'رد بالبريد', 'lime', font)}${phone ? button(`https://wa.me/${phone}`, 'راسله على واتساب', 'green', font) : ''}${button(`${siteUrl}/admin/#/messages`, 'افتح لوحة التحكم', 'ink', font)}
    <p style="margin:12px 0 0;font-size:12px;color:${MUTED};">وعدنا العميل بالتواصل خلال 48 ساعة · رقم الطلب <b dir="ltr">#${esc(m.id.slice(0, 8).toUpperCase())}</b></p>
  </td></tr>`,
  ];
  const subject = `طلب جديد${wa ? ' (واتساب)' : ''} — ${m.name}${m.company ? ` (${m.company})` : ''}`;
  const html = layout({ lang: 'ar', title: subject, preheader: `${m.name}: ${services.join('، ')}`, siteUrl, settings, rows,
    tagline: 'طلب جديد من الموقع', note: 'رسالة داخلية لفريق PuzzleX — الرد عليها يصل إلى العميل مباشرة.' });
  const text = [
    `الاسم: ${m.name}`, m.company ? `الشركة: ${m.company}` : null, `البريد: ${m.email}`, m.phone ? `الهاتف: ${m.phone}` : null,
    `اللغة: ${m.lang === 'en' ? 'English' : 'العربية'}`,
    `أُرسلت عبر: ${wa ? 'واتساب (فُتحت له محادثة مع رقمنا — تحقّق من واتساب)' : 'البريد الإلكتروني'}`, '',
    'القطع المطلوبة:', ...services.map((s) => `• ${s}`), '', 'الرسالة:', m.message, '', `— ${m.date} · ${m.id}`,
  ].filter((l) => l !== null).join('\n');
  return { subject, html, text };
}

/* ---------- 3 · the team's reminder: requests still unopened after `hours` ---------- */
function reminder(list, { settings = {}, siteUrl, hours, now = Date.now() }) {
  const font = 'Tahoma, Arial, sans-serif';
  const names = serviceNames('ar');
  const n = list.length;
  const subject = n === 1 ? `⏰ ${list[0].name} ينتظر ردّنا منذ ${hours} ساعة` : `⏰ ${n} طلبات تنتظر ردّنا منذ ${hours} ساعة`;
  const cards = list.map((m) => {
    const waited = Math.floor((now - Date.parse(m.date)) / 3600000);
    const left = Math.max(0, 48 - waited);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid ${LINE};border-radius:14px;">
      <tr><td style="padding:16px 18px;text-align:right;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:bold;">${esc(m.name)}${m.company ? ` <span style="font-weight:normal;color:${MUTED};font-size:13px;">— ${esc(m.company)}</span>` : ''}</p>
        <p style="margin:0 0 8px;font-size:13px;color:${MUTED};">ينتظر منذ ${waited} ساعة · <b style="color:${left <= 12 ? '#c62828' : TEXT};">بقي ${left} ساعة على وعد الـ48 ساعة</b>${m.channel === 'whatsapp' ? ' · 🟢 واتساب' : ''}</p>
        <div>${tags(m.services.map((s) => names[s] || s))}</div>
        <p style="margin:6px 0 0;font-size:13px;"><a href="mailto:${esc(m.email)}" style="color:${TEXT};font-weight:bold;" dir="ltr">${esc(m.email)}</a>${m.phone ? ` &nbsp;·&nbsp; <a href="https://wa.me/${digits(m.phone)}" style="color:${TEXT};font-weight:bold;" dir="ltr">${esc(m.phone)}</a>` : ''}</p>
      </td></tr>
    </table>`;
  }).join('\n    ');
  const rows = [
    row(`<p style="margin:0 0 8px;font-size:20px;font-weight:bold;">${n === 1 ? 'طلب لم يُفتح بعد' : `${n} طلبات لم تُفتح بعد`}</p>
    <p style="margin:0;font-size:14px;line-height:1.9;color:${MUTED};">مرّت ${hours} ساعة ولم يفتحها أحد في لوحة التحكم. وعدنا كل عميل بالتواصل خلال 48 ساعة.</p>`, '30px 32px 14px'),
    row(cards, '6px 32px'),
    `  <tr><td align="center" style="padding:14px 32px 30px;">${button(`${siteUrl}/admin/#/messages`, 'افتح الرسائل في لوحة التحكم', 'lime', font)}</td></tr>`,
  ];
  const html = layout({ lang: 'ar', title: subject, preheader: 'وعدنا العملاء بالرد خلال 48 ساعة', siteUrl, settings, rows,
    tagline: 'تذكير', note: 'يتوقف التذكير بطلب ما حين يُفتح في لوحة التحكم. لا تُرسل التذكيرات يوم الجمعة.' });
  const text = [subject, '', ...list.map((m) => `• ${m.name} — ${m.email}${m.phone ? ` — ${m.phone}` : ''}`), '', `${siteUrl}/admin/#/messages`].join('\n');
  return { subject, html, text };
}

module.exports = { autoReply, teamAlert, reminder, isFriday };
