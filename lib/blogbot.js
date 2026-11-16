'use strict';
/* PuzzleX — the blog's daily writer. Every morning at 8:00 (Damascus / Riyadh time, UTC+3) it looks on the web for
   what's new in the agency's field, picks one topic and writes a full article in Arabic and English through
   OpenRouter (the same key and model as Shater, lib/assistant.js). The article waits in the admin panel (Blog) as a
   draft: approve and publish, edit, delete, or write another. Nothing reaches the site before «نشر».

   On publishing, the article gets that day's date and an author: Adnan Masri and Hussein Masri take turns, so two
   articles in a row are never by the same person (the turn follows the last published article with an author).

   Kept in DATA_DIR: blog-drafts.json (the drafts waiting) and blog-bot.json ({ lastDay, lastAttempt, lastError }).
   Turned off by BLOG_BOT=0, and idle while there is no OPENROUTER_API_KEY. */

const { coverFrom, dropCover } = require('./sourceimage');

const DRAFTS = 'blog-drafts.json';
const STATE = 'blog-bot.json';
const HOUR = 8; // the time of day it writes, in UTC+3
const TZ_OFFSET = 3 * 3600e3;
const MAX_DRAFTS = 14;
const RETRY_AFTER = 30 * 60e3; // a failed morning tries again half an hour later
const AUTHORS = [{ ar: 'عدنان مصري', en: 'Adnan Masri' }, { ar: 'حسين مصري', en: 'Hussein Masri' }];

const local = (t = Date.now()) => new Date(t + TZ_OFFSET); // read with getUTC*: the wall clock in Damascus / Riyadh
const localDay = (t) => local(t).toISOString().slice(0, 10);
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 8).join('-').slice(0, 70);
const clip = (s, n) => String(s || '').trim().slice(0, n);
const NO_EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;

class Bad extends Error { constructor(msg, status = 422) { super(msg); this.status = status; this.userFacing = true; } }

function createBlogBot({ store, assistant }) {
  const enabled = () => process.env.BLOG_BOT !== '0' && assistant && assistant.ready();
  let generating = null; // { started, replacing } while an article is being written

  // the articles it must not repeat: the latest published ones and the drafts waiting
  const recentTitles = () => [
    ...store.read('articles.json', []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map((a) => a.title && (a.title.ar || a.title.en)),
    ...store.read(DRAFTS, []).map((d) => d.title.ar),
  ].filter(Boolean);

  // the brief: the field, the readers, the format; the answer comes back in marked sections (sturdier than JSON
  // for long Arabic text), read by parse() below
  const brief = (day) => [
    'You are the content writer of the blog of PuzzleX Media (بزل إكس ميديا), a marketing and creative agency for businesses in the Gulf, Saudi Arabia and the Arab world: branding and visual identity, social media, video and motion, marketing and ads, copywriting, LinkedIn for people and companies, websites and software.',
    `Today is ${day}.`,
    'STEP 1. Use the web search results to find what is new or trending THIS WEEK in this field: digital marketing, social media platforms and their changes, branding and design trends, video and content, LinkedIn, AI in marketing, e-commerce and advertising, especially anything relevant to the Gulf and Arab markets. Pick ONE topic that business owners would want to read about now.',
    'Do not pick a topic close to any of these recent articles:',
    ...recentTitles().map((t) => `- ${t}`),
    'STEP 2. Write one original, genuinely useful article about it, for business owners and marketing managers (not for marketers\' jargon).',
    '- Length: 700 to 1000 words in each language.',
    '- Structure: a short hook introduction, 3 to 5 sections with ## headings (### for sub-points if needed), practical steps or tips as "- " or "1. " lists, and a short conclusion.',
    '- End with one soft line inviting the reader to work with PuzzleX Media, linking https://www.puzzlexmedia.com/services.html or https://www.puzzlexmedia.com/contact.html.',
    '- Facts: only what the search results support. When you use a fact or a number from the news, name the source and link it like [source name](https://…). Never invent statistics, quotes or results.',
    '- Arabic version: fluent, modern, professional Modern Standard Arabic, written natively (not a translation). English version: the same article written naturally for English readers, not a literal translation.',
    '- Formatting: only paragraphs separated by a blank line, ## and ### headings, "- " and "1. " lists, **bold**, and [text](https://…) links. No # title inside the body, no tables, no images, no HTML. NEVER use emoji.',
    '- The excerpt: one or two sentences (under 230 characters) that make people want to read it; it is also the page\'s search description.',
    'Reply in EXACTLY this format, with nothing before or after:',
    '===TOPIC===', '(the topic in a few Arabic words)',
    '===SLUG===', '(an English link name: 3 to 7 lowercase words joined by hyphens)',
    '===TITLE_AR===', '(the Arabic title, under 90 characters)',
    '===EXCERPT_AR===', '===BODY_AR===',
    '===TITLE_EN===', '===EXCERPT_EN===', '===BODY_EN===',
    '===SOURCES===', '(the main source links you used, one per line)',
    '===END===',
  ].join('\n');

  function parse(raw) {
    const part = (key) => {
      const m = new RegExp(`===${key}===\\s*([\\s\\S]*?)\\s*(?====[A-Z_]+===|$)`).exec(raw);
      return m ? m[1].replace(NO_EMOJI, '').trim() : '';
    };
    const d = {
      topic: clip(part('TOPIC'), 120), slug: slugify(part('SLUG')),
      title: { ar: clip(part('TITLE_AR'), 160), en: clip(part('TITLE_EN'), 160) },
      excerpt: { ar: clip(part('EXCERPT_AR'), 320), en: clip(part('EXCERPT_EN'), 320) },
      body: { ar: clip(part('BODY_AR'), 40000), en: clip(part('BODY_EN'), 40000) },
      sources: part('SOURCES').split('\n').map((s) => (s.match(/https?:\/\/\S+/) || [''])[0].replace(/[)\].,]+$/, '')).filter(Boolean).slice(0, 8),
    };
    if (!d.title.ar || d.body.ar.length < 400 || !d.title.en || d.body.en.length < 400) throw new Error('the article came back incomplete');
    return d;
  }

  // ask for the article, and read it. Writing needs no long thinking, so the first try asks a "thinking" model not
  // to think at all (its thinking would count against the allowance and could leave no room for the article); a
  // model that insists, or an article that comes back short, gets a second try with a capped thinking budget.
  // OPENROUTER_BLOG_MODEL may name another model just for the blog.
  async function write(day) {
    const messages = [
      { role: 'system', content: brief(day) },
      { role: 'user', content: `What is new this week (${day}) in digital marketing, social media, branding, design and video for businesses in the Gulf and the Arab world? Pick today's topic and write the article.` },
    ];
    const tries = [
      { reasoning: { enabled: false }, maxTokens: 16000 },
      { reasoning: { max_tokens: 2500, exclude: true }, maxTokens: 24000 },
    ];
    let last = null;
    for (const t of tries) {
      try {
        const raw = await assistant.ask(messages, {
          ...t, temperature: 0.7, plugins: [{ id: 'web', max_results: 6 }], timeoutMs: 240000, maxChars: 120000,
          model: (process.env.OPENROUTER_BLOG_MODEL || '').trim(),
        });
        return parse(raw);
      } catch (err) {
        last = err;
        // a wrong key, no credit, an unknown model: a second try won't help
        if ([401, 402, 403, 404].includes(err.status)) break;
        console.warn('[blog-bot] try failed, trying again with other settings:', err.message);
      }
    }
    throw last;
  }

  // write one article and keep it as a draft (in place of `replacing`, when it's a "write another")
  async function generate({ replacing = null, by = 'schedule' } = {}) {
    if (generating) throw new Bad('يتم الآن كتابة تدوينة، انتظر حتى تنتهي', 409);
    if (!assistant || !assistant.ready()) throw new Bad('الذكاء الاصطناعي غير مفعّل: أضف OPENROUTER_API_KEY في متغيرات البيئة على الاستضافة', 503);
    generating = { started: new Date().toISOString(), replacing };
    const day = localDay();
    try {
      const d = await write(day);
      // the cover: the share image of the first source that has one (lib/sourceimage.js); none is fine
      const cover = await coverFrom(d.sources, store.uploadsDir).catch((err) => { console.warn('[blog-bot] cover:', err.message); return null; });
      const draft = { id: require('node:crypto').randomBytes(6).toString('hex'), created: new Date().toISOString(), by, ...d, cover: cover ? cover.src : '', coverCredit: cover ? cover.credit : null };
      let replaced = null;
      await store.update(DRAFTS, [], (list) => {
        if (replacing) { replaced = list.find((x) => x.id === replacing) || null; list = list.filter((x) => x.id !== replacing); }
        return [draft, ...list].slice(0, MAX_DRAFTS);
      });
      if (replaced && replaced.cover) await dropCover(replaced.cover, store.uploadsDir); // the replaced draft's image goes with it
      await store.update(STATE, {}, (s) => ({ ...s, lastError: '' }));
      console.log(`[blog-bot] wrote a draft (${by}): ${d.title.ar}`);
      return draft;
    } catch (err) {
      const msg = err.userFacing ? err.message : `تعذّرت كتابة التدوينة: ${String(err.message).slice(0, 200)}`;
      await store.update(STATE, {}, (s) => ({ ...s, lastError: msg, lastErrorAt: new Date().toISOString() }));
      console.warn('[blog-bot]', err.message);
      throw err.userFacing ? err : new Bad('تعذّرت كتابة التدوينة الآن. حاول مرة أخرى بعد قليل.', 502);
    } finally {
      generating = null;
    }
  }

  // every minute: once it's past 8:00 in Damascus / Riyadh and today's article hasn't been written, write it
  async function tick() {
    if (!enabled() || generating) return;
    const now = Date.now(), day = localDay(now);
    if (local(now).getUTCHours() < HOUR) return;
    const s = store.read(STATE, {});
    if (s.lastDay === day) return;
    if (s.lastAttempt && now - Date.parse(s.lastAttempt) < RETRY_AFTER) return;
    await store.update(STATE, {}, (x) => ({ ...x, lastAttempt: new Date(now).toISOString() }));
    try {
      await generate({ by: 'schedule' });
      await store.update(STATE, {}, (x) => ({ ...x, lastDay: day }));
    } catch { /* noted in the state; tried again half an hour later */ }
  }
  function start() {
    setInterval(() => { tick().catch((err) => console.warn('[blog-bot] tick:', err.message)); }, 60e3).unref();
    setTimeout(() => { tick().catch(() => {}); }, 15e3).unref(); // a server started after 8:00 catches up
  }

  // publish a draft: today's date (UTC+3), the next author in turn, a free link name
  async function publish(id) {
    const draft = store.read(DRAFTS, []).find((d) => d.id === id);
    if (!draft) throw new Bad('التدوينة غير موجودة', 404);
    if (!draft.title.ar.trim() || !draft.body.ar.trim()) throw new Bad('اكتب العنوان والنص العربي قبل النشر');
    let article = null;
    await store.update('articles.json', [], (list) => {
      const last = list.filter((a) => a.author && (a.author.ar || a.author.en) && a.published !== false)
        .sort((a, b) => String(b.published_at || b.date).localeCompare(String(a.published_at || a.date)))[0];
      const lastIndex = last ? AUTHORS.findIndex((x) => x.ar === last.author.ar || x.en === last.author.en) : -1;
      const author = AUTHORS[(lastIndex + 1) % AUTHORS.length];
      let base = draft.slug || `article-${localDay()}`, slug = base, n = 2;
      while (list.some((a) => a.id === slug)) slug = `${base}-${n++}`;
      article = {
        id: slug, date: localDay(), published: true, published_at: new Date().toISOString(), cover: draft.cover || '',
        ...(draft.cover && draft.coverCredit && { coverCredit: draft.coverCredit }),
        title: draft.title, excerpt: draft.excerpt, body: draft.body, author,
      };
      return [article, ...list];
    });
    await store.update(DRAFTS, [], (list) => list.filter((d) => d.id !== id));
    console.log(`[blog-bot] published ${article.id} by ${article.author.en}`);
    return article;
  }

  // the admin panel (lib/admin.js passes /blog-drafts… here)
  async function admin(req, res, route, { readJson, json, who }) {
    if (!route.startsWith('/blog-drafts')) return false;
    const method = req.method;
    if (route === '/blog-drafts' && method === 'GET') {
      const s = store.read(STATE, {});
      return json(res, 200, {
        ok: true, drafts: store.read(DRAFTS, []), generating, ready: Boolean(assistant && assistant.ready()),
        enabled: process.env.BLOG_BOT !== '0', lastError: s.lastError || '', lastErrorAt: s.lastErrorAt || '', hour: HOUR,
        authors: AUTHORS,
      });
    }
    // write one now (or another in place of a draft): it takes a minute or two, so it runs on; the panel polls
    if (route === '/blog-drafts/generate' && method === 'POST') {
      const b = await readJson(req, 1024);
      if (generating) throw new Bad('يتم الآن كتابة تدوينة، انتظر حتى تنتهي', 409);
      if (!assistant || !assistant.ready()) throw new Bad('الذكاء الاصطناعي غير مفعّل: أضف OPENROUTER_API_KEY في متغيرات البيئة على الاستضافة', 503);
      const replacing = /^[a-f0-9]{12}$/.test(b.replacing || '') ? b.replacing : null;
      generate({ replacing, by: who }).catch(() => { /* kept as lastError */ });
      return json(res, 202, { ok: true, generating: true });
    }
    const m = route.match(/^\/blog-drafts\/([a-f0-9]{12})(\/publish)?$/);
    if (!m) return false;
    if (m[2] && method === 'POST') {
      const article = await publish(m[1]);
      console.log(`[admin] ${who} published the AI article ${article.id}`);
      return json(res, 200, { ok: true, article: { id: article.id, author: article.author, date: article.date } });
    }
    if (!m[2] && method === 'PATCH') {
      const b = await readJson(req, 200 * 1024);
      const pair = (v, n) => ({ ar: clip(v && v.ar, n), en: clip(v && v.en, n) });
      let found = false;
      await store.update(DRAFTS, [], (list) => list.map((d) => {
        if (d.id !== m[1]) return d;
        found = true;
        // "remove the image": the draft goes out with the blog's drawn cover
        if (b.cover === '' && d.cover) { dropCover(d.cover, store.uploadsDir); return { ...d, cover: '', coverCredit: null, edited: new Date().toISOString() }; }
        return { ...d, title: pair(b.title, 160), excerpt: pair(b.excerpt, 320), body: pair(b.body, 40000), edited: new Date().toISOString() };
      }));
      if (!found) throw new Bad('التدوينة غير موجودة', 404);
      return json(res, 200, { ok: true });
    }
    if (!m[2] && method === 'DELETE') {
      let gone = null;
      await store.update(DRAFTS, [], (list) => { gone = list.find((d) => d.id === m[1]) || null; return list.filter((d) => d.id !== m[1]); });
      if (gone && gone.cover) await dropCover(gone.cover, store.uploadsDir);
      console.log(`[admin] ${who} deleted the AI draft ${m[1]}`);
      return json(res, 200, { ok: true });
    }
    return false;
  }

  return { start, admin, generate, publish, tick, pending: () => store.read(DRAFTS, []).length };
}

module.exports = { createBlogBot, AUTHORS };
