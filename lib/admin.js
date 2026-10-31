/* PuzzleX — the admin panel's API (/api/admin/*). The panel itself is static: admin/index.html.
   Every request except login needs a session; every change also needs the X-PX-Admin header (a page on
   another site can't add it without the browser asking us first) and, when the browser sends one, an Origin
   matching this host. Projects, partners, testimonials and settings carry a revision so one editor can't silently
   overwrite what the other just saved. */
'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { passwordProblem } = require('./auth');
const { createInvoices } = require('./invoices');

const SECTOR_KEYS = ['org', 'academic', 'brand']; // the work page's filter chips are built on these
const LIMITS = { short: 200, long: 4000, list: 60 };
const UPLOAD_MAX = 8 * 1024 * 1024;
const UPLOAD_SRC = /^\/uploads\/[a-f0-9]{24}\.(webp|png|jpg)$/;
const ASSET_SRC = /^assets\/partners\/p\d{2}\.webp$/;
const PHONE = /^\+?[\d\s()-]{6,24}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const HEX = /^#[0-9a-f]{6}$/i;

// passwordProblem()'s reasons, as the panel shows them
const PASSWORD_PROBLEMS = {
  'at least 12 characters': '12 حرفاً على الأقل',
  'at most 200 characters': 'طويلة جداً',
  'must not contain the username': 'يجب ألا تحتوي اسم المستخدم',
  'too common': 'شائعة جداً وسهلة التخمين',
  'too many repeated characters': 'فيها أحرف مكررة كثيراً',
  'under 16 characters it needs 3 of: lowercase, uppercase, digits, symbols': 'إن كانت أقل من 16 حرفاً فيجب أن تجمع 3 من: أحرف صغيرة، أحرف كبيرة، أرقام، رموز',
};

class Bad extends Error { constructor(msg, status = 422) { super(msg); this.status = status; } }

const rev = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('base64url').slice(0, 16);
const str = (v, max, field) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new Bad(`${field}: يجب أن يكون نصاً`);
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (s.length > max) throw new Bad(`${field}: النص طويل جداً (الحد ${max} حرفاً)`);
  return s;
};
const pair = (v, max, field, required) => {
  const out = { ar: str(v && v.ar, max, `${field} (ar)`), en: str(v && v.en, max, `${field} (en)`) };
  if (required && !out.ar) throw new Bad(`${field}: النص العربي مطلوب`);
  return out;
};
const imageSrc = (v, field, allowEmpty = true) => {
  const s = str(v, 120, field);
  if (!s && allowEmpty) return '';
  if (!UPLOAD_SRC.test(s) && !ASSET_SRC.test(s)) throw new Bad(`${field}: الصورة غير صالحة — ارفعها من اللوحة`);
  return s;
};
const url = (v, field) => {
  const s = str(v, 300, field);
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { throw new Bad(`${field}: رابط غير صالح (يبدأ بـ https://)`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Bad(`${field}: يجب أن يبدأ الرابط بـ https://`);
  return u.href;
};

/* ---------- validation of what the panel sends ---------- */
function cleanProjects(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.projects)) throw new Bad('بيانات المشاريع غير صالحة');
  if (body.projects.length > 200) throw new Bad('الحد الأقصى 200 مشروع');
  const sectors = Object.fromEntries(SECTOR_KEYS.map((k) => [k, pair(body.sectors && body.sectors[k], LIMITS.short, `اسم القطاع ${k}`, true)]));
  const ids = new Set();
  const projects = body.projects.map((p, i) => {
    const at = `المشروع ${i + 1}`;
    const id = str(p.id, 60, `${at} — اسم الرابط`).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Bad(`${at}: اسم الرابط بحروف إنجليزية صغيرة وأرقام و- فقط`);
    if (ids.has(id)) throw new Bad(`${at}: اسم الرابط "${id}" مستخدم لمشروع آخر`);
    ids.add(id);
    if (!SECTOR_KEYS.includes(p.sector)) throw new Bad(`${at}: اختر القطاع`);
    const year = str(String(p.year ?? ''), 4, `${at} — السنة`);
    if (year && !/^(19|20)\d{2}$/.test(year)) throw new Bad(`${at}: السنة مثل 2025`);
    const list = (v, lang) => {
      if (!Array.isArray(v)) return [];
      if (v.length > 12) throw new Bad(`${at}: الحد الأقصى 12 خدمة`);
      return v.map((s) => str(s, LIMITS.list, `${at} — خدمة (${lang})`)).filter(Boolean);
    };
    const colors = Array.isArray(p.colors) && p.colors.length === 2 && p.colors.every((c) => HEX.test(c)) ? p.colors.map((c) => c.toLowerCase()) : ['#1f8f63', '#0b3d2d'];
    const gallery = Array.isArray(p.gallery) ? p.gallery.map((g, k) => imageSrc(g, `${at} — صورة المعرض ${k + 1}`, false)) : [];
    if (gallery.length > 24) throw new Bad(`${at}: الحد الأقصى 24 صورة في المعرض`);
    return {
      id, sector: p.sector, year: year ? Number(year) : '',
      client: pair(p.client, LIMITS.short, `${at} — اسم العميل`, true),
      title: pair(p.title, LIMITS.short, `${at} — العنوان`, true),
      summary: pair(p.summary, LIMITS.long, `${at} — الوصف`),
      services: { ar: list(p.services && p.services.ar, 'ar'), en: list(p.services && p.services.en, 'en') },
      logo: imageSrc(p.logo, `${at} — الشعار`, false), colors, cover: imageSrc(p.cover, `${at} — صورة الغلاف`), gallery,
    };
  });
  return { sectors, projects };
}

function cleanPartners(body) {
  if (!Array.isArray(body)) throw new Bad('بيانات الشعارات غير صالحة');
  if (body.length > 120) throw new Bad('الحد الأقصى 120 شعاراً');
  return body.map((p, i) => ({
    id: str(p.id, 40, `الشعار ${i + 1}`) || crypto.randomBytes(4).toString('hex'),
    src: imageSrc(p.src, `الشعار ${i + 1}`, false),
    name: str(p.name, LIMITS.short, `اسم الشعار ${i + 1}`),
  }));
}

// client feedback: either language may be the only one filled in (the other page falls back to it)
const FEEDBACK_DATE = /^(19|20)\d{2}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/; // 2026, 2026-05 or 2026-05-14
function cleanTestimonials(body) {
  if (!Array.isArray(body)) throw new Bad('بيانات آراء العملاء غير صالحة');
  if (body.length > 500) throw new Bad('الحد الأقصى 500 رأي');
  return body.map((t, i) => {
    const at = `الرأي ${i + 1}`;
    const name = pair(t.name, LIMITS.short, `${at} — اسم العميل`);
    const quote = pair(t.quote, 1200, `${at} — نص الرأي`);
    if (!name.ar && !name.en) throw new Bad(`${at}: اكتب اسم العميل`);
    if (!quote.ar && !quote.en) throw new Bad(`${at}: اكتب نص الرأي`);
    const rating = Number(t.rating) || 0;
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Bad(`${at}: التقييم من 1 إلى 5 نجوم`);
    const date = str(t.date, 10, `${at} — التاريخ`);
    if (date && !FEEDBACK_DATE.test(date)) throw new Bad(`${at}: التاريخ مثل 2026-05-14 أو 2026-05 أو 2026`);
    const images = Array.isArray(t.images) ? t.images.map((g, k) => imageSrc(g, `${at} — الصورة المرفقة ${k + 1}`, false)) : [];
    if (images.length > 6) throw new Bad(`${at}: الحد الأقصى 6 صور مرفقة`);
    return {
      id: /^[a-f0-9]{8}$/.test(t.id) ? t.id : crypto.randomBytes(4).toString('hex'),
      name, role: pair(t.role, LIMITS.short, `${at} — المنصب والشركة`), quote,
      photo: imageSrc(t.photo, `${at} — الصورة`), images, rating, date,
      visible: t.visible !== false, featured: t.featured !== false,
    };
  });
}

// the blog: an article needs its link name and, in at least one language, a title and a body
const ARTICLE_DATE = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function cleanArticles(body) {
  if (!Array.isArray(body)) throw new Bad('بيانات المقالات غير صالحة');
  if (body.length > 500) throw new Bad('الحد الأقصى 500 مقال');
  const ids = new Set();
  return body.map((a, i) => {
    const at = `المقال ${i + 1}`;
    const id = str(a.id, 80, `${at} — اسم الرابط`).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Bad(`${at}: اسم الرابط بحروف إنجليزية صغيرة وأرقام و- فقط`);
    if (ids.has(id)) throw new Bad(`${at}: اسم الرابط "${id}" مستخدم لمقال آخر`);
    ids.add(id);
    const title = pair(a.title, 160, `${at} — العنوان`);
    const bodyText = pair(a.body, 40000, `${at} — نص المقال`);
    if (!(title.ar && bodyText.ar) && !(title.en && bodyText.en)) throw new Bad(`${at}: اكتب العنوان والنص بلغة واحدة على الأقل`);
    const date = str(a.date, 10, `${at} — التاريخ`);
    if (!ARTICLE_DATE.test(date)) throw new Bad(`${at}: التاريخ مثل 2026-10-31`);
    const updated = str(a.updated, 10, `${at} — تاريخ التعديل`);
    return {
      id, date, ...(ARTICLE_DATE.test(updated) && { updated }), published: a.published !== false,
      cover: imageSrc(a.cover, `${at} — صورة الغلاف`), title, excerpt: pair(a.excerpt, 320, `${at} — الوصف المختصر`), body: bodyText,
    };
  });
}

function cleanSettings(b) {
  if (!b || typeof b !== 'object') throw new Bad('بيانات التواصل غير صالحة');
  const phone = str(b.phone, 30, 'الهاتف'), whatsapp = str(b.whatsapp, 30, 'واتساب'), email = str(b.email, 254, 'البريد');
  if (phone && !PHONE.test(phone)) throw new Bad('الهاتف: أرقام ومسافات و + ( ) - فقط');
  if (whatsapp && !PHONE.test(whatsapp)) throw new Bad('واتساب: أرقام ومسافات و + ( ) - فقط');
  if (email && !EMAIL.test(email)) throw new Bad('البريد الإلكتروني غير صالح');
  return {
    phone, email, whatsapp, website: url(b.website, 'الموقع'),
    linkedin: url(b.linkedin, 'LinkedIn'), instagram: url(b.instagram, 'Instagram'), x: url(b.x, 'X'), facebook: url(b.facebook, 'Facebook'),
  };
}

// the first bytes tell the real type, whatever the browser claims
function sniffImage(buf) {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

/* ---------- the router ---------- */
function createAdmin({ store, auth, content, clientIp, json, readBody, serviceLabels = {}, mail = { enabled: false }, analytics = null }) {
  let lastTest = 0; // the test-email button: once a minute is plenty
  // invoices, receipts and quotations (lib/invoices.js)
  const invoices = createInvoices({ store, mail, readBody, siteUrl: process.env.SITE_URL || undefined });
  const guardWrite = (req) => {
    if (req.headers['x-px-admin'] !== '1') throw new Bad('طلب غير مسموح', 403);
    const origin = req.headers.origin;
    let host = null;
    try { host = origin && new URL(origin).host; } catch { /* "null" or junk: refused below */ }
    if (origin && host !== req.headers.host) throw new Bad('طلب من موقع آخر غير مسموح', 403);
  };
  const readJson = async (req, limit) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Bad('صيغة غير صالحة', 415);
    const raw = await readBody(req, limit);
    try { return JSON.parse(raw.toString('utf8')); } catch { throw new Bad('صيغة غير صالحة', 400); }
  };
  // revisioned files: the panel sends back the revision it loaded
  const saveRevisioned = (name, fallback, req, body, clean) => store.update(name, fallback, (current) => {
    if (body.rev !== rev(current)) throw new Bad('حفظ مستخدم آخر تغييرات هنا قبلك — أعد تحميل الصفحة لترى تغييراته', 409);
    return clean(body.data);
  });

  async function handle(req, res, p) {
    res.setHeader('Cache-Control', 'no-store');
    const ip = clientIp(req);
    const method = req.method;
    const route = p.replace(/^\/api\/admin/, '') || '/';

    if (route === '/login' && method === 'POST') {
      guardWrite(req);
      const b = await readJson(req, 4096);
      const r = await auth.login(b.username, b.password, ip);
      if (r.error === 'locked') return json(res, 429, { ok: false, error: 'محاولات كثيرة — انتظر 15 دقيقة' });
      if (r.error) return json(res, 401, { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      res.setHeader('Set-Cookie', auth.cookie(r.token, 12 * 3600));
      console.log(`[admin] ${r.user.username} signed in from ${ip}`);
      return json(res, 200, { ok: true, user: r.user });
    }

    const session = auth.sessionFrom(req);
    if (!session) return json(res, 401, { ok: false, error: 'سجّل الدخول أولاً' });
    if (method !== 'GET') guardWrite(req);
    const who = session.user.username;

    if (route === '/logout' && method === 'POST') {
      auth.logout(session.token);
      res.setHeader('Set-Cookie', auth.cookie('', 0));
      return json(res, 200, { ok: true });
    }
    if (route === '/me' && method === 'GET') {
      const messages = await store.readMessages();
      return json(res, 200, {
        ok: true, user: session.user,
        stats: {
          unread: messages.filter((m) => !m.read).length, messages: messages.length,
          projects: store.read('projects.json', { projects: [] }).projects.length,
          partners: store.read('partners.json', []).length,
          testimonials: store.read('testimonials.json', []).filter((t) => t.visible !== false).length,
          articles: store.read('articles.json', []).filter((a) => a.published !== false).length,
          editedTexts: Object.keys(store.read('texts.json', {})).length,
          today: analytics ? await analytics.today() : null,
        },
      });
    }
    if (route === '/password' && method === 'POST') {
      const b = await readJson(req, 4096);
      const user = auth.findUser(who);
      if (!(await auth.verifyPassword(String(b.current || ''), user))) throw new Bad('كلمة المرور الحالية غير صحيحة', 403);
      const next = String(b.next || '');
      const problem = passwordProblem(next, who);
      if (problem) throw new Bad(`كلمة المرور الجديدة ضعيفة: ${PASSWORD_PROBLEMS[problem] || problem}`);
      await auth.setPassword(who, next);
      const r = await auth.login(who, next, ip); // the change signed every session out; start a fresh one here
      res.setHeader('Set-Cookie', auth.cookie(r.token, 12 * 3600));
      console.log(`[admin] ${who} changed their password`);
      return json(res, 200, { ok: true });
    }

    /* texts */
    if (route === '/texts' && method === 'GET') return json(res, 200, { ok: true, texts: content.listTexts() });
    if (route === '/texts' && method === 'PATCH') {
      const b = await readJson(req, 512 * 1024);
      if (!Array.isArray(b.changes) || b.changes.length > 500) throw new Bad('بيانات غير صالحة');
      const changes = b.changes.map((c, i) => {
        if (!content.has(c.key)) throw new Bad(`النص ${i + 1} غير معروف — أعد تحميل الصفحة`);
        return { key: c.key, ar: str(c.ar, LIMITS.long, 'النص العربي'), en: str(c.en, LIMITS.long, 'النص الإنجليزي') };
      });
      await store.update('texts.json', {}, (all) => {
        for (const c of changes) {
          const d = content.defaults(c.key);
          // only what differs from the page is kept; an empty field means "use the original"
          const ar = c.ar && c.ar !== d.ar ? c.ar : '', en = c.en && c.en !== d.en ? c.en : '';
          if (ar || en) all[c.key] = { ar, en }; else delete all[c.key];
        }
        return all;
      });
      console.log(`[admin] ${who} saved ${changes.length} text(s)`);
      return json(res, 200, { ok: true, texts: content.listTexts() });
    }

    /* projects, partners, settings, testimonials: read with a revision, write back with it */
    // the last number: the largest body a save may send (500 feedback entries in two languages need more room)
    const files = {
      '/projects': ['projects.json', { sectors: {}, projects: [] }, cleanProjects, 1024 * 1024],
      '/partners': ['partners.json', [], cleanPartners, 1024 * 1024],
      '/settings': ['settings.json', {}, cleanSettings, 1024 * 1024],
      '/testimonials': ['testimonials.json', [], cleanTestimonials, 6 * 1024 * 1024],
      '/articles': ['articles.json', [], cleanArticles, 8 * 1024 * 1024],
    };
    if (files[route]) {
      const [name, fallback, clean, limit] = files[route];
      if (method === 'GET') { const data = store.read(name, fallback); return json(res, 200, { ok: true, data, rev: rev(data) }); }
      if (method === 'PUT') {
        const b = await readJson(req, limit);
        const data = await saveRevisioned(name, fallback, req, b, clean);
        console.log(`[admin] ${who} saved ${name}`);
        return json(res, 200, { ok: true, data, rev: rev(data) });
      }
    }

    /* uploads: the raw image as the body (the panel resizes and converts to WebP first) */
    if (route === '/upload' && method === 'POST') {
      // only the image itself: no forms, no scripts, nothing the browser labels as something else
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['image/webp', 'image/png', 'image/jpeg', 'application/octet-stream'].includes(type)) throw new Bad('الصور بصيغة JPG أو PNG أو WebP فقط', 415);
      if (Number(req.headers['content-length']) > UPLOAD_MAX) throw new Bad('الملف كبير جداً (الحد 8 ميغابايت)', 413);
      const buf = await readBody(req, UPLOAD_MAX);
      const ext = sniffImage(buf);
      if (!ext || buf.length < 64) throw new Bad('الصور بصيغة JPG أو PNG أو WebP فقط', 415);
      const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      await fsp.mkdir(store.uploadsDir, { recursive: true });
      await fsp.writeFile(path.join(store.uploadsDir, name), buf);
      console.log(`[admin] ${who} uploaded ${name} (${Math.round(buf.length / 1024)} KB)`);
      return json(res, 200, { ok: true, src: `/uploads/${name}` });
    }

    /* the contact form's emails (lib/mail.js): what's switched on, and a test send to the team's address */
    if (route === '/mail' && method === 'GET') {
      return json(res, 200, { ok: true, enabled: mail.enabled, to: mail.to, autoreply: mail.autoreply, reminderHours: mail.hours });
    }
    if (route === '/mail/test' && method === 'POST') {
      if (!mail.enabled) throw new Bad('البريد غير مفعّل على الخادم — أضف إعدادات SMTP و CONTACT_TO في Hostinger');
      if (Date.now() - lastTest < 60 * 1000) throw new Bad('أُرسلت رسائل تجريبية قبل أقل من دقيقة — انتظر قليلاً', 429);
      lastTest = Date.now();
      try { await mail.sendTest(); } catch (err) {
        console.error('[admin] test email failed:', err.message);
        throw new Bad(`تعذّر الإرسال: ${err.message}`, 502);
      }
      console.log(`[admin] ${who} sent the test emails to ${mail.to}`);
      return json(res, 200, { ok: true, to: mail.to });
    }

    /* the click map: one page's clicks, or one visit's (?s=) */
    if (route === '/analytics/clicks' && method === 'GET') {
      if (!analytics) throw new Bad('الإحصائيات غير مفعّلة', 404);
      const q = new URL(req.url, 'http://x').searchParams;
      const pick = (k, re) => (re.test(q.get(k) || '') ? q.get(k) : '');
      const clicks = await analytics.clickMap({
        days: Number(q.get('days')) || 30, p: pick('p', /^\/[\w.-]*$/), l: pick('l', /^(ar|en)$/),
        pr: pick('pr', /^[a-z0-9-]{1,60}$/), dev: pick('dev', /^(mobile|desktop)$/), s: pick('s', /^[a-z0-9]{8,32}$/),
      });
      return json(res, 200, { ok: true, clicks });
    }
    /* visitor statistics (lib/analytics.js): ?days=7|30|90|365 */
    if (route === '/analytics' && method === 'GET') {
      if (!analytics) throw new Bad('الإحصائيات غير مفعّلة', 404);
      const days = Number(new URL(req.url, 'http://x').searchParams.get('days')) || 30;
      const report = await analytics.report(days, store.read('projects.json', { projects: [] }).projects);
      return json(res, 200, { ok: true, ...report });
    }

    /* messages from the contact form */
    if (route === '/messages' && method === 'GET') {
      const list = (await store.readMessages()).reverse();
      return json(res, 200, { ok: true, services: serviceLabels, messages: list.map(({ ip: _ip, ...m }) => m) });
    }
    const mm = route.match(/^\/messages\/([0-9a-f-]{36})$/);
    if (mm && (method === 'PATCH' || method === 'DELETE')) {
      const b = method === 'PATCH' ? await readJson(req, 1024) : {};
      let found = false;
      await store.rewriteMessages((list) => {
        if (method === 'DELETE') { const n = list.filter((m) => m.id !== mm[1]); found = n.length !== list.length; return n; }
        for (const m of list) if (m.id === mm[1]) { m.read = Boolean(b.read); found = true; }
        return list;
      });
      if (!found) throw new Bad('الرسالة غير موجودة', 404);
      if (method === 'DELETE') console.log(`[admin] ${who} deleted message ${mm[1]}`);
      return json(res, 200, { ok: true });
    }

    if (route === '/invoices' || route.startsWith('/invoices/')) return invoices.handle(req, res, route, { json, who });

    return json(res, 404, { ok: false, error: 'غير موجود' });
  }

  return async (req, res, p) => {
    try { await handle(req, res, p); } catch (err) {
      if (err instanceof Bad) return json(res, err.status, { ok: false, error: err.message });
      if (err && err.status === 413) return json(res, 413, { ok: false, error: 'الملف كبير جداً' });
      throw err;
    }
  };
}

module.exports = { createAdmin, sniffImage };
