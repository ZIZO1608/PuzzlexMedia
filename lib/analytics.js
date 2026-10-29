/* PuzzleX — visitor statistics, kept on our own server (no Google Analytics, nothing sent to anyone else).
   track.js sends what happens on a page to /api/track: a page opened, a button or link clicked, how long
   the page stayed open. One file per day in DATA_DIR/analytics/YYYY-MM-DD.jsonl, one event per line.

   Everyone is counted anonymously: the IP is never written down, only a daily visitor code made from
   IP + browser + a random daily key (kept one day, then thrown away), so the same person is one visitor
   today but can't be recognised tomorrow or traced back to an address. The tab also keeps a random
   per-visit id (sessionStorage, gone when it closes), so the panel can show that visit's journey:
   page → page → clicked WhatsApp. Events from before this may also carry a long-lived visitor id, v.
   Bots and the admins' own visits (signed in to the panel) aren't counted. Files older than ANALYTICS_DAYS
   (default 395, about 13 months) are deleted. */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|telegram|curl|wget|python|axios|node-fetch|go-http|java\/|monitor|uptime|scan/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]{8,32}$/;
const CONTACT = new Set(['whatsapp', 'phone', 'email', 'form']);
const KINDS = new Set(['whatsapp', 'phone', 'email', 'social', 'project', 'form', 'cta', 'link', 'out', 'button', 'lang']);
const PAGES = new Set(['/', '/about.html', '/services.html', '/work.html', '/feedback.html', '/project.html', '/contact.html', '/privacy.html', '/404.html']);

// where a visit came from, by the referring site's address (or ?utm_source=)
const SOURCES = [
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)(yahoo|duckduckgo|yandex|baidu|ecosia)\./, 'محركات بحث أخرى'],
  [/(^|\.)(instagram\.com|ig\.me)$|^instagram$|^ig$/, 'Instagram'], [/(^|\.)(facebook\.com|fb\.com|fb\.me)$|^facebook$|^fb$/, 'Facebook'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$|^linkedin$/, 'LinkedIn'], [/(^|\.)(t\.co|twitter\.com|x\.com)$|^(twitter|x)$/, 'X'],
  [/(^|\.)(whatsapp\.com|wa\.me)$|^whatsapp$/, 'WhatsApp'], [/(^|\.)tiktok\.com$|^tiktok$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$|^youtube$/, 'YouTube'], [/(^|\.)snapchat\.com$|^snapchat$/, 'Snapchat'],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/, 'مساعدات الذكاء الاصطناعي'],
];
function sourceOf(host, utm) {
  const key = String(utm || host || '').toLowerCase();
  if (!key) return 'مباشر';
  for (const [re, name] of SOURCES) if (re.test(key)) return name;
  return utm ? String(utm).slice(0, 40) : host;
}

function deviceOf(ua, width) {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  if (width && width < 760) return 'mobile';
  return 'desktop';
}
function browserOf(ua) {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return 'أخرى';
}

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const dayOf = (d = new Date()) => d.toISOString().slice(0, 10); // UTC days

function createAnalytics({ dataDir, keepDays = 395 }) {
  const dir = path.join(dataDir, 'analytics');
  const file = (day) => path.join(dir, `${day}.jsonl`);
  let buffer = []; // events not yet on disk; written every few seconds (and on shutdown)
  let writing = Promise.resolve();

  /* ---------- the daily key behind the anonymous visitor code ---------- */
  let salt = null;
  function saltFor(day) {
    if (salt && salt.day === day) return salt.key;
    const saltFile = path.join(dir, 'salt.json');
    try {
      const s = JSON.parse(fs.readFileSync(saltFile, 'utf8'));
      if (s.day === day && typeof s.key === 'string') { salt = s; return s.key; }
    } catch { /* first one, or yesterday's: make a new key */ }
    salt = { day, key: crypto.randomBytes(24).toString('hex') };
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(saltFile, JSON.stringify(salt)); } catch (err) { console.error('[analytics] salt', err.message); }
    return salt.key;
  }

  /* ---------- writing ---------- */
  function flush() {
    if (!buffer.length) return writing;
    const batch = buffer;
    buffer = [];
    const byDay = new Map();
    for (const e of batch) {
      const d = e.ts.slice(0, 10);
      byDay.set(d, (byDay.get(d) || '') + JSON.stringify(e) + '\n');
    }
    writing = writing.then(async () => {
      await fsp.mkdir(dir, { recursive: true });
      for (const [d, lines] of byDay) await fsp.appendFile(file(d), lines, 'utf8');
    }).catch((err) => console.error('[analytics] could not save', err.message));
    return writing;
  }
  setInterval(flush, 5000).unref();

  async function prune() {
    let names = [];
    try { names = await fsp.readdir(dir); } catch { return; }
    const oldest = dayOf(new Date(Date.now() - keepDays * 86400000));
    for (const n of names) {
      const d = n.replace(/\.jsonl$/, '');
      if (DAY.test(d) && d < oldest) await fsp.unlink(path.join(dir, n)).catch(() => {});
    }
  }
  prune();
  setInterval(prune, 12 * 3600 * 1000).unref();

  // a few events a second per address is far more than a person clicking makes
  const hits = new Map();
  setInterval(() => hits.clear(), 60 * 1000).unref();

  /* ---------- one event from track.js; returns nothing, says nothing (a bad event is simply dropped) ---------- */
  function record(body, { ip, ua, country }) {
    if (!body || typeof body !== 'object' || BOT.test(ua) || !ua) return;
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    if (n > 120) return;
    const t = body.t;
    if (t !== 'view' && t !== 'click' && t !== 'leave') return;
    let p = text(body.p, 80).replace(/^\/en(?=\/|$)/, '') || '/';
    if (p === '/index.html') p = '/';
    if (!PAGES.has(p)) p = '/404.html';
    const now = new Date();
    const day = dayOf(now);
    const e = {
      ts: now.toISOString(), t, p, l: body.l === 'en' ? 'en' : 'ar',
      u: crypto.createHash('sha256').update(`${saltFor(day)}|${ip}|${ua}`).digest('base64url').slice(0, 12),
    };
    const pr = text(body.pr, 60).toLowerCase();
    if (p === '/project.html' && /^[a-z0-9][a-z0-9-]*$/.test(pr)) e.pr = pr;
    if (ID.test(body.s || '')) e.s = body.s; // one visit (tab); older events may also carry a visitor id, v
    if (t === 'view') {
      e.dev = deviceOf(ua, Number(body.w) || 0);
      e.br = browserOf(ua);
      let host = '';
      try { host = new URL(text(body.r, 300)).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* none */ }
      const own = text(body.h, 120).replace(/^www\./, '').toLowerCase();
      if (host && host === own) e.in = 1; // came from another page of this site: not a new entry
      else if (host) e.ref = host.slice(0, 80);
      const utm = text(body.utm, 40);
      if (e.ref || utm) e.src = sourceOf(e.ref, utm);
      if (/^[A-Z]{2}$/.test(country || '')) e.c = country;
    }
    if (t === 'click') {
      if (!KINDS.has(body.k)) return;
      e.k = body.k;
      e.x = text(body.x, 80);
    }
    if (t === 'leave') {
      const d = Math.round(Number(body.d));
      if (!(d > 0)) return;
      e.d = Math.min(d, 1800); // half an hour is "left the tab open", not reading
    }
    buffer.push(e);
  }

  /* ---------- reading: every event in a range of days ---------- */
  async function eventsFor(days) {
    await flush();
    await writing;
    const out = [];
    for (const d of days) {
      let raw = '';
      try { raw = await fsp.readFile(file(d), 'utf8'); } catch { continue; }
      for (const line of raw.split('\n')) {
        if (!line) continue;
        try { out.push(JSON.parse(line)); } catch { /* a half line from a crash */ }
      }
    }
    return out;
  }

  // the totals the panel shows, for the last `n` days (today included)
  async function report(n, projects = []) {
    n = Math.min(Math.max(Math.round(n) || 30, 1), 366);
    const days = Array.from({ length: n }, (_, i) => dayOf(new Date(Date.now() - (n - 1 - i) * 86400000)));
    const events = await eventsFor(days);
    const project = new Map(projects.map((p) => [p.id, p]));

    const perDay = new Map(days.map((d) => [d, { day: d, views: 0, visitors: new Set(), clicks: 0 }]));
    const visitorsByDay = new Set(); // u is per day, so day+u is one visitor-day
    const pages = new Map(), projs = new Map(), clicks = new Map(), kinds = new Map();
    const sources = new Map(), devices = new Map(), browsers = new Map(), langs = new Map(), countries = new Map();
    const sessions = new Map();
    let views = 0, clickCount = 0, timeSum = 0, timeN = 0;
    const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
    const row = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };
    const fresh = Date.now() - 5 * 60 * 1000;
    const live = new Set();

    for (const e of events) {
      const d = e.ts.slice(0, 10);
      const pd = perDay.get(d);
      if (!pd) continue;
      const vd = `${d}|${e.u}`;
      if (Date.parse(e.ts) > fresh) live.add(e.u);
      const pg = row(pages, e.p, () => ({ path: e.p, views: 0, visitors: new Set(), time: 0, timeN: 0 }));
      const pj = e.pr ? row(projs, e.pr, () => ({ id: e.pr, views: 0, visitors: new Set(), cardClicks: 0, contacts: 0, time: 0, timeN: 0 })) : null;
      if (e.t === 'view') {
        views++; pd.views++; pd.visitors.add(e.u); visitorsByDay.add(vd);
        pg.views++; pg.visitors.add(vd);
        if (pj) { pj.views++; pj.visitors.add(vd); }
        bump(devices, e.dev || 'desktop'); bump(browsers, e.br || 'أخرى'); bump(langs, e.l);
        if (e.c) bump(countries, e.c);
      }
      // where visits come from: only pages opened from outside the site count as an entry
      if (e.t === 'view' && !e.in) bump(sources, e.src || 'مباشر');
      if (e.t === 'click') {
        clickCount++; pd.clicks++;
        bump(kinds, e.k);
        const c = row(clicks, `${e.k}|${e.x}`, () => ({ kind: e.k, label: e.x, count: 0, pages: new Map() }));
        c.count++; bump(c.pages, e.p);
        if (e.k === 'project' && project.has(e.x)) row(projs, e.x, () => ({ id: e.x, views: 0, visitors: new Set(), cardClicks: 0, contacts: 0, time: 0, timeN: 0 })).cardClicks++;
        if (pj && CONTACT.has(e.k)) pj.contacts++; // WhatsApp / phone / email pressed while looking at this project
      }
      if (e.t === 'leave') {
        timeSum += e.d; timeN++; pg.time += e.d; pg.timeN++;
        if (pj) { pj.time += e.d; pj.timeN++; }
      }
      if (e.s) {
        const s = row(sessions, e.s, () => ({ id: e.s, visitor: e.v || e.s, start: e.ts, end: e.ts, src: 'مباشر', dev: '', lang: e.l, steps: [] }));
        if (e.t === 'view' && !s.steps.some((x) => x.t === 'view')) { s.src = e.src || 'مباشر'; s.dev = e.dev || ''; }
        s.end = e.ts;
        const step = { t: e.t, at: e.ts, p: e.p };
        if (e.pr) step.pr = e.pr;
        if (e.t === 'click') { step.k = e.k; step.x = e.x; }
        if (e.t === 'leave') {
          // the time belongs on the page it was spent on
          const last = [...s.steps].reverse().find((x) => x.t === 'view' && x.p === e.p);
          if (last) last.d = (last.d || 0) + e.d;
          continue;
        }
        s.steps.push(step);
      }
    }

    const top = (m, limit = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
    const avg = (sum, k) => (k ? Math.round(sum / k) : 0);
    const visitorCountsByVisitor = new Map();
    for (const s of sessions.values()) bump(visitorCountsByVisitor, s.visitor);
    const list = [...sessions.values()].sort((a, b) => b.start.localeCompare(a.start));

    return {
      days: n,
      totals: {
        views, visitors: visitorsByDay.size, clicks: clickCount, avgTime: avg(timeSum, timeN),
        sessions: sessions.size, live: live.size,
        returning: [...visitorCountsByVisitor.values()].filter((c) => c > 1).length,
      },
      daily: [...perDay.values()].map((d) => ({ day: d.day, views: d.views, visitors: d.visitors.size, clicks: d.clicks })),
      pages: [...pages.values()].filter((p) => p.views).sort((a, b) => b.views - a.views)
        .map((p) => ({ path: p.path, views: p.views, visitors: p.visitors.size, avgTime: avg(p.time, p.timeN) })),
      projects: [...projs.values()].map((p) => {
        const info = project.get(p.id);
        return {
          id: p.id, views: p.views, visitors: p.visitors.size, cardClicks: p.cardClicks, contacts: p.contacts, avgTime: avg(p.time, p.timeN),
          client: info ? info.client.ar || info.client.en : '', title: info ? info.title.ar || info.title.en : '', known: Boolean(info),
        };
      }).sort((a, b) => b.views - a.views || b.cardClicks - a.cardClicks),
      clicks: [...clicks.values()].sort((a, b) => b.count - a.count).slice(0, 60)
        .map((c) => ({ kind: c.kind, label: c.label, count: c.count, pages: top(c.pages, 3) })),
      kinds: top(kinds, 20),
      sources: top(sources, 15), devices: top(devices), browsers: top(browsers), langs: top(langs), countries: top(countries, 15),
      sessions: list.slice(0, 100).map((s) => ({
        ...s, returning: (visitorCountsByVisitor.get(s.visitor) || 0) > 1, visitor: undefined,
        // the clock from first to last event misses the reading time on the last page: take whichever is longer
        duration: Math.max(Math.round((Date.parse(s.end) - Date.parse(s.start)) / 1000), s.steps.reduce((a, x) => a + (x.d || 0), 0)),
        steps: s.steps.slice(0, 80),
      })),
    };
  }

  // the home page's tile: today's visitors and views
  async function today() {
    const events = await eventsFor([dayOf()]);
    const views = events.filter((e) => e.t === 'view');
    return { views: views.length, visitors: new Set(views.map((e) => e.u)).size };
  }

  return { record, report, today, flush, isBot: (ua) => BOT.test(ua || '') };
}

module.exports = { createAnalytics };
