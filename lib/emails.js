/* The emails the contact form sends, all in one dark PuzzleX layout (like the website):
     autoReply  → the sender: "your piece arrived", the 48-hour promise and a 3-step puzzle tracker, in the page's language
     teamAlert  → the team: the whole request, with reply / WhatsApp / admin-panel buttons
     reminder   → the team: requests nobody has opened yet, so the 48-hour promise is kept
   The sender's email never repeats what they typed (only their first name and the services they
   picked from our list), so the form can't be used to send someone else a message through us.
   Tables, inline styles and PNG images (assets/email/, drawn from the site's jigsaw shape): that is
   what Gmail, Outlook and Apple Mail render reliably — Gmail shows no SVG. */
'use strict';

const { serviceNames } = require('./services');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const LIME = '#D7FF00', INK = '#0a0a0b', PAGE = '#000000', CARD = '#0f0f10', PANEL = '#18181a', LINE = '#26262a';
const TEXT = '#f4f4f1', MUTED = '#9b9b96', GREEN = '#25D366', RED = '#ff6b6b';
const IMG_V = 1; // bump when the images in assets/email/ change, so mail clients fetch them again
const TZ = 'Asia/Damascus'; // the team's clock: Friday is the day off

const isFriday = (date) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date) === 'Fri';
const fmtDate = (iso, lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-SY-u-nu-latn', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso));
const digits = (s) => String(s || '').replace(/[^\d]/g, '');
const shortUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
const fontFor = (lang) => (lang === 'en' ? 'Arial, Helvetica, sans-serif' : "'Alexandria', Tahoma, Arial, sans-serif");
const DISPLAY = "'Agera Gothic', 'Alexandria', Arial, sans-serif"; // headlines only, like the site

const SOCIALS = [['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['x', 'X']];

/* ---------- the shared frame ---------- */
function layout({ lang, title, preheader, siteUrl, settings = {}, rows, tagline, note }) {
  const en = lang === 'en';
  const dir = en ? 'ltr' : 'rtl', align = en ? 'left' : 'right';
  const font = fontFor(lang);
  const link = (href, text) => `<a href="${esc(href)}" style="color:${TEXT};text-decoration:none;" dir="ltr">${esc(text)}</a>`;
  const footerLinks = [
    link(`${siteUrl}${en ? '/en' : ''}/`, shortUrl(siteUrl)),
    settings.email && link(`mailto:${settings.email}`, settings.email),
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const socials = SOCIALS.filter(([k]) => /^https?:\/\//.test(settings[k] || ''))
    .map(([k, name]) => `<a href="${esc(settings[k])}" style="color:${LIME};text-decoration:none;font-weight:bold;">${name}</a>`).join(' &nbsp;·&nbsp; ');
  return `<!doctype html>
<html lang="${en ? 'en' : 'ar'}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;700;800&display=swap" rel="stylesheet">
<style>@font-face{font-family:'Agera Gothic';font-weight:700;src:url('${esc(siteUrl)}/assets/fonts/AgeraGothic-Bold.woff2') format('woff2');}
@media (max-width:480px){.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:26px!important}.step{display:block!important;width:100%!important;margin-bottom:8px}}</style></head>
<body style="margin:0;padding:0;background:${PAGE};" bgcolor="${PAGE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background:${PAGE};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" bgcolor="${CARD}" style="max-width:600px;background:${CARD};border:1px solid ${LINE};border-radius:24px;overflow:hidden;font-family:${font};color:${TEXT};text-align:${align};">
  <tr><td class="px" style="padding:24px 32px;border-bottom:1px solid ${LINE};">
    <table role="presentation" cellpadding="0" cellspacing="0" dir="ltr"><tr>
      <td style="padding-right:12px;"><img src="${esc(siteUrl)}/assets/apple-touch-icon.png" width="40" height="40" alt="PuzzleX" style="display:block;border:0;border-radius:11px;"></td>
      <td style="font:bold 19px 'Agera Gothic', Arial, Helvetica, sans-serif;color:${TEXT};letter-spacing:1px;">PUZZLEX <span style="color:${LIME};">MEDIA</span></td>
    </tr></table>
  </td></tr>
${rows.join('\n')}
  <tr><td class="px" bgcolor="${INK}" style="background:${INK};padding:24px 32px;text-align:center;border-top:1px solid ${LINE};">
    <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:${LIME};">${esc(tagline)}</p>
    <p style="margin:0 0 ${socials ? 8 : 12}px;font-size:12px;">${footerLinks}</p>
    ${socials ? `<p style="margin:0 0 12px;font-size:12px;">${socials}</p>` : ''}
    <p style="margin:0;font-size:11px;line-height:1.7;color:#6f6f6b;">${esc(note)}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// building blocks for the rows
const row = (html, pad = '8px 32px') => `  <tr><td class="px" style="padding:${pad};">${html}</td></tr>`;
const button = (href, label, style, font) => {
  const look = {
    lime: `background:${LIME};color:${INK};border:2px solid ${LIME};`,
    green: `background:${GREEN};color:${INK};border:2px solid ${GREEN};`,
    outline: `background:transparent;color:${LIME};border:2px solid ${LIME};`,
  }[style];
  return `<a href="${esc(href)}" style="display:inline-block;margin:5px;padding:12px 24px;border-radius:999px;font:bold 14px ${font};text-decoration:none;${look}">${esc(label)}</a>`;
};
const tags = (names, en) => names.map((n) => `<span style="display:inline-block;margin:${en ? '0 6px 6px 0' : '0 0 6px 6px'};padding:6px 13px;border-radius:999px;background:${LIME};color:${INK};font-size:12px;font-weight:bold;">${esc(n)}</span>`).join('');
const kv = (pairs, align) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};">${pairs.map(([k, v]) => `
      <tr><td style="padding:11px 0;border-bottom:1px solid ${LINE};font-size:12px;color:${MUTED};width:110px;vertical-align:top;text-align:${align};">${esc(k)}</td>
      <td style="padding:11px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${TEXT};text-align:${align};">${v}</td></tr>`).join('')}
    </table>`;
const img = (siteUrl, name, size, alt = '') => `<img src="${esc(siteUrl)}/assets/email/${name}.png?v=${IMG_V}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:block;border:0;margin:0 auto;">`;

/* ---------- 1 · the sender's confirmation ---------- */
const REPLY = {
  ar: {
    subject: 'وصلت قطعتك! — PuzzleX Media',
    preheader: 'شكراً لتواصلك معنا. سيتواصل معك فريقنا خلال 48 ساعة.',
    headline: ['وصلت ', 'قطعتك', '!'],
    hello: (name) => `مرحباً ${name} — شكراً لتواصلك مع PuzzleX Media. وصل طلبك، وهو الآن بين يدي فريقنا.`,
    hours: 'ساعة',
    promise: 'سيتواصل معك أحد أعضاء فريقنا خلال 48 ساعة',
    promiseSub: 'عبر البريد الإلكتروني أو الهاتف الذي تركته لنا.',
    friday: 'اليوم الجمعة، يوم عطلتنا الأسبوعية — لذلك تبدأ الـ48 ساعة من صباح السبت.',
    stepsTitle: 'أين وصل طلبك؟',
    steps: [['وصل طلبك', 'الآن'], ['نراجعه', 'خلال 48 ساعة'], ['مقترحك', 'الخطة والتكلفة والمدة']],
    pieces: 'القطع التي اخترتها',
    via: 'أُرسل عبر', ref: 'رقم الطلب',
    channel: { email: 'البريد الإلكتروني', whatsapp: 'واتساب' },
    urgent: 'لأمر عاجل، راسلنا مباشرة على واتساب',
    whatsapp: 'راسلنا على واتساب', work: 'شاهد أعمالنا',
    signoff: 'مع التحية،', team: 'فريق PuzzleX Media',
    tagline: 'كل قطعة لها مكان.',
    why: 'وصلتك هذه الرسالة لأنك أرسلت نموذج التواصل على موقعنا. هذه رسالة تلقائية، ويمكنك الرد عليها مباشرة.',
  },
  en: {
    subject: 'Your piece arrived! — PuzzleX Media',
    preheader: 'Thanks for reaching out. Our team will contact you within 48 hours.',
    headline: ['Your ', 'piece', ' arrived!'],
    hello: (name) => `Hi ${name} — thank you for contacting PuzzleX Media. Your request has arrived safely and is now with our team.`,
    hours: 'hours',
    promise: 'A member of our team will contact you within 48 hours',
    promiseSub: 'By email, or on the phone number you gave us.',
    friday: 'Today is Friday, our weekly day off — so the 48 hours start on Saturday morning.',
    stepsTitle: 'Where your request is',
    steps: [['Received', 'Just now'], ['We review it', 'Within 48 hours'], ['Your proposal', 'Plan, cost & timeline']],
    pieces: 'The pieces you picked',
    via: 'Sent by', ref: 'Request',
    channel: { email: 'Email', whatsapp: 'WhatsApp' },
    urgent: 'If it’s urgent, message us directly on WhatsApp',
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
  const font = fontFor(lang);
  const first = m.name.trim().split(/\s+/)[0];
  const ref = m.id.slice(0, 8).toUpperCase();
  const base = `${siteUrl}${en ? '/en' : ''}`;
  const wa = digits(settings.whatsapp) ? `https://wa.me/${digits(settings.whatsapp)}` : '';
  const names = serviceNames(lang);
  const services = m.services.map((s) => names[s]).filter(Boolean);
  const sub = isFriday(new Date(m.date)) ? c.friday : c.promiseSub;
  const [h1a, h1b, h1c] = c.headline;
  const step = ([label, note], i) => {
    const state = ['step-done', 'step-now', 'step-next'][i];
    return `<td class="step" width="33%" valign="top" style="padding:0 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PANEL}" style="background:${PANEL};border:1px solid ${i === 0 ? LIME : LINE};border-radius:16px;">
          <tr><td align="center" style="padding:16px 8px 14px;text-align:center;">
            ${img(siteUrl, state, 52, label)}
            <p style="margin:8px 0 2px;font-size:14px;font-weight:bold;color:${i === 2 ? MUTED : i === 0 ? LIME : TEXT};">${esc(label)}</p>
            <p style="margin:0;font-size:11px;color:${MUTED};">${esc(note)}</p>
          </td></tr>
        </table>
      </td>`;
  };

  const rows = [
    `  <tr><td class="px" align="center" style="padding:40px 32px 6px;text-align:center;">
    ${img(siteUrl, 'hero', 150, '✓')}
    <h1 class="h1" style="margin:14px 0 12px;font-family:${en ? DISPLAY : font};font-size:32px;line-height:1.3;font-weight:800;color:${TEXT};">${esc(h1a)}<span style="color:${LIME};">${esc(h1b)}</span>${esc(h1c)}</h1>
    <p style="margin:0 auto;max-width:440px;font-size:15px;line-height:1.9;color:${MUTED};">${esc(c.hello(first))}</p>
  </td></tr>`,
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIME}" style="background:${LIME};border-radius:18px;">
      <tr>
        <td width="96" align="center" style="padding:18px 6px 18px ${en ? 20 : 6}px;text-align:center;${en ? '' : 'padding-right:20px;'}">
          <p style="margin:0;font:800 46px/1 'Agera Gothic', Arial, sans-serif;color:${INK};" dir="ltr">48</p>
          <p style="margin:2px 0 0;font-size:12px;font-weight:bold;color:${INK};">${esc(c.hours)}</p>
        </td>
        <td style="padding:18px 22px;text-align:${align};border-${en ? 'left' : 'right'}:2px solid rgba(10,10,11,.15);">
          <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:${INK};line-height:1.5;">${esc(c.promise)}</p>
          <p style="margin:0;font-size:12px;line-height:1.7;color:#3a4200;">${esc(sub)}</p>
        </td>
      </tr>
    </table>`, '26px 32px 10px'),
    row(`<p style="margin:0 0 12px;font-size:13px;font-weight:bold;color:${MUTED};letter-spacing:.5px;">${esc(c.stepsTitle)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px;"><tr>
      ${c.steps.map(step).join('\n      ')}
    </tr></table>`, '22px 32px 8px'),
    row(`<p style="margin:0 0 10px;font-size:13px;font-weight:bold;color:${MUTED};">${esc(c.pieces)}</p>
    <div>${services.length ? tags(services, en) : '—'}</div>
    <p style="margin:8px 0 0;font-size:12px;color:${MUTED};">${esc(c.via)}: ${esc(c.channel[m.channel] || c.channel.email)} &nbsp;·&nbsp; ${esc(fmtDate(m.date, lang))} &nbsp;·&nbsp; ${esc(c.ref)} <b dir="ltr" style="color:${TEXT};font-family:Consolas, Menlo, monospace;letter-spacing:1px;">#${esc(ref)}</b></p>`, '22px 32px 6px'),
    `  <tr><td class="px" align="center" style="padding:24px 32px 6px;text-align:center;">
    ${wa ? `<p style="margin:0 0 8px;font-size:13px;color:${MUTED};">${esc(c.urgent)}</p>` : ''}${wa ? button(wa, c.whatsapp, 'lime', font) : ''}${button(`${base}/work.html`, c.work, wa ? 'outline' : 'lime', font)}
  </td></tr>`,
    row(`<p style="margin:0;font-size:14px;line-height:1.8;color:${MUTED};">${esc(c.signoff)}<br><b style="color:${TEXT};">${esc(c.team)}</b></p>`, '22px 32px 32px'),
  ];
  const html = layout({ lang, title: c.subject, preheader: c.preheader, siteUrl, settings, rows, tagline: c.tagline, note: c.why });
  const text = [
    c.headline.join(''), '', c.hello(first), '', `${c.promise}.`, sub, '',
    `${c.stepsTitle}:`, ...c.steps.map(([l, n], i) => `${i === 0 ? '✓' : `${i + 1}.`} ${l} — ${n}`), '',
    `${c.pieces}: ${services.join(en ? ', ' : '، ') || '—'}`,
    `${c.via}: ${c.channel[m.channel] || c.channel.email} · ${fmtDate(m.date, lang)} · ${c.ref} #${ref}`,
    ...(wa ? ['', `${c.urgent}: ${wa}`] : []), '', c.signoff, c.team, '', `${c.tagline} — ${siteUrl}`, '', c.why,
  ].join('\n');
  return { subject: c.subject, html, text };
}

/* ---------- 2 · the team's alert for a new request (Arabic: the team's language) ---------- */
function teamAlert(m, { settings = {}, siteUrl }) {
  const font = fontFor('ar');
  const names = serviceNames('ar');
  const services = m.services.map((s) => names[s] || s);
  const wa = m.channel === 'whatsapp';
  const phone = digits(m.phone);
  const replySubject = m.lang === 'en' ? 'Re: your request — PuzzleX Media' : 'رداً على طلبك — PuzzleX Media';
  const badge = wa
    ? `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${GREEN};color:${INK};font-size:12px;font-weight:bold;">🟢 أُرسل عبر واتساب — تحقّق من محادثات واتساب</span>`
    : `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${LIME};color:${INK};font-size:12px;font-weight:bold;">📧 أُرسل عبر البريد الإلكتروني</span>`;
  const link = (href, text) => `<a href="${esc(href)}" style="color:${LIME};font-weight:bold;text-decoration:none;" dir="ltr">${esc(text)}</a>`;

  const rows = [
    row(`${badge}
    <p style="margin:18px 0 4px;font-size:26px;font-weight:800;color:${TEXT};">${esc(m.name)}</p>
    ${m.company ? `<p style="margin:0;font-size:14px;color:${MUTED};">${esc(m.company)}</p>` : ''}`, '30px 32px 12px'),
    row(kv([
      ['البريد', link(`mailto:${m.email}`, m.email)],
      ...(m.phone ? [['الهاتف', link(`tel:${phone}`, m.phone)]] : []),
      ['القطع المطلوبة', tags(services)],
      ['لغة الصفحة', m.lang === 'en' ? 'الإنجليزية' : 'العربية'],
      ['التاريخ', esc(fmtDate(m.date, 'ar'))],
    ], 'right'), '10px 32px'),
    row(`<p style="margin:0 0 8px;font-size:13px;color:${MUTED};">الرسالة</p>
    <div dir="auto" style="padding:16px 18px;border-radius:14px;background:${PANEL};border:1px solid ${LINE};font-size:14px;line-height:1.9;color:${TEXT};white-space:pre-wrap;">${esc(m.message)}</div>`, '16px 32px'),
    `  <tr><td class="px" align="center" style="padding:18px 32px 30px;text-align:center;">
    ${button(`mailto:${m.email}?subject=${encodeURIComponent(replySubject)}`, 'رد بالبريد', 'lime', font)}${phone ? button(`https://wa.me/${phone}`, 'راسله على واتساب', 'green', font) : ''}${button(`${siteUrl}/admin/#/messages`, 'افتح لوحة التحكم', 'outline', font)}
    <p style="margin:14px 0 0;font-size:12px;color:${MUTED};">وعدنا العميل بالتواصل خلال 48 ساعة · رقم الطلب <b dir="ltr" style="color:${TEXT};">#${esc(m.id.slice(0, 8).toUpperCase())}</b></p>
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
  const font = fontFor('ar');
  const names = serviceNames('ar');
  const n = list.length;
  const subject = n === 1 ? `⏰ ${list[0].name} ينتظر ردّنا منذ ${hours} ساعة` : `⏰ ${n} طلبات تنتظر ردّنا منذ ${hours} ساعة`;
  const cards = list.map((m) => {
    const waited = Math.floor((now - Date.parse(m.date)) / 3600000);
    const left = Math.max(0, 48 - waited);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PANEL}" style="margin:0 0 12px;background:${PANEL};border:1px solid ${left <= 12 ? RED : LINE};border-radius:16px;">
      <tr><td style="padding:16px 18px;text-align:right;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:${TEXT};">${esc(m.name)}${m.company ? ` <span style="font-weight:normal;color:${MUTED};font-size:13px;">— ${esc(m.company)}</span>` : ''}</p>
        <p style="margin:0 0 10px;font-size:13px;color:${MUTED};">ينتظر منذ ${waited} ساعة · <b style="color:${left <= 12 ? RED : LIME};">بقي ${left} ساعة على وعد الـ48 ساعة</b>${m.channel === 'whatsapp' ? ' · 🟢 واتساب' : ''}</p>
        <div>${tags(m.services.map((s) => names[s] || s))}</div>
        <p style="margin:6px 0 0;font-size:13px;"><a href="mailto:${esc(m.email)}" style="color:${LIME};font-weight:bold;text-decoration:none;" dir="ltr">${esc(m.email)}</a>${m.phone ? ` &nbsp;·&nbsp; <a href="https://wa.me/${digits(m.phone)}" style="color:${LIME};font-weight:bold;text-decoration:none;" dir="ltr">${esc(m.phone)}</a>` : ''}</p>
      </td></tr>
    </table>`;
  }).join('\n    ');
  const rows = [
    row(`<p style="margin:0 0 8px;font-size:24px;font-weight:800;color:${TEXT};">⏰ ${n === 1 ? 'طلب لم يُفتح بعد' : `${n} طلبات لم تُفتح بعد`}</p>
    <p style="margin:0;font-size:14px;line-height:1.9;color:${MUTED};">مرّت ${hours} ساعة ولم يفتحها أحد في لوحة التحكم. وعدنا كل عميل بالتواصل خلال 48 ساعة.</p>`, '32px 32px 16px'),
    row(cards, '6px 32px'),
    `  <tr><td class="px" align="center" style="padding:16px 32px 32px;text-align:center;">${button(`${siteUrl}/admin/#/messages`, 'افتح الرسائل في لوحة التحكم', 'lime', font)}</td></tr>`,
  ];
  const html = layout({ lang: 'ar', title: subject, preheader: 'وعدنا العملاء بالرد خلال 48 ساعة', siteUrl, settings, rows,
    tagline: 'تذكير', note: 'يتوقف التذكير بطلب ما حين يُفتح في لوحة التحكم. لا تُرسل التذكيرات يوم الجمعة.' });
  const text = [subject, '', ...list.map((m) => `• ${m.name} — ${m.email}${m.phone ? ` — ${m.phone}` : ''}`), '', `${siteUrl}/admin/#/messages`].join('\n');
  return { subject, html, text };
}

module.exports = { autoReply, teamAlert, reminder, isFriday };
