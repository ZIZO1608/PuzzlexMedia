/* PuzzleX — what the admin panel can edit, and how edits reach the pages.

   Texts: every visible text in the pages (plus input placeholders, page titles and share descriptions) is
   found in document order. The English pages are built from the Arabic ones with the same markup, so the
   n-th text of en/about.html is the translation of the n-th text of about.html. Each text is keyed by its
   original Arabic + English wording (the same Arabic can have different English in different places);
   texts.json holds { key: { ar, en } } for the ones someone changed, and the server
   swaps them in as it sends a page. Texts that the scripts draw (T('عربي', 'English') in the JS files) use the
   same keys: the page carries the edits in window.SITE.texts and T() looks them up.

   Everything inserted is escaped: editors write plain text, never HTML. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createSeo } = require('./seo');

const PAGES = ['index.html', 'about.html', 'services.html', 'work.html', 'feedback.html', 'project.html', 'contact.html', 'privacy.html', '404.html'];
const SCRIPTS = ['main.js', 'sections.js', 'pages.js', 'theme.js', 'cursor.js'];
const META_EDITABLE = /<meta\s[^>]*(?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)"/i;

/* ---------- HTML text helpers ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…', mdash: '—', ndash: '–', rarr: '→', larr: '←', middot: '·' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const SEP = '␟'; // between the Arabic and the English default in a key
const keyOf = (ar, en) => `${ar}${SEP}${en}`;

// split a page into tags, text, and blocks that are never edited (scripts, styles, inline SVG, comments)
const TOKEN = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<[^>]+>|[^<]+/gi;
function tokenize(html) {
  return html.match(TOKEN) || [];
}

// the editable spots of a page, in order: { t: token index, kind, attr?, text, ctx }
// (an element marked data-noedit gets its text from elsewhere — e.g. the work filters use the sector names
//  edited with the projects — so its text isn't offered here)
function editables(tokens) {
  const out = [];
  let ctx = '', skip = false;
  tokens.forEach((tok, t) => {
    if (tok[0] === '<') {
      if (/^<(!|script|style|svg)/i.test(tok)) return;
      const name = (tok.match(/^<\/?([a-z0-9-]+)/i) || [])[1]?.toLowerCase();
      if (tok[1] !== '/' && name) ctx = name;
      skip = tok[1] !== '/' && /\sdata-noedit[\s>=]/.test(tok);
      const ph = tok.match(/\splaceholder="([^"]*)"/);
      if (ph && /\p{L}/u.test(ph[1])) out.push({ t, kind: 'attr', attr: 'placeholder', text: norm(decode(ph[1])), ctx: 'placeholder' });
      if (META_EDITABLE.test(tok)) {
        const c = tok.match(/\scontent="([^"]*)"/);
        const which = tok.match(/(?:name|property)="([^"]+)"/)[1];
        if (c && /\p{L}/u.test(c[1])) out.push({ t, kind: 'attr', attr: 'content', text: norm(decode(c[1])), ctx: which });
      }
      return;
    }
    const text = norm(decode(tok));
    if (/\p{L}/u.test(text) && !skip) out.push({ t, kind: 'text', text, ctx });
  });
  return out;
}

/* ---------- strings the scripts draw: T('…', '…') and T([…], […]) ---------- */
function readLiteral(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"') return null;
  let s = '';
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { s += JSON.parse(`"${src[j + 1] === "'" ? "'" : src.slice(j, j + 2)}"`); j++; continue; }
    if (c === q) return { value: s, end: j + 1 };
    s += c;
  }
  return null;
}
function readArg(src, i) {
  while (/\s/.test(src[i])) i++;
  if (src[i] !== '[') { const lit = readLiteral(src, i); return lit && { values: [lit.value], end: lit.end }; }
  const values = [];
  i++;
  for (;;) {
    while (/[\s,]/.test(src[i])) i++;
    if (src[i] === ']') return { values, end: i + 1 };
    const lit = readLiteral(src, i);
    if (!lit) return null;
    values.push(lit.value);
    i = lit.end;
  }
}
function scriptPairs(src) {
  const pairs = [];
  const re = /\bT\(/g;
  let m;
  while ((m = re.exec(src))) {
    const a = readArg(src, m.index + 2);
    if (!a) continue;
    let i = a.end;
    while (/\s/.test(src[i])) i++;
    if (src[i] !== ',') continue;
    const b = readArg(src, i + 1);
    if (!b || b.values.length !== a.values.length) continue;
    a.values.forEach((ar, k) => pairs.push({ ar: norm(ar), en: norm(b.values[k]) }));
  }
  return pairs;
}

/* ---------- the catalog: every editable text with its defaults and where it appears ---------- */
function createContent({ root, store, siteUrl = 'https://www.puzzlexmedia.com' }) {
  const seo = createSeo({ siteUrl });
  let catalog = null, stamp = '';

  const mtimes = () => [...PAGES.flatMap((p) => [p, `en/${p}`]), ...SCRIPTS]
    .map((f) => { try { return fs.statSync(path.join(root, f)).mtimeMs; } catch { return 0; } }).join(',');

  function build() {
    const entries = new Map(); // key → { key, ar, en, kind, ctx, pages:Set }
    const pages = {};          // page → { ar: [keys by editable index], en: [...] }
    const add = (ar, en, kind, ctx, page) => {
      const key = keyOf(ar, en);
      let e = entries.get(key);
      if (!e) entries.set(key, (e = { key, ar, en, kind, ctx, pages: new Set() }));
      e.pages.add(page);
      return key;
    };
    for (const page of PAGES) {
      const ar = editables(tokenize(fs.readFileSync(path.join(root, page), 'utf8')));
      let en = [];
      try { en = editables(tokenize(fs.readFileSync(path.join(root, 'en', page), 'utf8'))); } catch { /* no English page */ }
      if (en.length && en.length !== ar.length) console.warn(`[content] ${page}: ${ar.length} Arabic texts vs ${en.length} English — pairing by position up to the shorter one`);
      const keys = ar.map((x, i) => {
        const pairedEn = en[i] && en[i].kind === x.kind ? en[i].text : '';
        const kind = x.kind === 'attr' && x.attr === 'content' ? 'seo' : x.ctx === 'title' ? 'seo' : 'text';
        return add(x.text, pairedEn, kind, x.ctx, page);
      });
      pages[page] = { ar: keys, en: en.map((x, i) => (i < keys.length ? keys[i] : keyOf('', x.text))) };
    }
    for (const f of SCRIPTS) {
      let src = '';
      try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
      for (const p of scriptPairs(src)) {
        if (!/\p{L}/u.test(p.ar)) continue;
        const known = entries.get(keyOf(p.ar, p.en));
        add(p.ar, p.en, known?.kind || 'script', known?.ctx || 'script', `script:${f}`);
      }
    }
    return { entries, pages };
  }

  function get() {
    const s = mtimes();
    if (!catalog || s !== stamp) { catalog = build(); stamp = s; }
    return catalog;
  }

  // the list the admin panel shows: grouped, with the current value next to the default
  function listTexts() {
    const { entries } = get();
    const edits = store.read('texts.json', {});
    return [...entries.values()].map((e) => ({
      key: e.key, kind: e.kind, ctx: e.ctx, pages: [...e.pages],
      default: { ar: e.ar, en: e.en }, value: { ar: edits[e.key]?.ar || e.ar, en: edits[e.key]?.en || e.en },
      edited: Boolean(edits[e.key]),
    }));
  }

  const has = (key) => get().entries.has(key);
  const defaults = (key) => { const e = get().entries.get(key); return e && { ar: e.ar, en: e.en }; };

  /* ---------- serving a page: texts, contact details, data for the scripts ---------- */
  function renderPage(page, lang, html) {
    const cat = get().pages[page];
    const edits = store.read('texts.json', {});
    if (cat && Object.keys(edits).length) {
      const tokens = tokenize(html);
      const keys = cat[lang] || [];
      editables(tokens).forEach((x, i) => {
        const o = edits[keys[i]];
        const value = o && o[lang];
        if (!value) return;
        if (x.kind === 'text') {
          const tok = tokens[x.t];
          const lead = tok.match(/^\s*/)[0], trail = tok.match(/\s*$/)[0];
          tokens[x.t] = lead + escText(value) + trail;
        } else {
          tokens[x.t] = tokens[x.t].replace(new RegExp(`(\\s${x.attr}=")[^"]*"`), `$1${escAttr(value)}"`);
        }
      });
      html = tokens.join('');
    }
    const settings = store.read('settings.json', {});
    html = applyContact(html, settings, lang);
    const partners = store.read('partners.json', []);
    // the logo puzzle is hidden from screen readers; they get the partners' names as a plain list instead
    const names = partners.map((p) => String(p.name || '').trim()).filter(Boolean);
    html = html.replace(/\s*<ul class="sr-only" data-partner-names><\/ul>/,
      names.length ? (m) => m.replace('</ul>', names.map((n) => `<li>${escText(n)}</li>`).join('') + '</ul>') : '');
    html = applyFeedback(html, page, store.read('testimonials.json', []), lang);
    const site = { texts: edits, partners: partners.map((p) => ({ src: p.src, name: p.name })) };
    // < escaped so no text can close the script tag
    html = html.replace('</head>', `<script>window.SITE=${JSON.stringify(site).replace(/</g, '\\u003c')};</script>\n</head>`);
    // head tags, schema.org data and server-drawn project cards for search engines and AI crawlers (lib/seo.js)
    return seo.enhancePage(page, lang, html, { settings, projects: store.read('projects.json', { sectors: {}, projects: [] }) });
  }

  return { listTexts, has, defaults, renderPage, PAGES, seo };
}

/* ---------- contact details and social links (marked with data-contact / data-social in the pages) ---------- */
const SOCIAL_NAMES = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', facebook: 'Facebook' };
const digits = (s) => String(s).replace(/[^\d+]/g, '');
const shortUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

// a detail that isn't filled in yet is left out of the page entirely: no "coming soon", no dead links
function applyContact(html, s, lang) {
  for (const key of ['phone', 'email']) {
    if (s[key]) continue;
    html = html
      .replace(new RegExp(`<li><span class="cl-label">[^<]*</span><span class="placeholder" data-contact="${key}">[^<]*</span></li>\\s*`, 'g'), '')
      .replace(new RegExp(`\\s*<span class="placeholder" data-contact="${key}">[^<]*</span>`, 'g'), '')
      .replace(new RegExp(`\\s*<p data-if-contact="${key}">[\\s\\S]*?</p>`, 'g'), '');
  }
  if (!s.whatsapp) {
    html = html
      .replace(/\s*<a class="btn btn-whatsapp"[^>]*>[^<]*<span class="placeholder-tag">[^<]*<\/span><\/a>/g, '')
      .replace(/\s*<button class="btn btn-wa form-submit"[^>]*data-wa=""[^>]*>[\s\S]*?<\/button>/g, '');
  }
  for (const key of Object.keys(SOCIAL_NAMES)) {
    if (!s[key]) html = html.replace(new RegExp(`\\s*<a href="#" data-social="${key}"[^>]*>[^<]*</a>`, 'g'), '');
  }
  html = html
    .replace(/\s*<div class="footer-col" data-follow>\s*<h3>[^<]*<\/h3>\s*<div class="socials">\s*<\/div>\s*<\/div>/g, '')
    .replace(/\s*<div class="socials">\s*<\/div>/g, '');

  if (s.phone) {
    html = html.replace(/<span class="placeholder" data-contact="phone">[^<]*<\/span>/g,
      `<a data-contact="phone" href="tel:${escAttr(digits(s.phone))}" dir="ltr">${escText(s.phone)}</a>`);
  }
  if (s.email) {
    html = html.replace(/<span class="placeholder" data-contact="email">[^<]*<\/span>/g,
      `<a data-contact="email" href="mailto:${escAttr(s.email)}" dir="ltr">${escText(s.email)}</a>`);
  }
  if (s.website) {
    html = html.replace(/<a href="[^"]*" data-contact="website" dir="ltr">[^<]*<\/a>/g,
      `<a href="${escAttr(s.website)}" data-contact="website" dir="ltr">${escText(shortUrl(s.website))}</a>`);
  }
  if (s.whatsapp) {
    html = html.replace(/<a class="btn btn-whatsapp"[^>]*data-contact="whatsapp"[^>]*>([^<]*)<span class="placeholder-tag">[^<]*<\/span><\/a>/g,
      (m, label) => `<a class="btn btn-whatsapp" data-contact="whatsapp" href="https://wa.me/${escAttr(digits(s.whatsapp).replace('+', ''))}" target="_blank" rel="noopener">${label.trim()}</a>`);
    // the form's "send on WhatsApp" button: pages.js opens a chat with this number, the details already typed in
    html = html.replace(/(<button class="btn btn-wa form-submit"[^>]*data-wa=")"/g, `$1${escAttr(digits(s.whatsapp).replace('+', ''))}"`);
  }
  for (const [key, name] of Object.entries(SOCIAL_NAMES)) {
    if (!s[key]) continue;
    html = html.replace(new RegExp(`<a href="#" data-social="${key}" aria-label="[^"]*">`, 'g'),
      `<a href="${escAttr(s[key])}" data-social="${key}" aria-label="${name}" target="_blank" rel="noopener">`);
  }
  return html;
}

/* ---------- client feedback (testimonials.json): the home page's section and the whole feedback page ---------- */
const HOME_FEEDBACK = 6; // cards on the home page: the ones marked for it, in order
const MONTH_YEAR = {
  ar: new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
};
const feedbackDate = (date, lang) => {
  if (!date || date.length === 4) return date || '';
  const [y, m] = date.split('-').map(Number);
  return MONTH_YEAR[lang].format(Date.UTC(y, m - 1, 1));
};
// the noun after a number in Arabic: 1 and 2 have their own forms, 3–10 plural, 11+ singular accusative
const arCount = (n, [one, two, few, many]) => (n === 1 ? one : n === 2 ? two : `${n} ${n <= 10 ? few : many}`);
const counted = (n, lang, ar, en) => (lang === 'en' ? `${n} ${n === 1 ? en[0] : en[1]}` : arCount(n, ar));
const REVIEWS = { ar: ['رأي واحد', 'رأيان', 'آراء', 'رأيًا'], en: ['review', 'reviews'] };
const RATINGS = { ar: ['تقييم واحد', 'تقييمان', 'تقييمات', 'تقييمًا'], en: ['rating', 'ratings'] };
// drawn, not typed: the site's font has no ★, and the fallback differs per phone (sometimes an emoji)
const STAR = (on) => `<svg${on ? ' class="on"' : ''} viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.4l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L10 14.92l-5.3 2.79 1.01-5.9L1.42 7.63l5.93-.86z"/></svg>`;
const rootSrc = (src) => `/${String(src).replace(/^\//, '')}`;

function feedbackCard(t, lang) {
  const pick = (v) => (lang === 'en' ? v.en || v.ar : v.ar || v.en);
  const name = pick(t.name), role = pick(t.role), images = t.images || [];
  const stars = t.rating
    ? `<span class="tm-stars" role="img" aria-label="${lang === 'en' ? `Rated ${t.rating} out of 5` : `التقييم ${t.rating} من 5`}">${[1, 2, 3, 4, 5].map((n) => STAR(n <= t.rating)).join('')}</span>`
    : '';
  const face = t.photo
    ? `<img class="tm-face${/^assets\/partners\//.test(t.photo) ? ' logo' : ''}" src="${escAttr(rootSrc(t.photo))}" alt="" width="52" height="52" loading="lazy">`
    : `<span class="tm-face" aria-hidden="true">${escText([...name][0] || '')}</span>`;
  // links to the full images, so they open without scripts too; pages.js turns them into a lightbox.
  // Four thumbnails at most; the fourth says how many more there are.
  const media = images.length
    ? `<div class="tm-media" data-count="${Math.min(images.length, 4)}">${images.map((src, k) => {
      const more = k === 3 && images.length > 4 ? ` data-more="+${images.length - 4}"` : '';
      const alt = lang === 'en' ? `Image ${k + 1} of ${images.length} shared by ${name}` : `الصورة ${k + 1} من ${images.length} — ${name}`;
      return `<a class="tm-shot" href="${escAttr(rootSrc(src))}" target="_blank" rel="noopener"${more}><img src="${escAttr(rootSrc(src))}" alt="${escAttr(alt)}" loading="lazy"></a>`;
    }).join('')}</div>`
    : '';
  const when = t.date ? `<time datetime="${escAttr(t.date)}">${escText(feedbackDate(t.date, lang))}</time>` : '';
  const meta = [role && `<small dir="auto">${escText(role)}</small>`, when].filter(Boolean).join('<span aria-hidden="true">·</span>');
  // a review reads top to bottom: who (photo or logo, name, stars), then what they said, then what they shared.
  // dir="auto": an Arabic-only quote on the English page (or the other way round) still reads the right way
  return `<figure class="tm-card" data-rating="${t.rating || 0}"${images.length ? ' data-media' : ''}>`
    + `<figcaption class="tm-head">${face}<span class="tm-who"><span class="tm-name"><b dir="auto">${escText(name)}</b>${stars}</span>${meta ? `<span class="tm-meta">${meta}</span>` : ''}</span></figcaption>`
    + `<blockquote class="tm-quote" dir="auto">${escText(pick(t.quote))}</blockquote>${media}</figure>`;
}

// the average and the count of each star, for the feedback page's opening
function feedbackScore(shown, lang) {
  const rated = shown.filter((t) => t.rating);
  const reviews = counted(shown.length, lang, REVIEWS.ar, REVIEWS.en);
  if (!rated.length) {
    return `<aside class="fb-score fb-score--count"><p class="fb-avg"><b data-count-to="${shown.length}">${shown.length}</b></p>`
      + `<p class="fb-total">${lang === 'en' ? `${shown.length === 1 ? 'review' : 'reviews'} from our clients` : `${['', 'رأي', 'رأيان'][shown.length] || (shown.length <= 10 ? 'آراء' : 'رأيًا')} من عملائنا`}</p></aside>`;
  }
  const avg = rated.reduce((s, t) => s + t.rating, 0) / rated.length;
  const shownAvg = (Math.round(avg * 10) / 10).toFixed(1);
  const bars = [5, 4, 3, 2, 1].map((n) => {
    const c = rated.filter((t) => t.rating === n).length;
    return `<li><span>${n}<i aria-hidden="true">★</i></span><span class="fb-bar"><b style="--w:${(c / rated.length).toFixed(3)}"></b></span><span>${c}</span></li>`;
  }).join('');
  const label = lang === 'en' ? `Average rating ${shownAvg} out of 5` : `متوسط التقييم ${shownAvg} من 5`;
  return `<aside class="fb-score" aria-label="${escAttr(label)}">`
    + `<p class="fb-avg"><b data-count-to="${shownAvg}">${shownAvg}</b><span>/5</span></p>`
    + `<p class="fb-stars" aria-hidden="true"><span class="fb-stars-fill" style="--w:${(avg / 5).toFixed(3)}">★★★★★</span>★★★★★</p>`
    + `<p class="fb-total">${lang === 'en' ? `from ${counted(rated.length, lang, RATINGS.ar, RATINGS.en)} · ${reviews}` : `من ${arCount(rated.length, RATINGS.ar)} · ${reviews}`}</p>`
    + `<ul class="fb-bars" aria-hidden="true">${bars}</ul></aside>`;
}

// the feedback page is always in the menu; with nothing shown, the home section and the page's score and filters go
// and the page says there are no reviews yet (it joins the sitemap with the first review, server.js)
function applyFeedback(html, page, list, lang) {
  const shown = list.filter((t) => t.visible !== false);
  if (page === 'index.html') {
    if (!shown.length) return html.replace(/\s*<section class="testimonials"[\s\S]*?<\/section>/, '');
    const marked = shown.filter((t) => t.featured !== false);
    const home = (marked.length ? marked : shown).slice(0, HOME_FEEDBACK);
    return html
      .replace(/<div class="tm-list" data-testimonials><\/div>/, `<div class="tm-list" data-testimonials>${home.map((t) => feedbackCard(t, lang)).join('')}</div>`)
      .replace('<span class="tm-all-count"></span>', `<span class="tm-all-count">${shown.length}</span>`);
  }
  if (page !== 'feedback.html') return html;
  if (!shown.length) {
    return html
      .replace(/\s*<div class="fb-score" data-feedback-score><\/div>/, '')
      .replace(/\s*<div class="work-filters fb-filters"[\s\S]*?<\/div>/, '')
      .replace(/\s*<div class="fb-wall" data-feedback-wall><\/div>/, '');
  }
  const count = {
    all: shown.length, 5: shown.filter((t) => t.rating === 5).length, 4: shown.filter((t) => t.rating === 4).length,
    media: shown.filter((t) => (t.images || []).length).length,
  };
  // a filter that would show nothing (or the same as "all") is left out; with none left, so is the row
  html = html.replace(/(\s*)<button class="chip" type="button" data-filter="(\w+)" aria-pressed="(?:true|false)">([\s\S]*?)<span class="chip-count"><\/span><\/button>/g,
    (m, space, f, label) => (f !== 'all' && (!count[f] || count[f] === count.all) ? '' : m.replace('<span class="chip-count"></span>', `<span class="chip-count">${count[f]}</span>`)));
  if (!/data-filter="(?!all")/.test(html)) html = html.replace(/\s*<div class="work-filters fb-filters"[\s\S]*?<\/div>/, '');
  return html
    .replace(/\s*<p class="fb-empty"[^>]*>[\s\S]*?<\/p>/, '')
    .replace('<div class="fb-score" data-feedback-score></div>', feedbackScore(shown, lang))
    .replace('<div class="fb-wall" data-feedback-wall></div>', `<div class="fb-wall" data-feedback-wall>${shown.map((t) => feedbackCard(t, lang)).join('')}</div>`);
}

/* ---------- projects.js, generated from projects.json (same globals the pages always used) ---------- */
function projectsScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `/* PuzzleX — project data, generated by the server from the admin panel's projects.json */
const __DATA = ${json};
const __EN = document.documentElement.lang === 'en';
const __pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? (__EN ? v.en || v.ar : v.ar || v.en) : v);
const SECTORS = Object.fromEntries(Object.entries(__DATA.sectors).map(([k, v]) => [k, __pick(v)]));
const PROJECTS = __DATA.projects.map((p) => ({
  id: p.id, sector: p.sector, year: p.year, logo: p.logo, colors: p.colors, cover: p.cover, gallery: p.gallery || [],
  client: __pick(p.client), title: __pick(p.title), summary: __pick(p.summary),
  services: (__EN ? (p.services.en.length ? p.services.en : p.services.ar) : p.services.ar),
}));
`;
}

module.exports = { createContent, projectsScript, escText, escAttr, PAGES };
