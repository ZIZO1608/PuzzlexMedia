/* PuzzleX — what search engines and AI assistants read.
   Most crawlers (and nearly every AI crawler) don't run JavaScript, so everything that matters is put into the
   HTML on the server: the projects on the work page, each project's own page, schema.org data on every page,
   and /llms.txt, a plain-text summary of the company for AI tools. All of it comes from the live content
   (texts, projects, services, contact details as edited in the admin panel), never from made-up figures. */
'use strict';

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

const T = (lang, ar, en) => (lang === 'en' ? en : ar);
const pick = (v, lang) => (v && typeof v === 'object' ? (lang === 'en' ? v.en || v.ar : v.ar || v.en) : v || '');
const ld = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const PAGE_NAMES = {
  'index.html': ['الرئيسية', 'Home'], 'about.html': ['من نحن', 'About'], 'services.html': ['خدماتنا', 'Services'],
  'work.html': ['أعمالنا', 'Our work'], 'contact.html': ['تواصل معنا', 'Contact'], 'privacy.html': ['سياسة الخصوصية', 'Privacy policy'],
};
const PAGE_TYPES = { 'about.html': 'AboutPage', 'work.html': 'CollectionPage', 'contact.html': 'ContactPage' };

const DESCRIPTION = {
  ar: 'وكالة تسويق وإبداع في الخليج وسوريا: هوية بصرية، تصميم سوشال ميديا وإعلانات، مونتاج وفيديو، محتوى تسويقي وخدمات لينكدإن للأفراد والشركات.',
  en: 'A marketing and creative agency in the Gulf and Syria: visual identity, social media and ad design, video editing, marketing copy and LinkedIn services for people and companies.',
};
const SLOGAN = { ar: 'نحن القطعة الناقصة في أحجيتك', en: 'We are the missing piece in your puzzle' };
const SOCIALS = ['linkedin', 'instagram', 'x', 'facebook'];

function createSeo({ siteUrl }) {
  const pageUrl = (page, lang, query = '') => `${siteUrl}/${lang === 'en' ? 'en/' : ''}${page === 'index.html' ? '' : page}${query}`;
  const projectUrl = (p, lang) => pageUrl('project.html', lang, `?id=${encodeURIComponent(p.id)}`);
  // asset paths in the data are relative to the site root; English pages sit one folder down
  const assetSrc = (src, lang) => (/^(\/|https?:)/.test(src) ? src : (lang === 'en' ? '../' : '') + src);
  const absolute = (src) => (/^https?:/.test(src) ? src : `${siteUrl}/${String(src).replace(/^\//, '')}`);

  /* ---------- schema.org ---------- */
  function organization(s, lang, extra = {}) {
    const org = {
      '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'PuzzleX Media', alternateName: 'PuzzleX',
      url: `${siteUrl}/`, logo: { '@type': 'ImageObject', url: `${siteUrl}/assets/apple-touch-icon.png` },
      image: `${siteUrl}/assets/og.png`, description: DESCRIPTION[lang], slogan: SLOGAN[lang],
      areaServed: [{ '@type': 'Place', name: T(lang, 'دول الخليج العربي', 'Gulf countries') }, { '@type': 'Country', name: T(lang, 'سوريا', 'Syria') }],
      knowsLanguage: ['ar', 'en'],
      ...extra,
    };
    if (s.email) org.email = s.email;
    if (s.phone) org.telephone = s.phone;
    if (s.email || s.phone || s.whatsapp) {
      org.contactPoint = [{ '@type': 'ContactPoint', contactType: 'customer service', availableLanguage: ['Arabic', 'English'],
        ...(s.email && { email: s.email }), ...((s.phone || s.whatsapp) && { telephone: s.phone || s.whatsapp }), url: pageUrl('contact.html', lang) }];
    }
    const sameAs = SOCIALS.map((k) => s[k]).filter((u) => /^https?:\/\//.test(u || ''));
    if (sameAs.length) org.sameAs = sameAs;
    return org;
  }

  const website = (lang) => ({
    '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: `${siteUrl}/`, name: 'PuzzleX Media',
    inLanguage: lang, publisher: { '@id': `${siteUrl}/#organization` },
  });

  const breadcrumbs = (lang, trail) => ({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  });

  function webPage(page, lang, html, extra = {}) {
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'PuzzleX Media';
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const url = pageUrl(page, lang);
    const trail = [[PAGE_NAMES['index.html'][lang === 'en' ? 1 : 0], pageUrl('index.html', lang)]];
    if (page !== 'index.html') trail.push([PAGE_NAMES[page][lang === 'en' ? 1 : 0], url]);
    return {
      '@type': PAGE_TYPES[page] || 'WebPage', '@id': `${url}#webpage`, url, name: unescape(title), description: unescape(desc),
      inLanguage: lang, isPartOf: { '@id': `${siteUrl}/#website` }, about: { '@id': `${siteUrl}/#organization` },
      breadcrumb: breadcrumbs(lang, trail), ...extra,
    };
  }

  /* ---------- the services, read from the services page itself (so the admin panel's edits are included) ---------- */
  function servicesFrom(html) {
    const out = [];
    let group = '';
    // a card's description is optional
    const re = /<h2 class="section-title"[^>]*>([^<]*)<\/h2>|<span class="svc-title">([^<]*)<\/span>(?:<span class="svc-desc">([^<]*)<\/span>)?/g;
    for (const m of html.matchAll(re)) {
      if (m[1] !== undefined) group = unescape(m[1].trim());
      else out.push({ group, name: unescape(m[2].trim()), description: unescape((m[3] || '').trim()) });
    }
    return out;
  }

  const catalog = (lang, services) => ({
    '@type': 'OfferCatalog', name: T(lang, 'خدمات PuzzleX Media', 'PuzzleX Media services'),
    itemListElement: services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name, ...(s.description && { description: s.description }), category: s.group, provider: { '@id': `${siteUrl}/#organization` } },
    })),
  });

  /* ---------- the work page: the project cards, in the HTML (pages.js redraws them with covers) ---------- */
  function workGrid(lang, data) {
    return data.projects.map((p) => `
        <li class="work-item" data-sector="${escAttr(p.sector)}">
          <a class="work-card" href="project.html?id=${encodeURIComponent(p.id)}">
            <div class="work-cover">${p.cover ? `<img class="cover" src="${escAttr(assetSrc(p.cover, lang))}" alt="${escAttr(`${pick(p.title, lang)} — ${pick(p.client, lang)}`)}" width="400" height="300" loading="lazy" decoding="async">` : ''}</div>
            <div class="work-meta">
              <span class="work-client">${escText(pick(p.client, lang))}</span>
              <h2 class="work-title">${escText(pick(p.title, lang))}</h2>
              <ul class="work-tags">${(lang === 'en' && p.services.en.length ? p.services.en : p.services.ar).map((s) => `<li>${escText(s)}</li>`).join('')}</ul>
            </div>
          </a>
        </li>`).join('') + '\n      ';
  }

  const creativeWork = (p, lang, data) => ({
    '@type': 'CreativeWork', '@id': `${projectUrl(p, lang)}#work`, url: projectUrl(p, lang),
    name: pick(p.title, lang), description: pick(p.summary, lang), inLanguage: lang,
    creator: { '@id': `${siteUrl}/#organization` },
    sourceOrganization: { '@type': 'Organization', name: pick(p.client, lang) },
    genre: pick(data.sectors[p.sector], lang) || undefined,
    keywords: (lang === 'en' && p.services.en.length ? p.services.en : p.services.ar).join(', ') || undefined,
    ...(p.year && { dateCreated: String(p.year) }),
    ...(p.cover && { image: absolute(p.cover) }),
  });

  /* ---------- every page: head tags + schema.org; the work page also gets its grid ---------- */
  function enhancePage(page, lang, html, { settings = {}, projects = { sectors: {}, projects: [] } } = {}) {
    if (!PAGE_NAMES[page] && page !== 'project.html') return html; // 404: nothing to index
    const other = lang === 'en' ? 'ar_AR' : 'en_US';
    let head = `<meta name="robots" content="max-image-preview:large">\n  <meta property="og:locale:alternate" content="${other}">`;
    if (page === 'project.html') {
      // without a known ?id this page is an empty shell; server.js lifts this for a real project
      head = '<meta name="robots" content="noindex">';
    } else {
      head += `\n  <link rel="alternate" hreflang="x-default" href="${escAttr(pageUrl(page, 'ar'))}">`;
      const graph = [organization(settings, lang, page === 'services.html' ? { hasOfferCatalog: catalog(lang, servicesFrom(html)) } : {}), website(lang)];
      if (page === 'work.html') {
        graph.push(webPage(page, lang, html, {
          mainEntity: { '@type': 'ItemList', itemListElement: projects.projects.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: projectUrl(p, lang), name: pick(p.title, lang) })) },
        }));
      } else {
        graph.push(webPage(page, lang, html));
      }
      head += `\n  ${ld({ '@context': 'https://schema.org', '@graph': graph })}`;
    }
    html = html.replace('</head>', `  ${head}\n</head>`);
    if (page === 'work.html') html = html.replace('<ul class="work-grid"></ul>', `<ul class="work-grid">${workGrid(lang, projects)}</ul>`);
    return html;
  }

  /* ---------- one project's page (project.html?id=…): its content in the HTML, its own canonical and schema ---------- */
  function projectPage(html, p, lang, data, settings = {}) {
    const title = pick(p.title, lang), client = pick(p.client, lang), summary = pick(p.summary, lang);
    const services = lang === 'en' && p.services.en.length ? p.services.en : p.services.ar;
    const url = projectUrl(p, lang);
    const trail = [
      [PAGE_NAMES['index.html'][lang === 'en' ? 1 : 0], pageUrl('index.html', lang)],
      [PAGE_NAMES['work.html'][lang === 'en' ? 1 : 0], pageUrl('work.html', lang)],
      [title, url],
    ];
    const graph = [organization(settings, lang), website(lang), {
      '@type': 'WebPage', '@id': `${url}#webpage`, url, name: `${title} — ${client}`, description: summary, inLanguage: lang,
      isPartOf: { '@id': `${siteUrl}/#website` }, mainEntity: { '@id': `${url}#work` }, breadcrumb: breadcrumbs(lang, trail),
    }, creativeWork(p, lang, data)];

    html = html
      .replace(/\s*<meta name="robots" content="noindex">/, '\n  <meta name="robots" content="max-image-preview:large">')
      .replace('</head>', `  <link rel="alternate" hreflang="x-default" href="${escAttr(projectUrl(p, 'ar'))}">\n  ${ld({ '@context': 'https://schema.org', '@graph': graph })}\n</head>`)
      .replace('<div class="project-logo"></div>', `<div class="project-logo"><img src="${escAttr(assetSrc(p.logo, lang))}" alt="${escAttr(client)}" width="96" height="96"></div>`)
      .replace('<p class="kicker project-client"></p>', `<p class="kicker project-client">${escText(client)}</p>`)
      .replace('<h1 class="page-title project-title"></h1>', `<h1 class="page-title project-title">${escText(title)}</h1>`)
      .replace('<p class="lead project-summary"></p>', `<p class="lead project-summary">${escText(summary)}</p>`)
      .replace('<dd class="project-sector"></dd>', `<dd class="project-sector">${escText(pick(data.sectors[p.sector], lang))}</dd>`)
      .replace('<dd class="project-services"></dd>', `<dd class="project-services">${services.map((s) => `<a class="tag" href="services.html">${escText(s)}</a>`).join('')}</dd>`);
    html = p.year
      ? html.replace('<dd class="project-year"></dd>', `<dd class="project-year">${escText(p.year)}</dd>`)
      : html.replace(/<div class="project-year-row">[\s\S]*?<\/div>/, '');
    if (p.gallery && p.gallery.length) {
      html = html.replace(/(<section class="project-gallery"[^>]*>)<\/section>/, (m, open) => `${open}${p.gallery.map((src, k) =>
        `<figure class="gallery-item"><img class="cover" src="${escAttr(assetSrc(src, lang))}" alt="${escAttr(`${title} — ${client} (${k + 1})`)}" loading="lazy" decoding="async"></figure>`).join('')}</section>`);
    }
    return html;
  }

  /* ---------- /llms.txt: the company in plain text, for AI assistants (llmstxt.org) ---------- */
  function llmsTxt({ settings = {}, projects = { sectors: {}, projects: [] }, services = { ar: [], en: [] } }) {
    const lines = [
      '# PuzzleX Media',
      '',
      `> ${DESCRIPTION.en}`,
      '',
      `PuzzleX Media describes itself as "${SLOGAN.en}" (${SLOGAN.ar}) and as "your ready-made creative department": a strategic partner that understands the Gulf market. The website is bilingual: Arabic at ${siteUrl}/ and English at ${siteUrl}/en/.`,
      '',
      '## Key facts',
      '',
      '- Type: marketing, creative and media production agency',
      '- Regions served: the Gulf countries and Syria',
      '- Languages: Arabic and English',
    ];
    const sectors = Object.values(projects.sectors).map((v) => pick(v, 'en')).filter(Boolean);
    if (sectors.length) lines.push(`- Client sectors: ${sectors.join(', ')} (see Work below)`);
    const contact = [
      settings.email && `- Email: ${settings.email}`,
      settings.phone && `- Phone: ${settings.phone}`,
      settings.whatsapp && `- WhatsApp: https://wa.me/${String(settings.whatsapp).replace(/[^\d]/g, '')}`,
      ...SOCIALS.filter((k) => settings[k]).map((k) => `- ${{ linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', facebook: 'Facebook' }[k]}: ${settings[k]}`),
      `- Contact form: ${pageUrl('contact.html', 'en')}`,
    ].filter(Boolean);
    lines.push('', '## Contact', '', ...contact);

    if (services.en.length) {
      lines.push('', '## Services', '');
      let group = '';
      for (const s of services.en) {
        if (s.group !== group) { group = s.group; lines.push('', `### ${group}`, ''); }
        lines.push(`- ${s.name}${s.description ? `: ${s.description}` : ""}`);
      }
      lines.push('', `Full list: ${pageUrl('services.html', 'en')}`);
    }

    if (projects.projects.length) {
      lines.push('', '## Work', '');
      for (const p of projects.projects) {
        const sector = pick(projects.sectors[p.sector], 'en');
        lines.push(`- [${pick(p.title, 'en')} — ${pick(p.client, 'en')}](${projectUrl(p, 'en')})${p.year ? ` (${p.year})` : ''}${sector ? `, ${sector}` : ''}: ${pick(p.summary, 'en')}`);
      }
    }

    lines.push('', '## Pages', '');
    for (const page of ['index.html', 'about.html', 'services.html', 'work.html', 'contact.html', 'privacy.html']) {
      lines.push(`- [${PAGE_NAMES[page][1]}](${pageUrl(page, 'en')}) · [${PAGE_NAMES[page][0]}](${pageUrl(page, 'ar')})`);
    }

    if (services.ar.length) {
      lines.push('', '## بالعربية', '', `> ${DESCRIPTION.ar}`, '');
      let group = '';
      for (const s of services.ar) {
        if (s.group !== group) { group = s.group; lines.push('', `### ${group}`, ''); }
        lines.push(`- ${s.name}${s.description ? `: ${s.description}` : ""}`);
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  return { enhancePage, projectPage, servicesFrom, llmsTxt, pageUrl };
}

// the few entities the pages use, back to plain text
function unescape(s) {
  return String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
}

module.exports = { createSeo };
