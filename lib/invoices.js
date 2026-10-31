/* PuzzleX — invoices, receipts and quotations (the admin panel's «الفواتير والإيصالات»).
   Kept in DATA_DIR/invoices.json: { profile, counters: { 'INV-2026': 3 }, docs: [ … ] }.
   Numbers are given here, never by the panel (INV-2026-0001, RCT-…, QUO-…), and every total is worked out
   here in whole minor units (cents, or fils for KWD/BHD/OMR), so what is stored and printed never drifts.
   A receipt against an invoice pays it: the invoice's paid amount, balance and status follow its receipts.
   Each document can carry a random share token: /doc/<token> shows it to the client (server.js), read-only. */
'use strict';

const crypto = require('node:crypto');

const FILE = 'invoices.json';
const TYPES = { invoice: 'INV', receipt: 'RCT', quote: 'QUO' };
const STATUSES = {
  invoice: ['draft', 'sent', 'partial', 'paid', 'cancelled'],
  quote: ['draft', 'sent', 'accepted', 'rejected'],
  receipt: ['issued', 'cancelled'],
};
const METHODS = ['cash', 'bank', 'card', 'transfer', 'other'];
const THREE_DECIMALS = new Set(['KWD', 'BHD', 'OMR', 'JOD']);
const MAX_DOCS = 5000;
const MAX_ITEMS = 200;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UPLOAD_SRC = /^\/uploads\/[a-f0-9]{24}\.(webp|png|jpg)$/;
const DEFAULT_LOGO = '/assets/icon.svg';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const DEFAULT_PROFILE = {
  nameAr: 'شركة بزل إكس ميديا', nameEn: 'PuzzleX Media',
  addressAr: '', addressEn: '', phone: '', email: '', website: 'www.puzzlexmedia.com', taxNo: '',
  bank: '', currency: 'USD', taxRate: 0,
  notesAr: 'شكراً لثقتكم بنا.', notesEn: 'Thank you for your business.',
  termsAr: '', termsEn: '',
  logo: DEFAULT_LOGO, stamp: '',
};

class Bad extends Error { constructor(msg, status = 422) { super(msg); this.status = status; } }

const decimalsOf = (currency) => (THREE_DECIMALS.has(currency) ? 3 : 2);
const toMinor = (v, d) => Math.round(Number(v) * 10 ** d + (Number(v) >= 0 ? 1e-7 : -1e-7));
const fromMinor = (m, d) => Number((m / 10 ** d).toFixed(d));
const today = () => new Date().toISOString().slice(0, 10);
const rev = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('base64url').slice(0, 16);

const str = (v, max, field) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new Bad(`${field}: يجب أن يكون نصاً`);
  const s = String(v).replace(/\r\n?/g, '\n').trim();
  if (s.length > max) throw new Bad(`${field}: النص طويل جداً (الحد ${max} حرفاً)`);
  return s;
};
const num = (v, field, { max = 1e12, allowEmpty = true } = {}) => {
  if ((v === '' || v === undefined || v === null) && allowEmpty) return 0;
  const n = Number(typeof v === 'string' ? v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/,/g, '') : v);
  if (!Number.isFinite(n) || n < 0) throw new Bad(`${field}: رقم غير صالح (صفر أو أكثر)`);
  if (n > max) throw new Bad(`${field}: الرقم كبير جداً`);
  return n;
};
const date = (v, field, required) => {
  const s = str(v, 10, field);
  if (!s) { if (required) throw new Bad(`${field}: التاريخ مطلوب`); return ''; }
  if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Bad(`${field}: التاريخ مثل 2026-10-31`);
  return s;
};
const image = (v, field, fallback) => {
  const s = str(v, 120, field);
  if (!s) return fallback;
  if (s === DEFAULT_LOGO || UPLOAD_SRC.test(s)) return s;
  throw new Bad(`${field}: الصورة غير صالحة — ارفعها من اللوحة`);
};
const currencyOf = (v) => {
  const c = str(v, 6, 'العملة').toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Bad('العملة: رمز من 3 أحرف إنجليزية مثل USD');
  return c;
};

function cleanProfile(b) {
  if (!b || typeof b !== 'object') throw new Bad('بيانات الشركة غير صالحة');
  const email = str(b.email, 254, 'البريد');
  if (email && !EMAIL.test(email)) throw new Bad('البريد الإلكتروني غير صالح');
  return {
    nameAr: str(b.nameAr, 160, 'اسم الشركة بالعربية') || DEFAULT_PROFILE.nameAr,
    nameEn: str(b.nameEn, 160, 'اسم الشركة بالإنجليزية') || DEFAULT_PROFILE.nameEn,
    addressAr: str(b.addressAr, 400, 'العنوان بالعربية'), addressEn: str(b.addressEn, 400, 'العنوان بالإنجليزية'),
    phone: str(b.phone, 40, 'الهاتف'), email, website: str(b.website, 200, 'الموقع'),
    taxNo: str(b.taxNo, 80, 'الرقم الضريبي'), bank: str(b.bank, 1000, 'بيانات البنك'),
    currency: currencyOf(b.currency || 'USD'), taxRate: num(b.taxRate, 'نسبة الضريبة', { max: 100 }),
    notesAr: str(b.notesAr, 1500, 'الملاحظات بالعربية'), notesEn: str(b.notesEn, 1500, 'الملاحظات بالإنجليزية'),
    termsAr: str(b.termsAr, 2000, 'الشروط بالعربية'), termsEn: str(b.termsEn, 2000, 'الشروط بالإنجليزية'),
    logo: image(b.logo, 'الشعار', DEFAULT_LOGO), stamp: image(b.stamp, 'الختم', ''),
  };
}

// the money: subtotal, discount, tax and total, in minor units then back to decimals
function totals(d) {
  const dec = decimalsOf(d.currency);
  if (d.type === 'receipt') {
    const total = toMinor(d.amount, dec);
    return { subtotal: fromMinor(total, dec), discountAmount: 0, taxAmount: 0, total: fromMinor(total, dec) };
  }
  // qty can be fractional (1.5 hours): each line is rounded once, then lines are added in minor units
  const sub = d.items.reduce((s, it) => s + Math.round(toMinor(it.price, dec) * it.qty), 0);
  let disc = d.discountType === 'percent' ? Math.round((sub * Math.min(d.discount, 100)) / 100) : toMinor(d.discount, dec);
  disc = Math.min(disc, sub);
  const tax = Math.round(((sub - disc) * d.taxRate) / 100);
  return { subtotal: fromMinor(sub, dec), discountAmount: fromMinor(disc, dec), taxAmount: fromMinor(tax, dec), total: fromMinor(sub - disc + tax, dec) };
}

function cleanDoc(b, existing) {
  if (!b || typeof b !== 'object') throw new Bad('بيانات المستند غير صالحة');
  const type = existing ? existing.type : b.type;
  if (!TYPES[type]) throw new Bad('نوع المستند غير صالح');
  const lang = b.lang === 'en' ? 'en' : 'ar';
  const status = STATUSES[type].includes(b.status) ? b.status : STATUSES[type][0];
  const c = b.client || {};
  const client = {
    name: str(c.name, 160, 'اسم العميل'), company: str(c.company, 160, 'الشركة'),
    phone: str(c.phone, 40, 'هاتف العميل'), email: str(c.email, 254, 'بريد العميل'),
    address: str(c.address, 400, 'عنوان العميل'), taxNo: str(c.taxNo, 80, 'الرقم الضريبي للعميل'),
  };
  if (!client.name && !client.company) throw new Bad('اكتب اسم العميل أو شركته');
  if (client.email && !EMAIL.test(client.email)) throw new Bad('بريد العميل غير صالح');
  const items = Array.isArray(b.items) ? b.items : [];
  if (items.length > MAX_ITEMS) throw new Bad(`الحد الأقصى ${MAX_ITEMS} بنداً`);
  const doc = {
    type, lang, status, currency: currencyOf(b.currency || 'USD'),
    issueDate: date(b.issueDate, 'تاريخ الإصدار') || today(),
    dueDate: type === 'receipt' ? '' : date(b.dueDate, type === 'quote' ? 'صالح حتى' : 'تاريخ الاستحقاق'),
    client,
    items: type === 'receipt' ? [] : items.map((it, i) => ({
      desc: str(it && it.desc, 600, `البند ${i + 1}`),
      qty: num(it && it.qty, `الكمية في البند ${i + 1}`, { max: 1e6 }),
      price: num(it && it.price, `السعر في البند ${i + 1}`),
    })).filter((it) => it.desc || it.price),
    discountType: b.discountType === 'percent' ? 'percent' : 'amount',
    discount: type === 'receipt' ? 0 : num(b.discount, 'الخصم'),
    taxRate: type === 'receipt' ? 0 : num(b.taxRate, 'نسبة الضريبة', { max: 100 }),
    notes: str(b.notes, 2000, 'الملاحظات'), terms: str(b.terms, 2000, 'الشروط'),
    amount: type === 'receipt' ? num(b.amount, 'المبلغ المستلم') : 0,
    method: type === 'receipt' ? (METHODS.includes(b.method) ? b.method : 'cash') : '',
    reference: type === 'receipt' ? str(b.reference, 120, 'رقم المرجع') : '',
    invoiceId: type === 'receipt' && /^[a-f0-9]{8}$/.test(b.invoiceId || '') ? b.invoiceId : '',
    paidManual: type === 'invoice' ? num(b.paidManual, 'المبلغ المدفوع') : 0,
  };
  if (doc.discountType === 'percent' && doc.discount > 100) throw new Bad('الخصم: النسبة 100% على الأكثر');
  if (type !== 'receipt' && !doc.items.length) throw new Bad('أضف بنداً واحداً على الأقل');
  if (type === 'receipt' && !doc.amount) throw new Bad('اكتب المبلغ المستلم');
  return doc;
}

// an invoice's paid amount = what was marked paid by hand + its receipts; the status follows
function settle(all) {
  const byInvoice = new Map();
  for (const r of all.docs) {
    if (r.type !== 'receipt' || r.status === 'cancelled' || !r.invoiceId) continue;
    byInvoice.set(r.invoiceId, (byInvoice.get(r.invoiceId) || 0) + toMinor(r.total, decimalsOf(r.currency)));
  }
  for (const d of all.docs) {
    const dec = decimalsOf(d.currency);
    if (d.type === 'receipt') { d.paid = d.total; d.balance = 0; continue; }
    if (d.type === 'quote') { d.paid = 0; d.balance = d.total; continue; }
    const total = toMinor(d.total, dec);
    const paid = Math.min(total, toMinor(d.paidManual || 0, dec) + (byInvoice.get(d.id) || 0));
    d.paid = fromMinor(paid, dec);
    d.balance = fromMinor(total - paid, dec);
    if (d.status === 'cancelled') continue;
    if (paid >= total && total > 0) d.status = 'paid';
    else if (paid > 0) d.status = 'partial';
    else if (d.status === 'paid' || d.status === 'partial') d.status = 'sent';
  }
  return all;
}

const blank = () => ({ profile: { ...DEFAULT_PROFILE }, counters: {}, docs: [] });
const shape = (v) => ({ profile: { ...DEFAULT_PROFILE, ...(v && v.profile) }, counters: (v && v.counters) || {}, docs: (v && Array.isArray(v.docs) ? v.docs : []) });

function createInvoices({ store, mail = { enabled: false }, siteUrl = 'https://www.puzzlexmedia.com', readBody }) {
  const load = () => shape(store.read(FILE, blank()));
  const update = (fn) => store.update(FILE, blank(), (raw) => settle(fn(shape(raw))));
  const newToken = () => crypto.randomBytes(12).toString('hex');

  async function readJson(req, limit) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Bad('صيغة غير صالحة', 415);
    const raw = await readBody(req, limit);
    try { return JSON.parse(raw.toString('utf8')); } catch { throw new Bad('صيغة غير صالحة', 400); }
  }
  const findIn = (all, id) => {
    const d = all.docs.find((x) => x.id === id);
    if (!d) throw new Bad('المستند غير موجود — ربما حذفه أحد', 404);
    return d;
  };
  const linkInvoice = (all, doc) => {
    if (doc.type !== 'receipt' || !doc.invoiceId) return;
    const inv = all.docs.find((x) => x.id === doc.invoiceId && x.type === 'invoice');
    if (!inv) { doc.invoiceId = ''; return; }
    doc.currency = inv.currency; // a payment is in the invoice's currency
    doc.invoiceNumber = inv.number;
  };

  async function route(req, res, path, { json, who }) {
    const method = req.method;
    if (path === '/invoices' && method === 'GET') {
      const all = load();
      return json(res, 200, { ok: true, profile: all.profile, docs: all.docs, rev: rev(all.profile) });
    }
    if (path === '/invoices/profile' && method === 'PUT') {
      const b = await readJson(req, 64 * 1024);
      const next = await update((all) => {
        if (b.rev && b.rev !== rev(all.profile)) throw new Bad('حفظ مستخدم آخر بيانات الشركة قبلك — أعد تحميل الصفحة', 409);
        all.profile = cleanProfile(b.profile);
        return all;
      });
      console.log(`[invoices] ${who} saved the business profile`);
      return json(res, 200, { ok: true, profile: next.profile, rev: rev(next.profile) });
    }
    if (path === '/invoices' && method === 'POST') {
      const b = await readJson(req, 512 * 1024);
      let created;
      await update((all) => {
        if (all.docs.length >= MAX_DOCS) throw new Bad(`الحد الأقصى ${MAX_DOCS} مستند`);
        const doc = cleanDoc(b, null);
        const key = `${TYPES[doc.type]}-${doc.issueDate.slice(0, 4)}`;
        all.counters[key] = (all.counters[key] || 0) + 1;
        let id;
        do id = crypto.randomBytes(4).toString('hex'); while (all.docs.some((x) => x.id === id));
        created = { id, number: `${key}-${String(all.counters[key]).padStart(4, '0')}`, ...doc, token: newToken(), createdAt: new Date().toISOString(), createdBy: who };
        linkInvoice(all, created);
        Object.assign(created, totals(created), { updatedAt: created.createdAt });
        all.docs.unshift(created);
        return all;
      });
      const fresh = load().docs.find((d) => d.id === created.id);
      console.log(`[invoices] ${who} created ${fresh.number}`);
      return json(res, 200, { ok: true, doc: fresh, docs: load().docs });
    }
    const m = path.match(/^\/invoices\/([a-f0-9]{8})(?:\/(token|email|paid))?$/);
    if (!m) return json(res, 404, { ok: false, error: 'غير موجود' });
    const [, id, action] = m;

    if (!action && method === 'PUT') {
      const b = await readJson(req, 512 * 1024);
      await update((all) => {
        const d = findIn(all, id);
        if (b.updatedAt && b.updatedAt !== d.updatedAt) throw new Bad('عدّل مستخدم آخر هذا المستند قبلك — أعد فتحه لترى تغييراته', 409);
        const next = cleanDoc(b, d);
        Object.assign(d, next);
        if (d.type === 'receipt') delete d.invoiceNumber;
        linkInvoice(all, d);
        Object.assign(d, totals(d), { updatedAt: new Date().toISOString() });
        return all;
      });
      console.log(`[invoices] ${who} saved ${id}`);
      return json(res, 200, { ok: true, doc: load().docs.find((d) => d.id === id), docs: load().docs });
    }
    if (!action && method === 'DELETE') {
      await update((all) => {
        const d = findIn(all, id);
        all.docs = all.docs.filter((x) => x !== d);
        // receipts of a deleted invoice stay (money was received) but no longer point at it
        for (const r of all.docs) if (r.invoiceId === id) { r.invoiceId = ''; r.invoiceNumber = d.number; }
        return all;
      });
      console.log(`[invoices] ${who} deleted ${id}`);
      return json(res, 200, { ok: true, docs: load().docs });
    }
    if (action === 'paid' && method === 'POST') {
      await update((all) => {
        const d = findIn(all, id);
        if (d.type !== 'invoice') throw new Bad('فقط الفواتير تُعلَّم كمدفوعة');
        const dec = decimalsOf(d.currency);
        const viaReceipts = toMinor(d.paid, dec) - toMinor(d.paidManual || 0, dec);
        d.paidManual = fromMinor(Math.max(0, toMinor(d.total, dec) - viaReceipts), dec);
        if (d.status === 'cancelled' || d.status === 'draft') d.status = 'sent';
        d.updatedAt = new Date().toISOString();
        return all;
      });
      return json(res, 200, { ok: true, doc: load().docs.find((d) => d.id === id), docs: load().docs });
    }
    if (action === 'token' && method === 'POST') {
      await update((all) => { const d = findIn(all, id); d.token = newToken(); d.updatedAt = new Date().toISOString(); return all; });
      console.log(`[invoices] ${who} renewed the share link of ${id}`);
      return json(res, 200, { ok: true, doc: load().docs.find((d) => d.id === id), docs: load().docs });
    }
    if (action === 'email' && method === 'POST') {
      if (!mail.enabled || !mail.sendDocument) throw new Bad('البريد غير مفعّل على الخادم — استخدم «إرسال بالبريد» من جهازك أو واتساب');
      const b = await readJson(req, 16 * 1024);
      const all = load();
      const d = findIn(all, id);
      const to = str(b.to, 254, 'البريد');
      if (!EMAIL.test(to)) throw new Bad('اكتب بريد العميل الصحيح');
      const origin = /^https?:\/\/[^/]+$/.test(req.headers.origin || '') ? req.headers.origin : siteUrl;
      const email = documentEmail(d, all.profile, `${origin}/doc/${d.token}`, str(b.message, 2000, 'الرسالة'));
      try { await mail.sendDocument({ to, ...email }); } catch (err) {
        console.error('[invoices] email failed:', err.message);
        throw new Bad(`تعذّر الإرسال: ${err.message}`, 502);
      }
      await update((x) => { const doc = findIn(x, id); if (doc.status === 'draft') doc.status = 'sent'; doc.sentAt = new Date().toISOString(); return x; });
      console.log(`[invoices] ${who} emailed ${d.number} to ${to}`);
      return json(res, 200, { ok: true, docs: load().docs });
    }
    return json(res, 404, { ok: false, error: 'غير موجود' });
  }

  // admin router entry: answers every /invoices… route, errors included
  async function handle(req, res, path, ctx) {
    try { await route(req, res, path, ctx); } catch (err) {
      if (err instanceof Bad) return ctx.json(res, err.status, { ok: false, error: err.message });
      if (err && err.status === 413) return ctx.json(res, 413, { ok: false, error: 'البيانات كبيرة جداً' });
      throw err;
    }
  }

  // what the client's page may see: the document and the company details printed on it
  function getShared(token) {
    if (!/^[a-f0-9]{24}$/.test(String(token))) return null;
    const all = load();
    const d = all.docs.find((x) => x.token && crypto.timingSafeEqual(Buffer.from(x.token), Buffer.from(token)));
    if (!d) return null;
    const { createdBy: _c, paidManual: _p, token: _t, ...doc } = d;
    return { doc, profile: all.profile };
  }

  return { handle, getShared };
}

/* ---------- the email that carries a document's link ---------- */
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NAMES = {
  ar: { invoice: 'فاتورة', receipt: 'إيصال استلام', quote: 'عرض سعر' },
  en: { invoice: 'Invoice', receipt: 'Receipt', quote: 'Quotation' },
};
function money(v, currency, lang) {
  const d = decimalsOf(currency);
  const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  return lang === 'en' ? `${currency} ${amount}` : `${amount} ${currency}`; // same as invoice-doc.js
}
function documentEmail(d, profile, link, message) {
  const en = d.lang === 'en';
  const company = en ? profile.nameEn : profile.nameAr;
  const kind = NAMES[d.lang][d.type];
  const who = d.client.name || d.client.company;
  const subject = `${kind} ${d.number} — ${company}`;
  const intro = message || (en
    ? `Hello ${who},\n\nPlease find your ${kind.toLowerCase()} ${d.number} for ${money(d.total, d.currency, 'en')} at the link below.`
    : `مرحباً ${who}،\n\nتجدون ${kind} رقم ${d.number} بقيمة ${money(d.total, d.currency, 'ar')} على الرابط أدناه.`);
  const button = en ? `View and download the ${kind.toLowerCase()}` : `عرض ${kind} وتنزيلها`;
  const text = `${intro}\n\n${link}\n\n${company}`;
  const html = `<!doctype html><html lang="${d.lang}" dir="${en ? 'ltr' : 'rtl'}"><body style="margin:0;background:#0a0a0b;padding:32px 12px;font-family:Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#131315;border-radius:20px;border:1px solid #2a2a2e"><tr><td style="padding:32px 28px;color:#f4f4f1;font-size:15px;line-height:1.8;text-align:${en ? 'left' : 'right'}">
<p style="margin:0 0 6px;color:#D8FF06;font-weight:700;letter-spacing:.12em;font-size:12px">PUZZLEX MEDIA</p>
<h1 style="margin:0 0 18px;font-size:22px">${escHtml(kind)} ${escHtml(d.number)}</h1>
<p style="margin:0 0 22px;white-space:pre-line">${escHtml(intro)}</p>
<p style="margin:0 0 26px"><a href="${escHtml(link)}" style="display:inline-block;background:#D8FF06;color:#0a0a0b;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:999px">${escHtml(button)}</a></p>
<p style="margin:0;color:rgba(244,244,241,.6);font-size:13px">${escHtml(company)}</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

module.exports = { createInvoices, totals, decimalsOf, DEFAULT_PROFILE };
