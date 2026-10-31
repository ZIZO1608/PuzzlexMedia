/* PuzzleX — the blog (articles.json, edited in the admin panel): the list page, the newest three on the home page,
   and each article's own page (article.html?id=…), all drawn on the server so search engines read them in full.

   An article is { id, date, published, cover, title, excerpt, body: { ar, en } }. It shows in a language once that
   language has a title and a body, so the English blog never fills up with Arabic (and the other way round).
   The body is plain text with a little markdown: blank-line paragraphs, ## / ### headings, "- " and "1. " lists,
   **bold** and [text](https://…) links. Everything is escaped first; only those few tags are ever written. */
'use strict';

// (lib/content.js requires this file, so its own escapers can't be required back here)
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

const HOME_ARTICLES = 3;
const pick = (v, lang) => (v && v[lang]) || '';
const hasLang = (a, lang) => Boolean(pick(a.title, lang).trim() && pick(a.body, lang).trim());
// what a visitor in this language sees: published, translated, newest first
const shownIn = (list, lang) => list.filter((a) => a.published !== false && hasLang(a, lang))
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const assetSrc = (src, lang) => (/^(\/|https?:)/.test(src) ? src : (lang === 'en' ? '../' : '') + src);
const articleHref = (a) => `article.html?id=${encodeURIComponent(a.id)}`;

const MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
function longDate(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const day = Number(m[3]), month = MONTHS[lang][Number(m[2]) - 1];
  return lang === 'en' ? `${month} ${day}, ${m[1]}` : `${day} ${month} ${m[1]}`;
}
// reading time from the word count: ~200 words a minute
function readMinutes(body) {
  const words = String(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
const readLabel = (n, lang) => (lang === 'en' ? `${n} min read`
  : n === 1 ? 'قراءة في دقيقة' : n === 2 ? 'قراءة في دقيقتين' : `قراءة في ${n} ${n <= 10 ? 'دقائق' : 'دقيقة'}`);

/* ---------- the body: escaped text, then a handful of markdown marks ---------- */
function inline(s) {
  return escText(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // links: https only, opened in a new tab without handing over this page
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)"]+)\)/g, (m, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`);
}
function renderBody(md) {
  const out = [];
  let list = null; // { tag, items }
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  for (const raw of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flush(); continue; }
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) { flushPara(); flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^[-•*]\s+(.+)$/.exec(line)) || (m = /^\d+[.)]\s+(.+)$/.exec(line))) {
      flushPara();
      const tag = /^\d/.test(line) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flush();
      if (!list) list = { tag, items: [] };
      list.items.push(m[1]);
      continue;
    }
    flush();
    para.push(line);
  }
  flushPara(); flush();
  return out.join('\n');
}

/* ---------- a card: cover (or a drawn puzzle tile), date, title, excerpt ---------- */
function card(a, lang, heading = 'h3') {
  const title = pick(a.title, lang), mins = readMinutes(pick(a.body, lang));
  const cover = a.cover
    ? `<img src="${escAttr(assetSrc(a.cover, lang))}" alt="" width="640" height="400" loading="lazy" decoding="async">`
    : `<span class="blog-cover-art" aria-hidden="true"><b>${escText([...title][0] || '')}</b></span>`;
  return `<article class="blog-card"><a class="blog-card-link" href="${escAttr(articleHref(a))}">`
    + `<div class="blog-cover">${cover}</div>`
    + `<div class="blog-card-body"><p class="blog-meta"><time datetime="${escAttr(a.date)}">${escText(longDate(a.date, lang))}</time><span aria-hidden="true">·</span><span>${escText(readLabel(mins, lang))}</span></p>`
    + `<${heading} class="blog-title">${escText(title)}</${heading}>`
    + `<p class="blog-excerpt">${escText(pick(a.excerpt, lang))}</p>`
    + `<span class="blog-read">${lang === 'en' ? 'Read the article' : 'اقرأ المقال'} <span aria-hidden="true">${lang === 'en' ? '→' : '←'}</span></span></div>`
    + '</a></article>';
}

// the home page's newest three, and the blog page's full list
function applyArticles(html, page, list, lang) {
  const shown = shownIn(list, lang);
  if (page === 'index.html') {
    if (!shown.length) return html.replace(/\s*<section class="blog-home"[\s\S]*?<\/section>/, '');
    return html.replace('<div class="blog-grid" data-latest-articles></div>',
      `<div class="blog-grid" data-latest-articles>${shown.slice(0, HOME_ARTICLES).map((a) => card(a, lang)).join('')}</div>`);
  }
  if (page !== 'blog.html') return html;
  if (!shown.length) return html;
  return html
    .replace(/\s*<p class="blog-empty"[^>]*>[\s\S]*?<\/p>/, '')
    .replace('<div class="blog-grid blog-grid--all" data-articles></div>',
      `<div class="blog-grid blog-grid--all" data-articles>${shown.map((a, i) => card(a, lang, 'h2').replace('class="blog-card"', i === 0 ? 'class="blog-card is-lead"' : 'class="blog-card"')).join('')}</div>`);
}

/* ---------- one article's page: its content, title, description, canonical and schema ---------- */
function articlePage(html, a, lang, list, { seo, siteUrl, settings }) {
  const title = pick(a.title, lang), excerpt = pick(a.excerpt, lang), body = pick(a.body, lang);
  const url = (l) => seo.pageUrl('article.html', l, `?id=${encodeURIComponent(a.id)}`);
  const other = lang === 'en' ? 'ar' : 'en';
  const fullTitle = `${title} | PuzzleX Media`;
  const image = a.cover ? `${siteUrl}/${String(a.cover).replace(/^\//, '')}` : null;
  const posting = {
    '@type': 'BlogPosting', '@id': `${url(lang)}#article`, url: url(lang), mainEntityOfPage: url(lang),
    headline: title, description: excerpt, inLanguage: lang, datePublished: a.date, dateModified: a.updated || a.date,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    author: { '@id': `${siteUrl}/#organization` }, publisher: { '@id': `${siteUrl}/#organization` },
    ...(image && { image }),
  };
  const trail = [
    [lang === 'en' ? 'Home' : 'الرئيسية', seo.pageUrl('index.html', lang)],
    [lang === 'en' ? 'Blog' : 'المدونة', seo.pageUrl('blog.html', lang)],
    [title, url(lang)],
  ];
  const graph = [seo.organization(settings, lang), seo.website(lang), {
    '@type': 'WebPage', '@id': `${url(lang)}#webpage`, url: url(lang), name: title, description: excerpt, inLanguage: lang,
    isPartOf: { '@id': `${siteUrl}/#website` }, mainEntity: { '@id': `${url(lang)}#article` }, breadcrumb: seo.breadcrumbs(lang, trail),
  }, posting];
  // the other language's version, only when it exists
  const alternates = hasLang(a, other)
    ? `<link rel="alternate" hreflang="${lang}" href="${escAttr(url(lang))}">\n  <link rel="alternate" hreflang="${other}" href="${escAttr(url(other))}">\n  <link rel="alternate" hreflang="x-default" href="${escAttr(url(hasLang(a, 'ar') ? 'ar' : lang))}">`
    : `<link rel="alternate" hreflang="${lang}" href="${escAttr(url(lang))}">`;
  html = html
    .replace(/\s*<link rel="alternate" hreflang="(?:ar|en)" href="[^"]*">/g, '')
    .replace(/\s*<meta name="robots" content="noindex">/, '\n  <meta name="robots" content="max-image-preview:large">')
    .replace('</head>', `  ${alternates}\n  <meta property="article:published_time" content="${escAttr(a.date)}">\n  ${seo.ld({ '@context': 'https://schema.org', '@graph': graph })}\n</head>`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${escAttr(url(lang))}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escText(fullTitle)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${escAttr(excerpt)}"`)
    .replace(/(<meta property="og:type" content=")[^"]*"/, '$1article"')
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${escAttr(fullTitle)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${escAttr(excerpt)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${escAttr(url(lang))}"`);
  if (image) {
    html = html.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${escAttr(image)}"`)
      .replace(/\s*<meta property="og:image:(?:width|height)" content="[^"]*">/g, '');
  }
  // the language switch goes to this article's other version, or to the other blog when there's none
  html = html.replace(/(<a class="lang-switch" href=")[^"]*(")/, (m, a1, a2) => `${a1}${lang === 'en' ? '../' : 'en/'}${hasLang(a, other) ? articleHref(a) : 'blog.html'}${a2}`);
  const more = shownIn(list, lang).filter((x) => x.id !== a.id).slice(0, 3);
  html = html
    .replace(/<p class="article-meta" data-article-meta data-noedit>[^<]*<\/p>/, `<p class="article-meta" data-article-meta><time datetime="${escAttr(a.date)}">${escText(longDate(a.date, lang))}</time><span aria-hidden="true">·</span><span>${escText(readLabel(readMinutes(body), lang))}</span></p>`)
    .replace(/<h1 class="page-title article-title" data-article-title data-noedit>[^<]*<\/h1>/, `<h1 class="page-title article-title" data-article-title>${escText(title)}</h1>`)
    .replace(/<p class="lead article-excerpt" data-article-excerpt data-noedit>[^<]*<\/p>/, `<p class="lead article-excerpt" data-article-excerpt>${escText(excerpt)}</p>`)
    .replace('<div class="article-cover" data-article-cover></div>', a.cover
      ? `<div class="article-cover" data-article-cover><img src="${escAttr(assetSrc(a.cover, lang))}" alt="${escAttr(title)}" width="1200" height="630" decoding="async"></div>` : '')
    .replace(/<div class="article-body prose" data-article-body data-noedit>[\s\S]*?<\/div>/, `<div class="article-body prose" data-article-body>${renderBody(body)}</div>`);
  html = more.length
    ? html.replace('<div class="blog-grid" data-article-more></div>', `<div class="blog-grid" data-article-more>${more.map((x) => card(x, lang)).join('')}</div>`)
    : html.replace(/\s*<section class="article-more"[\s\S]*?<\/section>/, '');
  return html;
}

module.exports = { applyArticles, articlePage, renderBody, shownIn, hasLang, articleHref };
