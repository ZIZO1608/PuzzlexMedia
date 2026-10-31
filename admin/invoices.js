/* PuzzleX admin — «الفواتير والإيصالات»: invoices, receipts and quotations (#/invoices).
   Loaded after admin.js and uses its helpers (h, api, toast, setPending, refreshBar, busy, upload, pickFiles…).
   The server (lib/invoices.js) gives the numbers and works out the money; the totals here only feed the live
   preview, drawn by the same invoice-doc.js the client's page uses. «تنزيل PDF» prints that sheet.
   Every choice in this section is an ivDrop (a styled, searchable dropdown) and every row's extra actions an ivMenu. */
'use strict';

const IV = {
  types: {
    invoice: { name: 'فاتورة', plural: 'الفواتير', prefix: 'INV', add: '+ فاتورة' },
    receipt: { name: 'إيصال استلام', plural: 'الإيصالات', prefix: 'RCT', add: '+ إيصال' },
    quote: { name: 'عرض سعر', plural: 'عروض الأسعار', prefix: 'QUO', add: '+ عرض سعر' },
  },
  status: {
    draft: 'مسودة', sent: 'مُرسَل', partial: 'مدفوعة جزئياً', paid: 'مدفوعة', cancelled: 'ملغى',
    accepted: 'مقبول', rejected: 'مرفوض', issued: 'صادر',
  },
  statusOf: { invoice: ['draft', 'sent', 'partial', 'paid', 'cancelled'], quote: ['draft', 'sent', 'accepted', 'rejected'], receipt: ['issued', 'cancelled'] },
  methods: { cash: 'نقداً', bank: 'تحويل بنكي', card: 'بطاقة', transfer: 'حوالة مالية', other: 'أخرى' },
  currencies: {
    USD: 'دولار أمريكي', EUR: 'يورو', SAR: 'ريال سعودي', AED: 'درهم إماراتي', KWD: 'دينار كويتي', QAR: 'ريال قطري',
    BHD: 'دينار بحريني', OMR: 'ريال عماني', JOD: 'دينار أردني', EGP: 'جنيه مصري', IQD: 'دينار عراقي', LBP: 'ليرة لبنانية',
    SYP: 'ليرة سورية', TRY: 'ليرة تركية', MAD: 'درهم مغربي', GBP: 'جنيه إسترليني',
  },
};
let ivState = null; // { profile, rev, docs, mail } loaded on entering the section
let ivRO = null; // the preview's ResizeObserver: one at a time, however often the editor is redrawn

const ivToday = () => new Date().toISOString().slice(0, 10);
const ivPlusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ivDaysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const ivMoney = (v, cur) => InvoiceDoc.money(v, cur, 'ar');
const ivNum = (v) => { const n = Number(String(v ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? n : 0; };
const ivEmail = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/; // the same rule as lib/invoices.js
const ivOverdue = (d) => d.type === 'invoice' && (d.status === 'sent' || d.status === 'partial') && d.dueDate && d.dueDate < ivToday();

// the same arithmetic as lib/invoices.js (whole minor units), for the preview
function ivTotals(d, docs) {
  const dec = InvoiceDoc.decimals(d.currency);
  const toMinor = (v) => Math.round(ivNum(v) * 10 ** dec + 1e-7);
  const back = (m) => Number((m / 10 ** dec).toFixed(dec));
  if (d.type === 'receipt') { const t = back(toMinor(d.amount)); return { subtotal: t, discountAmount: 0, taxAmount: 0, total: t, paid: t, balance: 0 }; }
  const sub = d.items.reduce((s, it) => s + Math.round(toMinor(it.price) * ivNum(it.qty)), 0);
  let disc = d.discountType === 'percent' ? Math.round((sub * Math.min(ivNum(d.discount), 100)) / 100) : toMinor(d.discount);
  disc = Math.min(disc, sub);
  const tax = Math.round(((sub - disc) * ivNum(d.taxRate)) / 100);
  const total = sub - disc + tax;
  let paid = 0;
  if (d.type === 'invoice') {
    const receipts = docs.filter((r) => r.type === 'receipt' && r.status !== 'cancelled' && d.id && r.invoiceId === d.id).reduce((s, r) => s + toMinor(r.total), 0);
    paid = Math.min(total, toMinor(d.paidManual) + receipts);
  }
  return { subtotal: back(sub), discountAmount: back(disc), taxAmount: back(tax), total: back(total), paid: back(paid), balance: back(total - paid) };
}
function ivStatus(d, t) {
  if (d.type !== 'invoice' || d.status === 'cancelled') return d.status;
  if (t.total > 0 && t.paid >= t.total) return 'paid';
  if (t.paid > 0) return 'partial';
  return d.status === 'paid' || d.status === 'partial' ? 'sent' : d.status;
}

async function ivLoad() {
  const [r, mail] = await Promise.all([api('GET', '/invoices'), api('GET', '/mail').catch(() => ({ enabled: false }))]);
  ivState = { profile: r.profile, rev: r.rev, docs: r.docs, mail: Boolean(mail.enabled) };
  return ivState;
}

function ivBlank(type) {
  const p = ivState.profile;
  const issue = ivToday();
  return {
    id: '', number: '', type, lang: 'ar', status: type === 'receipt' ? 'issued' : 'draft', currency: p.currency || 'USD',
    issueDate: issue, dueDate: type === 'receipt' ? '' : ivPlusDays(issue, type === 'quote' ? 30 : 14),
    client: { name: '', company: '', phone: '', email: '', address: '', taxNo: '' },
    items: type === 'receipt' ? [] : [{ desc: '', qty: 1, price: 0 }],
    discountType: 'amount', discount: 0, taxRate: type === 'receipt' ? 0 : p.taxRate || 0,
    notes: type === 'receipt' ? '' : p.notesAr || '', terms: type === 'receipt' ? '' : p.termsAr || '',
    amount: 0, method: 'cash', reference: '', invoiceId: '', paidManual: 0,
  };
}
// the share link the client opens
const ivLink = (d) => `${location.origin}/doc/${d.token}`;
const ivClientName = (d) => d.client.name || d.client.company || '—';
const ivCopy = async (text, okText) => {
  try { await navigator.clipboard.writeText(text); toast(okText); } catch { prompt('انسخ:', text); }
};

/* ---------- dropdowns ---------- */
let ivOpen = null; // close() of the dropdown that is open now

// opens build(close) → { el, focus } beside btn; closes on a click outside, Escape, Tab out or a resize
function ivPopover(btn, build) {
  let panel = null;
  const outside = (e) => { if (panel && !panel.contains(e.target) && !btn.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } };
  const onResize = () => close();
  function close(refocus) {
    if (!panel) return;
    panel.remove();
    panel = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (ivOpen === close) ivOpen = null;
    if (refocus && btn.isConnected) btn.focus();
  }
  function open() {
    if (ivOpen) ivOpen();
    const built = build(close);
    panel = built.el;
    btn.after(panel);
    btn.setAttribute('aria-expanded', 'true');
    // below the button, or above it when there's more room there; kept inside the screen sideways
    const r = btn.getBoundingClientRect();
    const room = innerHeight - r.bottom;
    panel.classList.toggle('up', room < panel.offsetHeight + 16 && r.top > room);
    const pr = panel.getBoundingClientRect();
    if (pr.left < 8 || pr.right > document.documentElement.clientWidth - 8) panel.classList.add('end');
    ivOpen = close;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    if (built.focus) built.focus.focus({ preventScroll: true });
    if (built.after) built.after();
  }
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => (panel ? close(true) : open()));
  btn.addEventListener('keydown', (e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !panel) { e.preventDefault(); open(); } });
  return { open, close };
}

// arrow keys, Home / End and Enter through a list of options; a search box above it stays reachable
function ivNav(panel, selector, close, search) {
  const all = () => [...panel.querySelectorAll(selector)].filter((o) => o.getAttribute('aria-disabled') !== 'true');
  const go = (i) => { const list = all(); if (list.length) list[Math.max(0, Math.min(list.length - 1, i))].focus(); };
  panel.addEventListener('keydown', (e) => {
    const list = all();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (search && i <= 0) search.focus(); else go(i - 1); }
    else if ((e.key === 'Home' || e.key === 'End') && e.target !== search) { e.preventDefault(); go(e.key === 'Home' ? 0 : list.length - 1); }
    else if (e.key === 'Enter' && e.target === search) { e.preventDefault(); if (list[0]) list[0].click(); }
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); list[i].click(); }
    else if (e.key === 'Tab') close();
    else if (!search && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // type a letter to jump to the next option that starts with it
      const k = e.key.toLowerCase();
      const from = list.slice(i + 1).concat(list.slice(0, i + 1));
      const hit = from.find((o) => o.textContent.trim().toLowerCase().startsWith(k));
      if (hit) hit.focus();
    }
  });
}

/* A select that looks like the panel: options [{ value, label, hint, short, tone, keys, disabled }].
   search: true (or a placeholder) adds a filter box; custom(text) may offer an extra option for what was typed. */
function ivDrop({ value, options, onChange, label, search, custom, placeholder = 'اختر…', disabled, cls }) {
  const find = (v) => options.find((o) => String(o.value) === String(v));
  const chev = h('span', { class: 'ivdd-chev', 'aria-hidden': 'true' });
  const face = (o) => [o && o.tone ? h('i', { class: `ivdd-dot st-${o.tone}`, 'aria-hidden': 'true' }) : null,
    h('span', { class: `ivdd-label${o ? '' : ' muted'}` }, o ? o.short || o.label : placeholder), chev];
  const btn = h('button', { type: 'button', class: `ivdd-btn${cls ? ` ${cls}` : ''}`, 'aria-haspopup': 'listbox', 'aria-label': label, disabled },
    ...face(find(value) || (value ? { label: String(value) } : null)));
  ivPopover(btn, (close) => {
    const q = search ? h('input', { type: 'search', class: 'ivdd-search', placeholder: typeof search === 'string' ? search : 'ابحث…', 'aria-label': 'بحث', dir: 'auto', autocomplete: 'off' }) : null;
    const list = h('div', { class: 'ivdd-list', role: 'listbox', 'aria-label': label });
    const pick = (o) => {
      close(true);
      if (String(o.value) === String(value)) return;
      value = o.value;
      btn.replaceChildren(...face(o).filter(Boolean));
      onChange(o.value, o);
    };
    const row = (o) => {
      const on = String(o.value) === String(value);
      return h('div', { role: 'option', tabindex: '-1', class: 'ivdd-opt', 'aria-selected': String(on), 'aria-disabled': o.disabled ? 'true' : null, onclick: () => { if (!o.disabled) pick(o); } },
        o.tone ? h('i', { class: `ivdd-dot st-${o.tone}`, 'aria-hidden': 'true' }) : null,
        h('span', { class: 'ivdd-text' }, h('span', null, o.label), o.hint ? h('small', null, o.hint) : null),
        on ? h('span', { class: 'ivdd-check', 'aria-hidden': 'true' }, '✓') : null);
    };
    const draw = () => {
      const s = q ? q.value.trim().toLowerCase() : '';
      const shown = options.filter((o) => !s || `${o.value} ${o.label} ${o.hint || ''} ${o.keys || ''}`.toLowerCase().includes(s));
      const extra = custom && s ? custom(q.value.trim()) : null;
      if (extra && !options.some((o) => String(o.value).toLowerCase() === String(extra.value).toLowerCase())) shown.push(extra);
      list.replaceChildren(...(shown.length ? shown.map(row) : [h('p', { class: 'ivdd-empty' }, 'لا نتائج')]));
    };
    if (q) q.addEventListener('input', draw);
    draw();
    const panel = h('div', { class: 'ivdd-pop' }, q, list);
    ivNav(panel, '[role="option"]', close, q);
    const sel = list.querySelector('[aria-selected="true"]');
    return {
      el: panel,
      focus: q || sel || list.querySelector('[role="option"]'),
      after: () => { if (sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2; },
    };
  });
  return h('div', { class: 'ivdd' }, btn);
}

// a "⋯" button with a menu of actions: [{ icon, label, href, external, onClick, danger }] and '-' for a line
function ivMenu(label, items) {
  const btn = h('button', { type: 'button', class: 'btn btn-icon btn-small ivmm-btn', 'aria-haspopup': 'menu', 'aria-label': label, title: label }, '⋯');
  ivPopover(btn, (close) => {
    const rows = items.filter(Boolean).map((it) => (it === '-' ? h('hr') : h(it.href ? 'a' : 'button', {
      role: 'menuitem', tabindex: '-1', class: `ivdd-opt${it.danger ? ' danger' : ''}`, type: it.href ? null : 'button',
      href: it.href, target: it.external ? '_blank' : null, rel: it.external ? 'noopener' : null,
      onclick: () => { close(); if (it.onClick) it.onClick(btn); },
    }, h('span', { class: 'ivmm-ico', 'aria-hidden': 'true' }, it.icon || ''), h('span', null, it.label))));
    const panel = h('div', { class: 'ivdd-pop ivmm-pop' }, h('div', { class: 'ivdd-list', role: 'menu', 'aria-label': label }, rows));
    ivNav(panel, '[role="menuitem"]', close);
    return { el: panel, focus: panel.querySelector('[role="menuitem"]') };
  });
  return h('div', { class: 'ivdd ivmm' }, btn);
}

const ivCurrencyOptions = () => Object.entries(IV.currencies).map(([code, name]) => ({ value: code, label: `${code} — ${name}`, short: code, keys: name }));
const ivCurrencyDrop = (value, onChange, disabled) => ivDrop({
  value, options: ivCurrencyOptions(), onChange, label: 'العملة', disabled, search: 'ابحث بالرمز أو الاسم…',
  custom: (s) => (/^[a-z]{3}$/i.test(s) ? { value: s.toUpperCase(), label: `استخدم ${s.toUpperCase()}`, short: s.toUpperCase(), hint: 'رمز عملة من 3 أحرف' } : null),
});

/* A date field with the panel's own calendar: Arabic months, weeks from Saturday, keyboard friendly.
   Returns the field; field.setValue(iso) changes it from outside, field.focus() focuses its button. */
const IV_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const IV_DAYS = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة']; // Saturday first
const ivIso = (y, m, day) => new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10); // m from 0
const ivParts = (iso) => { const [y, m, day] = iso.split('-').map(Number); return { y, m: m - 1, day }; };
const ivMonthDays = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const ivShiftMonth = (iso, n) => {
  const { y, m, day } = ivParts(iso);
  const t = new Date(Date.UTC(y, m + n, 1));
  return ivIso(t.getUTCFullYear(), t.getUTCMonth(), Math.min(day, ivMonthDays(t.getUTCFullYear(), t.getUTCMonth())));
};
const ivLongDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function ivDate({ value, onChange, label, clearable }) {
  const btn = h('button', { type: 'button', class: 'ivdd-btn ivdt-btn', 'aria-haspopup': 'dialog', 'aria-label': label });
  // the weekday goes in the tooltip: the field is too narrow for it
  const paint = () => { btn.title = value ? ivLongDate(value) : ''; btn.replaceChildren(h('span', { class: 'ivdt-ico', 'aria-hidden': 'true' }),
    h('span', { class: `ivdd-label${value ? '' : ' muted'}` }, value ? InvoiceDoc.dateText(value, 'ar') : 'اختر تاريخاً'), h('span', { class: 'ivdd-chev', 'aria-hidden': 'true' })); };
  paint();
  ivPopover(btn, (close) => {
    let at = value || ivToday(); // the day the keyboard is on, and the month shown
    let mode = 'days';
    const today = ivToday();
    const head = h('div', { class: 'ivdt-head' });
    const body = h('div', { class: 'ivdt-body' });
    const pick = (iso) => { close(true); if (iso !== value) { value = iso; paint(); onChange(iso); } };
    const nav = (text, aria, fn) => h('button', { type: 'button', class: 'ivdt-nav', 'aria-label': aria, title: aria, onclick: fn }, text);
    function draw(focus) {
      const { y, m } = ivParts(at);
      if (mode === 'days') {
        head.replaceChildren(
          nav('‹', 'الشهر السابق', () => { at = ivShiftMonth(at, -1); draw(); }),
          h('button', { type: 'button', class: 'ivdt-title', 'aria-label': 'اختر الشهر والسنة', onclick: () => { mode = 'months'; draw(true); } }, `${IV_MONTHS[m]} ${y}`, h('span', { class: 'ivdd-chev', 'aria-hidden': 'true' })),
          nav('›', 'الشهر التالي', () => { at = ivShiftMonth(at, 1); draw(); }));
        const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 1) % 7;
        const cells = [];
        for (let i = 0; i < 42; i++) {
          const iso = ivIso(y, m, 1 - offset + i);
          const p = ivParts(iso);
          const cls = ['ivdt-day', p.m !== m && 'out', iso === today && 'today', iso === value && 'on'].filter(Boolean).join(' ');
          cells.push(h('button', { type: 'button', class: cls, tabindex: iso === at ? '0' : '-1', 'data-iso': iso, 'aria-label': ivLongDate(iso), 'aria-pressed': String(iso === value), onclick: () => pick(iso) }, p.day));
        }
        body.replaceChildren(h('div', { class: 'ivdt-week', 'aria-hidden': 'true' }, IV_DAYS.map((n) => h('span', null, n))), h('div', { class: 'ivdt-grid' }, cells));
      } else {
        head.replaceChildren(
          nav('‹', 'السنة السابقة', () => { at = ivShiftMonth(at, -12); draw(); }),
          h('button', { type: 'button', class: 'ivdt-title', onclick: () => { mode = 'days'; draw(true); } }, String(y)),
          nav('›', 'السنة التالية', () => { at = ivShiftMonth(at, 12); draw(); }));
        const v = value && ivParts(value);
        body.replaceChildren(h('div', { class: 'ivdt-months' }, IV_MONTHS.map((name, i) => h('button', {
          type: 'button', class: `ivdt-month${v && v.y === y && v.m === i ? ' on' : ''}`, tabindex: i === m ? '0' : '-1',
          onclick: () => { at = ivIso(y, i, Math.min(ivParts(at).day, ivMonthDays(y, i))); mode = 'days'; draw(true); },
        }, name))));
      }
      if (focus) body.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
    }
    // arrows move a day (left is later: the panel reads right to left) or a week; PageUp / PageDown a month
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { close(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.ivdt-day, .ivdt-month')) { e.preventDefault(); e.target.click(); return; }
      const step = (mode === 'days' ? { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 } : { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 3, ArrowUp: -3 })[e.key];
      if (step) {
        e.preventDefault();
        at = mode === 'days' ? ivPlusDays(at, step) : ivShiftMonth(at, step);
        draw(true);
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        at = ivShiftMonth(at, (e.key === 'PageUp' ? -1 : 1) * (e.shiftKey || mode === 'months' ? 12 : 1));
        draw(true);
      }
    });
    const foot = h('div', { class: 'ivdt-foot' },
      h('button', { type: 'button', class: 'chip', onclick: () => pick(today) }, 'اليوم'),
      clearable && value ? h('button', { type: 'button', class: 'chip ivdt-clear', onclick: () => { close(true); value = ''; paint(); onChange(''); } }, 'مسح') : null);
    draw();
    const panel = h('div', { class: 'ivdd-pop ivdt-pop', role: 'dialog', 'aria-label': label }, head, body, foot);
    return { el: panel, focus: body.querySelector('[tabindex="0"]') };
  });
  const el = h('div', { class: 'ivdd ivdt' }, btn);
  el.setValue = (v) => { value = v; paint(); };
  el.focus = (o) => btn.focus(o);
  return el;
}

async function viewInvoices(view, arg) {
  if (!ivState || !arg) await ivLoad();
  if (!arg) return ivList(view);
  if (arg === 'profile') return ivProfile(view);
  const fresh = arg.match(/^new\/(invoice|receipt|quote)(?:\/(\w+))?$/);
  if (fresh) {
    const d = ivBlank(fresh[1]);
    const from = fresh[2] && ivState.docs.find((x) => x.id === fresh[2]);
    if (from && fresh[1] === 'receipt' && from.type === 'invoice') {
      // a receipt against an invoice: same client and currency, the balance as the amount
      Object.assign(d, { client: clone(from.client), currency: from.currency, lang: from.lang, invoiceId: from.id, amount: from.balance || from.total });
    } else if (from) {
      // a copy (or a quotation turned into an invoice): everything but the number, dates and status
      const keep = clone({ ...from, id: '', number: '', token: '', type: fresh[1], status: d.status, issueDate: d.issueDate, dueDate: d.dueDate, invoiceId: '', paidManual: 0 });
      for (const k of ['createdAt', 'createdBy', 'updatedAt', 'sentAt', 'invoiceNumber', 'paid', 'balance', 'subtotal', 'discountAmount', 'taxAmount', 'total']) delete keep[k];
      Object.assign(d, keep);
    }
    return ivEditor(view, d, null, { copy: Boolean(from) });
  }
  const doc = ivState.docs.find((x) => x.id === arg);
  if (!doc) { view.replaceChildren(h('div', { class: 'empty' }, 'المستند غير موجود. ', h('a', { href: '#/invoices' }, 'العودة إلى القائمة'))); return; }
  return ivEditor(view, clone(doc));
}
VIEWS.invoices = viewInvoices;

/* ---------- the list ---------- */
const IV_SORTS = {
  new: { label: 'الأحدث أولاً', fn: (a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number) },
  old: { label: 'الأقدم أولاً', fn: (a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number) },
  amount: { label: 'الأعلى مبلغاً', fn: (a, b) => b.total - a.total },
  due: { label: 'الأقرب استحقاقاً', fn: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') },
};
function ivList(view) {
  setPending(null);
  const { docs } = ivState;
  const remember = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* fine */ } };
  const recall = (k, fallback) => { try { return sessionStorage.getItem(k) || fallback; } catch { return fallback; } };
  let type = recall('iv-type', 'all');
  let sort = IV_SORTS[recall('iv-sort', 'new')] ? recall('iv-sort', 'new') : 'new';
  let status = 'all';
  const search = h('input', { type: 'search', class: 'tm-search', placeholder: 'ابحث برقم المستند أو اسم العميل أو هاتفه…', oninput: () => draw() });
  const list = h('div', { class: 'ivx-list' });
  const summary = h('div', { class: 'ivx-summary' });
  const chips = h('div', { class: 'ivx-chips', role: 'group', 'aria-label': 'نوع المستند' });
  const statusBox = h('div', { class: 'ivx-filter' });
  const sortBox = h('div', { class: 'ivx-filter' }, ivDrop({
    value: sort, label: 'الترتيب', options: Object.entries(IV_SORTS).map(([k, s]) => ({ value: k, label: s.label })),
    onChange: (v) => { sort = v; remember('iv-sort', v); draw(); },
  }));

  // money per currency: invoiced (not drafts or cancelled), collected, still owed, and how much of it is late
  function drawSummary() {
    const per = new Map();
    const row = (c) => { if (!per.has(c)) per.set(c, { invoiced: 0, collected: 0, owed: 0, late: 0 }); return per.get(c); };
    for (const d of docs) {
      if (d.status === 'cancelled') continue;
      if (d.type === 'invoice' && d.status !== 'draft') { const r = row(d.currency); r.invoiced += d.total; r.owed += d.balance; r.collected += d.paid; if (ivOverdue(d)) r.late += d.balance; }
      if (d.type === 'receipt' && !d.invoiceId) row(d.currency).collected += d.total;
    }
    summary.replaceChildren(...[...per].map(([cur, r]) => h('div', { class: 'card ivx-sum' },
      h('span', { class: 'tag' }, cur),
      h('div', null, h('small', null, 'المفوتَر'), h('b', null, ivMoney(r.invoiced, cur))),
      h('div', null, h('small', null, 'المحصَّل'), h('b', { class: 'ok' }, ivMoney(r.collected, cur))),
      h('div', null, h('small', null, r.late ? 'المستحق · منه متأخر' : 'المستحق'), h('b', { class: r.owed ? 'warn' : '' }, ivMoney(r.owed, cur)),
        r.late ? h('small', { class: 'late' }, ivMoney(r.late, cur)) : null))));
  }
  function drawChips() {
    const count = (k) => (k === 'all' ? docs.length : docs.filter((d) => d.type === k).length);
    chips.replaceChildren(...['all', 'invoice', 'receipt', 'quote'].map((k) => h('button', {
      type: 'button', class: `chip${type === k ? ' on' : ''}`, 'aria-pressed': String(type === k),
      onclick: () => { type = k; status = 'all'; remember('iv-type', k); drawChips(); drawStatus(); draw(); },
    }, k === 'all' ? 'الكل' : IV.types[k].plural, h('span', { class: 'n' }, count(k)))));
  }
  function drawStatus() {
    const keys = type === 'all' ? Object.keys(IV.status) : IV.statusOf[type];
    const ofType = docs.filter((d) => type === 'all' || d.type === type);
    const n = (k) => (k === 'overdue' ? ofType.filter(ivOverdue).length : ofType.filter((d) => d.status === k).length);
    const options = [{ value: 'all', label: 'كل الحالات', hint: `${ofType.length}` },
      ...keys.map((k) => ({ value: k, label: IV.status[k], tone: k, hint: `${n(k)}`, disabled: !n(k) && status !== k })),
      ...(type === 'all' || type === 'invoice' ? [{ value: 'overdue', label: 'متأخرة عن الاستحقاق', tone: 'late', hint: `${n('overdue')}`, disabled: !n('overdue') }] : [])];
    statusBox.replaceChildren(ivDrop({ value: status, label: 'الحالة', options, onChange: (v) => { status = v; draw(); } }));
  }
  const act = async (btn, path, okText) => {
    btn.disabled = true;
    try { const r = await api('POST', path); ivState.docs = r.docs; toast(okText); ivList(view); } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  };
  const remove = async (d, btn) => {
    const linked = docs.filter((r) => r.type === 'receipt' && r.invoiceId === d.id).length;
    const more = linked ? `\nإيصالاتها (${linked}) تبقى محفوظة لكنها لن تعود مرتبطة بها.` : '';
    if (!confirm(`حذف ${IV.types[d.type].name} ${d.number}؟ لا يمكن التراجع عن الحذف.${more}`)) return;
    btn.disabled = true;
    try { const r = await api('DELETE', `/invoices/${d.id}`); ivState.docs = r.docs; toast('حُذف المستند'); ivList(view); } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  };
  const rowFor = (d) => {
    const open = d.type === 'invoice' && d.balance > 0 && d.status !== 'cancelled' && d.status !== 'draft';
    const late = ivOverdue(d);
    const quick = open ? h('a', { class: 'btn btn-small', href: `#/invoices/new/receipt/${d.id}`, title: 'سجّل دفعة على هذه الفاتورة' }, '+ إيصال')
      : d.type === 'quote' && d.status !== 'rejected' ? h('a', { class: 'btn btn-small btn-ghost', href: `#/invoices/new/invoice/${d.id}`, title: 'فاتورة بنفس البنود' }, '← فاتورة')
        : null;
    return h('div', { class: `ivx-row ivx-${d.type}${late ? ' is-late' : ''}` },
      h('a', { class: 'ivx-main', href: `#/invoices/${d.id}` },
        h('span', { class: 'ivx-type' }, IV.types[d.type].name),
        h('b', { class: 'ivx-no ltr' }, d.number),
        h('span', { class: 'ivx-client' }, ivClientName(d), d.client.name && d.client.company ? h('small', null, ` · ${d.client.company}`) : null),
        h('span', { class: 'ivx-date muted small' }, InvoiceDoc.dateText(d.issueDate, 'ar'))),
      h('span', { class: 'ivx-amount' }, h('b', null, ivMoney(d.total, d.currency)),
        d.type === 'invoice' && d.paid > 0 && d.balance > 0 ? h('small', null, `المتبقي ${ivMoney(d.balance, d.currency)}`) : null),
      h('span', { class: 'ivx-sts' }, h('span', { class: `ivx-st st-${d.status}` }, IV.status[d.status] || d.status),
        late ? h('span', { class: 'ivx-st st-late', title: `كان الاستحقاق ${InvoiceDoc.dateText(d.dueDate, 'ar')}` }, `متأخرة ${ivDaysBetween(d.dueDate, ivToday())} يوم`) : null),
      h('span', { class: 'ivx-acts' }, quick, ivMenu(`خيارات ${d.number}`, [
        { icon: '✎', label: 'فتح وتعديل', href: `#/invoices/${d.id}` },
        d.token ? { icon: '⧉', label: 'نسخ رابط العميل', onClick: () => ivCopy(ivLink(d), 'نُسخ الرابط') } : null,
        d.token ? { icon: '↗', label: 'فتح صفحة العميل', href: ivLink(d), external: true } : null,
        '-',
        open ? { icon: '✓', label: 'علّمها كمدفوعة بالكامل', onClick: (btn) => act(btn, `/invoices/${d.id}/paid`, `علّمنا ${d.number} كمدفوعة`) } : null,
        open ? { icon: '+', label: 'إيصال دفعة عليها', href: `#/invoices/new/receipt/${d.id}` } : null,
        d.type === 'quote' ? { icon: '←', label: 'تحويل إلى فاتورة', href: `#/invoices/new/invoice/${d.id}` } : null,
        { icon: '⎘', label: 'نسخة جديدة بنفس البيانات', href: `#/invoices/new/${d.type}/${d.id}` },
        '-',
        { icon: '✕', label: 'حذف', danger: true, onClick: (btn) => remove(d, btn) },
      ])));
  };
  function draw() {
    const q = search.value.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const shown = docs.filter((d) => (type === 'all' || d.type === type)
      && (status === 'all' || (status === 'overdue' ? ivOverdue(d) : d.status === status))
      && (!q || [d.number, d.client.name, d.client.company, d.client.email].join(' ').toLowerCase().includes(q)
        || (digits.length >= 3 && d.client.phone.replace(/\D/g, '').includes(digits)))).sort(IV_SORTS[sort].fn);
    list.replaceChildren(...(shown.length ? shown.map(rowFor)
      : [h('p', { class: 'empty' }, docs.length ? 'لا مستندات تطابق البحث أو الفلتر.' : 'لا فواتير بعد. أنشئ أول فاتورة أو عرض سعر من الأزرار في الأعلى — يُعطى الرقم تلقائياً، وتحصل كل وثيقة على رابط خاص ترسله للعميل.')]));
  }

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'INVOICES'),
      h('h1', null, 'الفواتير والإيصالات'),
      h('p', null, 'فواتير وإيصالات استلام وعروض أسعار بهوية PuzzleX، بالعربية أو الإنجليزية. نزّلها PDF أو أرسل رابطها للعميل على واتساب أو البريد؛ يفتحها العميل وينزّلها بنفسه.')),
      h('div', { class: 'row ivx-new' },
        ...['invoice', 'receipt', 'quote'].map((k, i) => h('a', { class: `btn${i ? '' : ' btn-primary'}`, href: `#/invoices/new/${k}` }, IV.types[k].add)),
        h('a', { class: 'btn btn-ghost', href: '#/invoices/profile' }, '⚙ بيانات الشركة'))),
    summary,
    h('div', { class: 'tm-tools ivx-tools' }, chips, statusBox, sortBox, h('span', { class: 'spacer' }), search),
    list);
  drawSummary(); drawChips(); drawStatus(); draw();
}

/* ---------- the editor, with the sheet beside it ---------- */
function ivEditor(view, d, base, opts = {}) {
  const isNew = !d.id;
  let saved = base ? clone(base) : clone(d); // a redraw keeps what was last saved
  const T = IV.types[d.type];
  const p = ivState.profile;
  const paper = h('div', { class: 'ivx-paper' });
  const previewBox = h('div', { class: 'ivx-preview', 'aria-label': 'معاينة المستند' }, paper);
  let sheet = null;
  // drawn again (currency, linked invoice): same place on the page
  const redraw = () => { const y = window.scrollY; ivEditor(view, d, saved, opts); window.scrollTo(0, y); };

  const computed = () => {
    const t = ivTotals(d, ivState.docs);
    const inv = d.invoiceId && ivState.docs.find((x) => x.id === d.invoiceId);
    return { ...d, ...t, status: ivStatus(d, t), number: d.number || `${T.prefix}-${d.issueDate.slice(0, 4)}-····`, invoiceNumber: inv ? inv.number : d.invoiceNumber || '' };
  };
  const fit = () => {
    if (!sheet) return;
    const scale = Math.min(1, previewBox.clientWidth / 794);
    sheet.style.transform = `scale(${scale})`;
    paper.style.height = `${sheet.offsetHeight * scale}px`;
  };
  const totalsLine = h('b', { class: 'ivx-total-line' });
  function preview() {
    const c = computed();
    sheet = InvoiceDoc.render(c, p, { watermark: d.id ? '' : (d.lang === 'en' ? 'DRAFT' : 'مسودة') });
    paper.replaceChildren(sheet);
    fit();
    totalsLine.textContent = `الإجمالي: ${ivMoney(c.total, d.currency)}`;
    return c;
  }
  if (ivRO) ivRO.disconnect();
  ivRO = new ResizeObserver(fit);
  ivRO.observe(previewBox);
  const checks = []; // warnings under fields, refreshed on every change
  let shownStatus = null;
  const changed = () => {
    const c = preview();
    for (const f of checks) f(c);
    if (d.type === 'invoice' && c.status !== shownStatus) drawStatus();
    refreshBar();
  };

  // what the server would refuse, caught here with the field in front of the user
  const problem = () => {
    const ask = (msg, el) => { if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return msg; };
    if (!d.client.name.trim() && !d.client.company.trim()) return ask(d.type === 'receipt' ? 'اكتب اسم من استلمنا منه المبلغ' : 'اكتب اسم العميل أو شركته', nameInput);
    if (d.client.email.trim() && !ivEmail.test(d.client.email.trim())) return ask('بريد العميل غير صالح', emailInput);
    if (d.type === 'receipt' && !ivNum(d.amount)) return ask('اكتب المبلغ المستلم', amountInput);
    if (d.type !== 'receipt' && !d.items.some((it) => it.desc.trim() || ivNum(it.price))) return ask('أضف بنداً واحداً على الأقل (وصف أو سعر)', itemsBox.querySelector('textarea'));
    if (d.type !== 'receipt' && d.dueDate && d.dueDate < d.issueDate) return ask(`${d.type === 'quote' ? '«صالح حتى»' : 'تاريخ الاستحقاق'} قبل تاريخ الإصدار`, dueInput);
    return '';
  };
  const save = async () => {
    const bad = problem();
    if (bad) throw new Error(bad);
    const r = isNew ? await api('POST', '/invoices', d) : await api('PUT', `/invoices/${d.id}`, d);
    ivState.docs = r.docs;
    saved = clone(r.doc);
    if (isNew) { setPending(null); history.replaceState(null, '', `#/invoices/${r.doc.id}`); }
    ivEditor(view, clone(r.doc));
  };
  setPending({
    label: isNew ? `${T.name} جديدة` : d.number,
    // a copy is unsaved from the start; a blank new one only once something is typed
    count: () => (isNew && opts.copy ? 1 : same(d, saved) ? 0 : 1),
    discard: () => { if (isNew) { setPending(null); location.hash = '#/invoices'; return; } ivEditor(view, clone(saved)); },
    save,
  });
  const saveDoc = async (btn) => {
    if (!isNew && !dirty()) { toast('لا تغييرات للحفظ'); return; }
    try {
      await busy(btn, save);
      refreshBar();
      toast(isNew ? 'حُفظ وأُعطي رقماً ورابطاً للعميل' : 'تم الحفظ');
    } catch (err) { toast(err.message, 'err'); }
  };

  // fields
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  const box = (label, input, hint) => h('div', { class: 'field' }, h('span', null, label), input, hint || null); // for dropdowns: a <label> would click the button twice
  const text = (obj, key, props = {}) => h(props.rows ? 'textarea' : 'input', {
    value: obj[key] ?? '', dir: props.dir || 'auto', rows: props.rows, type: props.type, inputmode: props.inputmode, placeholder: props.placeholder, autocomplete: 'off',
    oninput: (e) => { obj[key] = e.target.value; if (props.after) props.after(e); changed(); },
  });
  const money = (obj, key, after) => h('input', {
    value: obj[key], dir: 'ltr', inputmode: 'decimal', autocomplete: 'off', onfocus: (e) => e.target.select(),
    oninput: (e) => { obj[key] = ivNum(e.target.value); if (after) after(e); changed(); },
    onblur: (e) => { if (String(ivNum(e.target.value)) !== e.target.value.trim()) e.target.value = obj[key]; },
  });
  const warning = (test) => { const w = h('span', { class: 'hint warn', role: 'status' }); const f = (c) => { w.textContent = test(c) || ''; }; checks.push(f); return w; };

  // the client, or pick one from earlier documents (newest details first)
  const clients = new Map();
  for (const x of ivState.docs) {
    const k = `${x.client.name}|${x.client.company}`.toLowerCase();
    if (ivClientName(x) !== '—' && !clients.has(k)) clients.set(k, x.client);
  }
  const clientBox = h('div', { class: 'grid' });
  let nameInput = null, emailInput = null;
  const drawClient = () => {
    nameInput = text(d.client, 'name');
    emailInput = text(d.client, 'email', { dir: 'ltr', type: 'email', placeholder: 'client@example.com' });
    clientBox.replaceChildren(
      clients.size ? box('عميل سابق', ivDrop({
        value: '', label: 'اختيار عميل سابق', placeholder: `اختر من عملائك (${clients.size}) لتعبئة البيانات…`, search: 'ابحث بالاسم أو الشركة أو الهاتف…',
        options: [...clients].map(([k, c]) => ({ value: k, label: c.name || c.company, hint: [c.name ? c.company : '', c.phone, c.email].filter(Boolean).join(' · '), keys: c.phone })),
        onChange: (k) => { d.client = { ...d.client, ...clone(clients.get(k)) }; drawClient(); changed(); toast(`عُبّئت بيانات ${ivClientName(d)}`); },
      })) :'',
      h('div', { class: 'two' },
        field(d.type === 'receipt' ? 'الاسم' : 'اسم العميل', nameInput),
        field('الشركة', text(d.client, 'company'))),
      h('div', { class: 'two' },
        field('الهاتف / واتساب', text(d.client, 'phone', { dir: 'ltr', type: 'tel', placeholder: '+971 50 000 0000' }), 'مع رمز الدولة ليعمل زر واتساب.'),
        field('البريد الإلكتروني', emailInput)),
      h('div', { class: 'two' },
        field('العنوان', text(d.client, 'address', { rows: 2 })),
        field('الرقم الضريبي للعميل (اختياري)', text(d.client, 'taxNo', { dir: 'ltr' }))));
  };
  drawClient();

  // line items
  const itemsBox = h('div', { class: 'ivx-items' });
  const drawItems = () => itemsBox.replaceChildren(
    ...d.items.map((it, i) => {
      const line = h('b', { class: 'ivx-line' });
      const showLine = () => { line.textContent = ivMoney(Math.round(ivNum(it.qty) * ivNum(it.price) * 1000) / 1000, d.currency); };
      showLine();
      const num = (key, label) => h('label', { class: `field ivx-n ivx-${key}` }, h('span', null, label), money(it, key, showLine));
      const move = (to) => { [d.items[to], d.items[i]] = [d.items[i], d.items[to]]; drawItems(); changed(); };
      return h('div', { class: 'ivx-item' },
        h('span', { class: 'tag' }, i + 1),
        h('label', { class: 'field ivx-desc' }, h('span', null, 'الوصف'), h('textarea', { rows: 1, dir: 'auto', value: it.desc, placeholder: 'مثال: تصميم هوية بصرية كاملة', oninput: (e) => { it.desc = e.target.value; changed(); } })),
        num('qty', 'الكمية'), num('price', `سعر الوحدة (${d.currency})`),
        h('div', { class: 'ivx-item-end' }, line, h('span', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => move(i - 1) }, '↑'),
          h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === d.items.length - 1, onclick: () => move(i + 1) }, '↓'),
          h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تكرار البند', 'aria-label': 'تكرار البند', disabled: d.items.length >= 200, onclick: () => { d.items.splice(i + 1, 0, clone(it)); drawItems(); changed(); } }, '⎘'),
          h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف البند', 'aria-label': 'حذف البند', disabled: d.items.length === 1, onclick: () => { d.items.splice(i, 1); drawItems(); changed(); } }, '✕'))));
    }),
    h('button', { type: 'button', class: 'btn btn-ghost ivx-add', disabled: d.items.length >= 200, onclick: () => { d.items.push({ desc: '', qty: 1, price: 0 }); drawItems(); changed(); [...itemsBox.querySelectorAll('.ivx-item textarea')].pop()?.focus(); } }, '+ بند جديد'));
  if (d.type !== 'receipt') drawItems();

  // a language switch also swaps the default notes, when they weren't changed
  const swapDefaults = () => {
    const en = d.lang === 'en';
    if (d.notes === (en ? p.notesAr : p.notesEn)) d.notes = en ? p.notesEn : p.notesAr;
    if (d.terms === (en ? p.termsAr : p.termsEn)) d.terms = en ? p.termsEn : p.termsAr;
    notesCard.replaceWith(notesCard = drawNotes());
  };
  const drawNotes = () => h('div', { class: 'card grid' }, h('h2', null, d.type === 'receipt' ? 'الوصف' : 'ملاحظات وشروط'),
    field(d.type === 'receipt' ? 'وذلك عن' : 'ملاحظات تظهر في المستند', text(d, 'notes', { rows: 3, placeholder: d.type === 'receipt' ? 'مثال: الدفعة الأولى من مشروع الهوية البصرية' : '' })),
    d.type === 'receipt' ? null : field('الشروط / طريقة الدفع', text(d, 'terms', { rows: 3 }), 'بيانات البنك تُضاف تلقائياً من «بيانات الشركة».'));
  let notesCard = drawNotes();

  // the status: an invoice's «paid» comes from its payments, so it is shown, not picked
  const statusBox = h('div', { class: 'field' });
  function drawStatus() {
    const c = computed();
    shownStatus = c.status;
    const auto = d.type === 'invoice' && (c.status === 'paid' || c.status === 'partial');
    const keys = d.type === 'invoice' ? ['draft', 'sent', 'cancelled'] : IV.statusOf[d.type];
    const options = keys.map((k) => (auto && k === 'sent'
      ? { value: k, label: `${IV.status[c.status]} (من الدفعات)`, tone: c.status }
      : { value: k, label: IV.status[k], tone: k }));
    const value = d.status === 'paid' || d.status === 'partial' ? 'sent' : d.status;
    statusBox.replaceChildren(h('span', null, 'الحالة'),
      ivDrop({ value, options, label: 'الحالة', onChange: (v) => { d.status = v; changed(); } }),
      d.type === 'invoice' ? h('span', { class: 'hint' }, auto ? 'تتبع الدفعات المسجّلة تلقائياً.' : 'تصبح «مدفوعة» تلقائياً عند تسجيل الدفعات.') : '');
  }
  drawStatus();

  // dates: moving the issue date moves the due date with it, keeping the same number of days
  const dueLabel = d.type === 'quote' ? 'صالح حتى' : 'تاريخ الاستحقاق';
  const dueInput = d.type === 'receipt' ? null : ivDate({ value: d.dueDate, label: dueLabel, clearable: true, onChange: (v) => { d.dueDate = v; changed(); } });
  const issueInput = ivDate({ value: d.issueDate, label: 'تاريخ الإصدار', onChange: (v) => {
    if (dueInput && d.dueDate && d.issueDate) { d.dueDate = ivPlusDays(d.dueDate, ivDaysBetween(d.issueDate, v)); dueInput.setValue(d.dueDate); }
    d.issueDate = v;
    changed();
  } });
  const dueTerms = d.type === 'receipt' ? null : h('div', { class: 'row ivx-terms' }, ...(d.type === 'quote' ? [7, 15, 30] : [0, 7, 14, 30]).map((n) => h('button', {
    type: 'button', class: 'chip', onclick: () => { d.dueDate = ivPlusDays(d.issueDate || ivToday(), n); dueInput.setValue(d.dueDate); changed(); },
  }, n ? `${n} يوم` : 'عند الاستلام')));

  const settingsCard = h('div', { class: 'card grid' }, h('h2', null, 'البيانات الأساسية'),
    h('div', { class: 'three' },
      box('لغة المستند', ivDrop({ value: d.lang, label: 'لغة المستند', options: [{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }], onChange: (v) => { d.lang = v; swapDefaults(); changed(); } })),
      box('العملة', ivCurrencyDrop(d.currency, (v) => { d.currency = v; redraw(); }, Boolean(d.type === 'receipt' && d.invoiceId)),
        d.type === 'receipt' && d.invoiceId ? h('span', { class: 'hint' }, 'عملة الفاتورة المرتبطة.') : null),
      statusBox),
    h('div', { class: 'two' },
      box('تاريخ الإصدار', issueInput),
      d.type === 'receipt' ? null : h('div', { class: 'field' }, h('span', null, dueLabel), dueInput, dueTerms,
        warning(() => (d.dueDate && d.issueDate && d.dueDate < d.issueDate ? 'التاريخ قبل تاريخ الإصدار.' : '')))));

  // a receipt: how much, how, and (optionally) which invoice it pays
  const inv = d.type === 'receipt' ? ivState.docs.filter((x) => x.type === 'invoice' && x.status !== 'cancelled' && (x.balance > 0 || x.id === d.invoiceId)) : [];
  const amountInput = d.type === 'receipt' ? money(d, 'amount') : null;
  const linked = () => d.invoiceId && ivState.docs.find((x) => x.id === d.invoiceId);
  // what is still owed on the linked invoice, not counting this receipt's own saved amount
  const owedBefore = () => {
    const x = linked();
    if (!x) return null;
    const mine = saved.id && saved.invoiceId === x.id && saved.status !== 'cancelled' ? ivNum(saved.amount) : 0;
    return x.balance + mine;
  };
  const receiptCard = d.type === 'receipt' ? h('div', { class: 'card grid' }, h('h2', null, 'الدفعة'),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', null, `المبلغ المستلم (${d.currency})`), amountInput,
        warning(() => { const o = owedBefore(); return o != null && ivNum(d.amount) > o + 1e-9 ? `أكبر من المتبقي على الفاتورة (${ivMoney(o, d.currency)}).` : ''; })),
      box('طريقة الدفع', ivDrop({ value: d.method, label: 'طريقة الدفع', options: Object.entries(IV.methods).map(([v, l]) => ({ value: v, label: l })), onChange: (v) => { d.method = v; changed(); } }))),
    h('div', { class: 'two' },
      box('عن الفاتورة (اختياري)', ivDrop({
        value: d.invoiceId, label: 'عن الفاتورة', search: inv.length > 5 ? 'ابحث برقم الفاتورة أو العميل…' : false,
        options: [{ value: '', label: '— بدون فاتورة —' }, ...inv.map((x) => ({ value: x.id, label: `${x.number} · ${ivClientName(x)}`, hint: `المتبقي ${ivMoney(x.balance, x.currency)} من ${ivMoney(x.total, x.currency)}`, keys: x.client.company }))],
        onChange: (v) => {
          d.invoiceId = v;
          const x = linked();
          if (x) {
            d.currency = x.currency;
            if (!d.client.name && !d.client.company) d.client = clone(x.client);
            if (!ivNum(d.amount)) d.amount = owedBefore();
          }
          redraw();
        },
      }), h('span', { class: 'hint' }, 'تُسجَّل الدفعة على الفاتورة وتتغيّر حالتها تلقائياً.')),
      field('رقم المرجع (اختياري)', text(d, 'reference', { dir: 'ltr', placeholder: 'رقم الحوالة أو الشيك' })))) : null;

  const moneyCard = d.type === 'receipt' ? null : h('div', { class: 'card grid' }, h('h2', null, 'الخصم والضريبة'),
    h('div', { class: 'three' },
      box('نوع الخصم', ivDrop({ value: d.discountType, label: 'نوع الخصم', options: [{ value: 'amount', label: `مبلغ (${d.currency})` }, { value: 'percent', label: 'نسبة %' }], onChange: (v) => { d.discountType = v; changed(); } })),
      h('label', { class: 'field' }, h('span', null, 'الخصم'), money(d, 'discount'),
        warning((c) => (d.discountType === 'percent' ? (ivNum(d.discount) > 100 ? 'النسبة 100% على الأكثر.' : '') : ivNum(d.discount) > c.subtotal && c.subtotal > 0 ? 'الخصم أكبر من المجموع؛ سيُحسب بقدر المجموع.' : ''))),
      h('label', { class: 'field' }, h('span', null, 'الضريبة %'), money(d, 'taxRate', (e) => { if (d.taxRate > 100) { d.taxRate = 100; e.target.value = 100; } }))),
    d.type === 'invoice' ? field(`مدفوع خارج الإيصالات (${d.currency})`, money(d, 'paidManual'),
      'دفعة قديمة أو مسجّلة في مكان آخر. الإيصالات المرتبطة بهذه الفاتورة تُحسب تلقائياً.') : null);

  // print the sheet as it is now (also before saving): the browser's «Save as PDF»
  const printNow = () => {
    const bad = d.id ? '' : problem();
    if (bad) { toast(bad, 'err'); return; }
    const box2 = h('div', { id: 'ivd-print' }, InvoiceDoc.render(computed(), p, { watermark: d.id ? '' : (d.lang === 'en' ? 'DRAFT' : 'مسودة') }));
    document.body.append(box2);
    document.body.classList.add('ivd-printing');
    const title = document.title;
    const done = () => { box2.remove(); document.body.classList.remove('ivd-printing'); document.title = title; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    document.title = `${d.number || T.name} — ${ivClientName(d)}`; // the PDF's file name
    window.print();
    setTimeout(done, 1500);
  };

  const shareCard = d.id ? ivShareCard(d, () => same(d, saved), (doc) => ivEditor(view, clone(doc))) : h('div', { class: 'card ivx-share muted' }, 'احفظ المستند أولاً ليُعطى رقماً ورابطاً خاصاً ترسله للعميل.');

  const remove = async (btn) => {
    const n = ivState.docs.filter((r) => r.type === 'receipt' && r.invoiceId === d.id).length;
    if (!confirm(`حذف ${T.name} ${d.number}؟ لا يمكن التراجع عن الحذف.${n ? `\nإيصالاتها (${n}) تبقى محفوظة لكنها لن تعود مرتبطة بها.` : ''}`)) return;
    try { const r = await busy(btn, () => api('DELETE', `/invoices/${d.id}`)); ivState.docs = r.docs; setPending(null); toast('حُذف المستند'); location.hash = '#/invoices'; } catch (err) { toast(err.message, 'err'); }
  };
  const back = (e) => { if (dirty() && !confirm('لديك تغييرات غير محفوظة. المغادرة بدون حفظ؟')) e.preventDefault(); else setPending(null); };
  const open = d.id && d.type === 'invoice' && d.balance > 0 && d.status !== 'cancelled';

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, T.prefix),
      h('h1', null, d.id ? `${T.name} ${d.number}` : `${T.name} جديدة`),
      h('p', null, h('a', { href: '#/invoices', onclick: back }, '→ كل المستندات'), ' · ', totalsLine)),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => saveDoc(e.currentTarget) }, isNew ? 'حفظ وإعطاء رقم' : 'حفظ'),
        h('button', { type: 'button', class: 'btn', onclick: printNow }, '⤓ تنزيل PDF'),
        d.id ? ivMenu('خيارات أخرى', [
          open ? { icon: '+', label: 'إيصال دفعة على هذه الفاتورة', href: `#/invoices/new/receipt/${d.id}` } : null,
          d.type === 'quote' ? { icon: '←', label: 'تحويل إلى فاتورة', href: `#/invoices/new/invoice/${d.id}` } : null,
          { icon: '⎘', label: 'نسخة جديدة بنفس البيانات', href: `#/invoices/new/${d.type}/${d.id}` },
          '-',
          { icon: '✕', label: 'حذف المستند', danger: true, onClick: (btn) => remove(btn) },
        ]) : null)),
    h('div', { class: 'ivx-editor' },
      h('div', { class: 'ivx-form' },
        shareCard,
        settingsCard,
        h('div', { class: 'card grid' }, h('h2', null, d.type === 'receipt' ? 'استلمنا من' : 'العميل'), clientBox),
        receiptCard,
        d.type === 'receipt' ? null : h('div', { class: 'card grid' }, h('h2', null, 'البنود'), itemsBox),
        moneyCard,
        notesCard),
      h('div', { class: 'ivx-side' }, h('p', { class: 'hint' }, 'معاينة مباشرة — هكذا يظهر PDF للعميل'), previewBox)));
  changed();
}

// sending: the private link, WhatsApp, email (from this device, or from the server when SMTP is set)
function ivShareCard(d, isSaved, reopen) {
  const en = d.lang === 'en';
  const kind = InvoiceDoc.labels[en ? 'en' : 'ar'][d.type];
  const company = en ? ivState.profile.nameEn : ivState.profile.nameAr;
  const who = ivClientName(d);
  const message = () => (en
    ? `Hello ${who},\nPlease find your ${kind.toLowerCase()} ${d.number} for ${InvoiceDoc.money(d.total, d.currency, 'en')}.\nYou can view and download it as a PDF here:\n${ivLink(d)}\n\nThank you — ${company}`
    : `مرحباً ${who}،\nمرفق ${kind} رقم ${d.number} بقيمة ${InvoiceDoc.money(d.total, d.currency, 'ar')}.\nيمكنكم عرضها وتنزيلها بصيغة PDF من الرابط:\n${ivLink(d)}\n\nشكراً لكم — ${company}`);
  const unsaved = () => { if (isSaved()) return false; toast('احفظ التغييرات أولاً ليرى العميل النسخة الأخيرة', 'err'); return true; };
  const raw = d.client.phone.replace(/[^\d+]/g, '');
  const phone = raw.replace(/^\+/, '').replace(/^00/, '');
  const phoneOk = !raw || (/^(\+|00)/.test(raw) || !/^0/.test(raw)) && phone.length >= 8;
  const markSent = async () => {
    if (d.status !== 'draft') return;
    try { const r = await api('PUT', `/invoices/${d.id}`, { ...d, status: 'sent' }); ivState.docs = r.docs; reopen(r.doc); } catch { /* the link still went out */ }
  };
  const copy = () => { if (!unsaved()) ivCopy(ivLink(d), 'نُسخ الرابط'); };
  const copyMessage = () => { if (!unsaved()) ivCopy(message(), 'نُسخت الرسالة مع الرابط'); };
  const wa = () => {
    if (unsaved()) return;
    if (!phoneOk) { toast('رقم الهاتف يحتاج رمز الدولة، مثل ‎+971 50 000 0000‎ — عدّله واحفظ', 'err'); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message())}`, '_blank', 'noopener');
    markSent();
  };
  const mailto = () => {
    if (unsaved()) return;
    location.href = `mailto:${encodeURIComponent(d.client.email)}?subject=${encodeURIComponent(`${kind} ${d.number} — ${company}`)}&body=${encodeURIComponent(message())}`;
    markSent();
  };
  const serverMail = async (btn) => {
    if (unsaved()) return;
    const to = (prompt('أرسل الرابط إلى البريد:', d.client.email) || '').trim();
    if (!to) return;
    if (!ivEmail.test(to)) { toast('البريد غير صالح', 'err'); return; }
    try { const r = await busy(btn, () => api('POST', `/invoices/${d.id}/email`, { to })); ivState.docs = r.docs; toast(`أُرسل إلى ${to}`); reopen(r.docs.find((x) => x.id === d.id)); } catch (err) { toast(err.message, 'err'); }
  };
  const renew = async (btn) => {
    if (!confirm('رابط جديد؟ الرابط القديم يتوقف عن العمل فوراً لمن أرسلته إليه.')) return;
    btn.disabled = true;
    try { const r = await api('POST', `/invoices/${d.id}/token`); ivState.docs = r.docs; toast('أُنشئ رابط جديد'); reopen(r.doc); } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  };
  return h('div', { class: 'card ivx-share' },
    h('div', { class: 'ivx-share-head' }, h('h2', null, 'أرسل للعميل'), h('span', { class: 'row' },
      d.sentAt ? h('span', { class: 'muted small' }, `أُرسل بالبريد ${fmtDate(d.sentAt)}`) : null,
      h('span', { class: `ivx-st st-${d.status}` }, IV.status[d.status]))),
    h('div', { class: 'ivx-link' }, h('input', { value: ivLink(d), readonly: true, dir: 'ltr', 'aria-label': 'رابط المستند', onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', class: 'btn btn-small', onclick: copy }, 'نسخ'),
      h('a', { class: 'btn btn-small btn-ghost', href: ivLink(d), target: '_blank', rel: 'noopener' }, 'فتح ↗')),
    h('div', { class: 'row ivx-send' },
      h('button', { type: 'button', class: 'btn ivx-wa', onclick: wa, title: phone ? `إلى ${d.client.phone}` : 'تختار المحادثة في واتساب' }, 'واتساب', phone ? null : h('small', null, ' (اختر المحادثة)')),
      d.client.email ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: mailto }, 'بريد من جهازي') : null,
      ivState.mail ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: (e) => serverMail(e.currentTarget) }, 'إرسال من الموقع') : null,
      h('span', { class: 'spacer' }),
      ivMenu('خيارات الرابط', [
        { icon: '⧉', label: 'نسخ الرسالة كاملة مع الرابط', onClick: copyMessage },
        d.client.email ? null : { icon: '✉', label: 'بريد من جهازي', onClick: mailto },
        '-',
        { icon: '↻', label: 'رابط جديد (يوقف القديم)', onClick: (btn) => renew(btn) },
      ])),
    phoneOk ? null : h('p', { class: 'hint warn' }, 'رقم الهاتف بدون رمز الدولة؛ واتساب لن يجده. اكتبه مثل ‎+971 50 000 0000‎.'),
    h('p', { class: 'hint' }, 'الرابط خاص: لا يظهر في محركات البحث، ويفتح المستند للقراءة فقط مع زر «تنزيل PDF».'));
}

/* ---------- the company details printed on every document ---------- */
function ivProfile(view) {
  const saved = clone(ivState.profile);
  const p = clone(ivState.profile);
  setPending({
    label: 'بيانات الشركة',
    count: () => (same(p, saved) ? 0 : 1),
    discard: () => ivProfile(view),
    save: async () => {
      if (p.email && !ivEmail.test(p.email.trim())) throw new Error('البريد الإلكتروني غير صالح');
      const r = await api('PUT', '/invoices/profile', { rev: ivState.rev, profile: p });
      ivState.profile = r.profile; ivState.rev = r.rev;
      ivProfile(view);
    },
  });
  const changed = () => refreshBar();
  const field = (label, key, props = {}) => h('label', { class: 'field' }, h('span', null, label),
    h(props.rows ? 'textarea' : 'input', { value: p[key] ?? '', dir: props.dir || 'auto', rows: props.rows, inputmode: props.inputmode, oninput: (e) => { p[key] = props.number ? Math.min(100, ivNum(e.target.value)) : e.target.value; changed(); } }),
    props.hint ? h('span', { class: 'hint' }, props.hint) : null);
  const imageBox = (key, label, maxSide, fallback) => {
    const box = h('div', { class: 'logo-pick' });
    const draw = () => box.replaceChildren(
      h('div', { class: 'logo-box' }, p[key] ? h('img', { src: p[key], alt: label }) : h('span', { class: 'muted small' }, 'لا صورة')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => pickFiles(false, async ([f]) => { try { toast('جارٍ رفع الصورة…'); p[key] = await upload(f, maxSide); draw(); changed(); } catch (err) { toast(err.message, 'err'); } }) }, 'رفع صورة'),
        p[key] && p[key] !== fallback ? h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => { p[key] = fallback; draw(); changed(); } }, fallback ? 'الشعار الافتراضي' : 'إزالة') : null));
    draw();
    return h('div', { class: 'field' }, h('span', null, label), box);
  };
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'COMPANY'),
      h('h1', null, 'بيانات الشركة على المستندات'),
      h('p', null, h('a', { href: '#/invoices', onclick: (e) => { if (dirty() && !confirm('لديك تغييرات غير محفوظة. المغادرة بدون حفظ؟')) e.preventDefault(); else setPending(null); } }, '→ كل المستندات'), ' · تظهر في رأس وتذييل كل فاتورة وإيصال وعرض سعر.'))),
    h('div', { class: 'editor' },
      h('div', { class: 'card' }, h('h2', null, 'الاسم والعنوان'),
        h('div', { class: 'pair' }, field('اسم الشركة — بالعربية', 'nameAr'), field('Company name — English', 'nameEn', { dir: 'ltr' })),
        h('div', { class: 'pair' }, field('العنوان — بالعربية', 'addressAr', { rows: 2 }), field('Address — English', 'addressEn', { rows: 2, dir: 'ltr' }))),
      h('div', { class: 'card' }, h('h2', null, 'التواصل والسجل'),
        h('div', { class: 'two' }, field('الهاتف', 'phone', { dir: 'ltr' }), field('البريد', 'email', { dir: 'ltr' })),
        h('div', { class: 'two' }, field('الموقع', 'website', { dir: 'ltr' }), field('الرقم الضريبي / السجل التجاري', 'taxNo', { dir: 'ltr' }))),
      h('div', { class: 'card' }, h('h2', null, 'الدفع'),
        field('بيانات البنك / طرق الدفع', 'bank', { rows: 4, dir: 'auto', hint: 'تظهر في الفواتير وعروض الأسعار، مثل: اسم البنك، IBAN، اسم الحساب.' }),
        h('div', { class: 'two' },
          h('div', { class: 'field' }, h('span', null, 'العملة الافتراضية'), ivCurrencyDrop(p.currency || 'USD', (v) => { p.currency = v; changed(); })),
          field('نسبة الضريبة الافتراضية %', 'taxRate', { dir: 'ltr', inputmode: 'decimal', number: true }))),
      h('div', { class: 'card' }, h('h2', null, 'النصوص الافتراضية لكل مستند جديد'),
        h('div', { class: 'pair' }, field('ملاحظات — بالعربية', 'notesAr', { rows: 3 }), field('Notes — English', 'notesEn', { rows: 3, dir: 'ltr' })),
        h('div', { class: 'pair' }, field('الشروط — بالعربية', 'termsAr', { rows: 3 }), field('Terms — English', 'termsEn', { rows: 3, dir: 'ltr' }))),
      h('div', { class: 'card' }, h('h2', null, 'الشعار والختم'),
        h('div', { class: 'two' }, imageBox('logo', 'الشعار', 600, '/assets/icon.svg'), imageBox('stamp', 'الختم أو التوقيع (اختياري، PNG شفاف)', 800, '')))));
  refreshBar();
}
