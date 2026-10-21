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

const PAGES = ['index.html', 'about.html', 'services.html', 'work.html', 'project.html', 'contact.html', '404.html'];
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
function createContent({ root, store }) {
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
    html = applyContact(html, store.read('settings.json', {}), lang);
    const site = { texts: edits, partners: store.read('partners.json', []).map((p) => ({ src: p.src, name: p.name })) };
    // < escaped so no text can close the script tag
    const tag = `<script>window.SITE=${JSON.stringify(site).replace(/</g, '\\u003c')};</script>`;
    return html.replace('</head>', `${tag}\n</head>`);
  }

  return { listTexts, has, defaults, renderPage, PAGES };
}

/* ---------- contact details and social links (marked with data-contact / data-social in the pages) ---------- */
const SOCIAL_NAMES = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', facebook: 'Facebook' };
const digits = (s) => String(s).replace(/[^\d+]/g, '');
const shortUrl = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

function applyContact(html, s, lang) {
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
  }
  for (const [key, name] of Object.entries(SOCIAL_NAMES)) {
    if (!s[key]) continue;
    html = html.replace(new RegExp(`<a href="#" data-social="${key}" aria-label="[^"]*">`, 'g'),
      `<a href="${escAttr(s[key])}" data-social="${key}" aria-label="${name}" target="_blank" rel="noopener">`);
  }
  return html;
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
