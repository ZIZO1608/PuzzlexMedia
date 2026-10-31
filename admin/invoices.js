/* PuzzleX admin — «الفواتير والإيصالات»: invoices, receipts and quotations (#/invoices).
   Loaded after admin.js and uses its helpers (h, api, toast, setPending, refreshBar, busy, upload, pickFiles…).
   The server (lib/invoices.js) gives the numbers and works out the money; the totals here only feed the live
   preview, drawn by the same invoice-doc.js the client's page uses. «تنزيل PDF» prints that sheet. */
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
  methods: { cash: 'نقداً', bank: 'تحويل بنكي', card: 'بطاقة', transfer: 'حوالة مالية', other: 'أخرى' },
  currencies: ['USD', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EUR', 'TRY', 'SYP', 'EGP', 'JOD'],
};
let ivState = null; // { profile, rev, docs, mail } loaded on entering the section

const ivToday = () => new Date().toISOString().slice(0, 10);
const ivPlusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ivMoney = (v, cur) => InvoiceDoc.money(v, cur, 'ar');
const ivNum = (v) => { const n = Number(String(v ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? n : 0; };

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

async function viewInvoices(view, arg) {
  if (!ivState || !arg) await ivLoad();
  if (!arg) return ivList(view);
  if (arg === 'profile') return ivProfile(view);
  const fresh = arg.match(/^new\/(invoice|receipt|quote)(?:\/(\w+))?$/);
  if (fresh) {
    const d = ivBlank(fresh[1]);
    const from = fresh[2] && ivState.docs.find((x) => x.id === fresh[2]);
    if (from && fresh[1] === 'receipt') {
      // a receipt against an invoice: same client and currency, the balance as the amount
      Object.assign(d, { client: clone(from.client), currency: from.currency, lang: from.lang, invoiceId: from.id, amount: from.balance || from.total });
    } else if (from) {
      // a copy (or a quotation turned into an invoice): everything but the number, dates and status
      Object.assign(d, clone({ ...from, id: '', number: '', token: '', type: fresh[1], status: d.status, issueDate: d.issueDate, dueDate: d.dueDate, invoiceId: '', paidManual: 0 }));
    }
    return ivEditor(view, d);
  }
  const doc = ivState.docs.find((x) => x.id === arg);
  if (!doc) { view.replaceChildren(h('div', { class: 'empty' }, 'المستند غير موجود. ', h('a', { href: '#/invoices' }, 'العودة إلى القائمة'))); return; }
  return ivEditor(view, clone(doc));
}
VIEWS.invoices = viewInvoices;

/* ---------- the list ---------- */
function ivList(view) {
  setPending(null);
  const { docs } = ivState;
  let type = sessionStorage.getItem('iv-type') || 'all';
  let status = 'all';
  const search = h('input', { type: 'search', class: 'tm-search', placeholder: 'ابحث برقم المستند أو اسم العميل…', oninput: () => draw() });
  const list = h('div', { class: 'ivx-list' });
  const summary = h('div', { class: 'ivx-summary' });
  const chips = h('div', { class: 'ivx-chips', role: 'group', 'aria-label': 'نوع المستند' });
  const statusSel = h('select', { class: 'ivx-status-sel', 'aria-label': 'الحالة', onchange: (e) => { status = e.target.value; draw(); } });

  // money per currency: invoiced (not drafts or cancelled), collected, still owed
  function drawSummary() {
    const per = new Map();
    const row = (c) => { if (!per.has(c)) per.set(c, { invoiced: 0, collected: 0, owed: 0, n: 0 }); return per.get(c); };
    for (const d of docs) {
      if (d.status === 'cancelled') continue;
      if (d.type === 'invoice' && d.status !== 'draft') { const r = row(d.currency); r.invoiced += d.total; r.owed += d.balance; r.n++; r.collected += d.paid; }
      if (d.type === 'receipt' && !d.invoiceId) row(d.currency).collected += d.total;
    }
    summary.replaceChildren(...[...per].map(([cur, r]) => h('div', { class: 'card ivx-sum' },
      h('span', { class: 'tag' }, cur),
      h('div', null, h('small', null, 'المفوتَر'), h('b', null, ivMoney(r.invoiced, cur))),
      h('div', null, h('small', null, 'المحصَّل'), h('b', { class: 'ok' }, ivMoney(r.collected, cur))),
      h('div', null, h('small', null, 'المستحق'), h('b', { class: r.owed ? 'warn' : '' }, ivMoney(r.owed, cur))))));
  }
  function drawChips() {
    const count = (k) => (k === 'all' ? docs.length : docs.filter((d) => d.type === k).length);
    chips.replaceChildren(...['all', 'invoice', 'receipt', 'quote'].map((k) => h('button', {
      type: 'button', class: `chip${type === k ? ' on' : ''}`, 'aria-pressed': String(type === k),
      onclick: () => { type = k; status = 'all'; try { sessionStorage.setItem('iv-type', k); } catch { /* fine */ } drawChips(); drawStatus(); draw(); },
    }, k === 'all' ? 'الكل' : IV.types[k].plural, h('span', { class: 'n' }, count(k)))));
  }
  function drawStatus() {
    const keys = type === 'all' ? Object.keys(IV.status) : { invoice: ['draft', 'sent', 'partial', 'paid', 'cancelled'], quote: ['draft', 'sent', 'accepted', 'rejected'], receipt: ['issued', 'cancelled'] }[type];
    statusSel.replaceChildren(h('option', { value: 'all' }, 'كل الحالات'), ...keys.map((k) => h('option', { value: k, selected: status === k }, IV.status[k])));
  }
  const act = async (btn, path, okText) => {
    try { const r = await busy(btn, () => api('POST', path)); ivState.docs = r.docs; toast(okText); ivList(view); } catch (err) { toast(err.message, 'err'); }
  };
  const remove = async (d, btn) => {
    if (!confirm(`حذف ${IV.types[d.type].name} ${d.number}؟ لا يمكن التراجع عن الحذف.`)) return;
    try { const r = await busy(btn, () => api('DELETE', `/invoices/${d.id}`)); ivState.docs = r.docs; toast('حُذف المستند'); ivList(view); } catch (err) { toast(err.message, 'err'); }
  };
  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = docs.filter((d) => (type === 'all' || d.type === type) && (status === 'all' || d.status === status)
      && (!q || [d.number, d.client.name, d.client.company, d.client.phone, d.client.email].join(' ').toLowerCase().includes(q)));
    list.replaceChildren(...(shown.length ? shown.map((d) => h('div', { class: `ivx-row ivx-${d.type}` },
      h('a', { class: 'ivx-main', href: `#/invoices/${d.id}` },
        h('span', { class: 'ivx-type' }, IV.types[d.type].name),
        h('b', { class: 'ivx-no ltr' }, d.number),
        h('span', { class: 'ivx-client' }, ivClientName(d), d.client.name && d.client.company ? h('small', null, ` · ${d.client.company}`) : null),
        h('span', { class: 'ivx-date muted small' }, InvoiceDoc.dateText(d.issueDate, 'ar'))),
      h('span', { class: 'ivx-amount' }, h('b', null, ivMoney(d.total, d.currency)),
        d.type === 'invoice' && d.paid > 0 && d.balance > 0 ? h('small', null, `المتبقي ${ivMoney(d.balance, d.currency)}`) : null),
      h('span', { class: `ivx-st st-${d.status}` }, IV.status[d.status] || d.status),
      h('span', { class: 'ivx-acts' },
        d.type === 'invoice' && d.balance > 0 && d.status !== 'cancelled' ? h('a', { class: 'btn btn-small', href: `#/invoices/new/receipt/${d.id}`, title: 'سجّل دفعة على هذه الفاتورة' }, '+ إيصال') : null,
        d.type === 'invoice' && d.balance > 0 && d.status !== 'cancelled' ? h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: (e) => act(e.currentTarget, `/invoices/${d.id}/paid`, `علّمنا ${d.number} كمدفوعة`) }, '✓ مدفوعة') : null,
        d.type === 'quote' ? h('a', { class: 'btn btn-small btn-ghost', href: `#/invoices/new/invoice/${d.id}`, title: 'فاتورة بنفس البنود' }, '← فاتورة') : null,
        h('a', { class: 'btn btn-icon btn-small', href: `#/invoices/new/${d.type}/${d.id}`, title: 'نسخة جديدة', 'aria-label': 'نسخة جديدة' }, '⧉'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف', 'aria-label': 'حذف', onclick: (e) => remove(d, e.currentTarget) }, '✕'))))
      : [h('p', { class: 'empty' }, docs.length ? 'لا مستندات تطابق البحث.' : 'لا فواتير بعد. أنشئ أول فاتورة أو عرض سعر من الأزرار في الأعلى — يُعطى الرقم تلقائياً، وتحصل كل وثيقة على رابط خاص ترسله للعميل.')]));
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
    h('div', { class: 'tm-tools ivx-tools' }, chips, statusSel, h('span', { class: 'spacer' }), search),
    list);
  drawSummary(); drawChips(); drawStatus(); draw();
}

/* ---------- the editor, with the sheet beside it ---------- */
function ivEditor(view, d, base) {
  const isNew = !d.id;
  let saved = base ? clone(base) : clone(d); // a redraw (another invoice picked) keeps what was last saved
  const T = IV.types[d.type];
  const paper = h('div', { class: 'ivx-paper' });
  const previewBox = h('div', { class: 'ivx-preview', 'aria-label': 'معاينة المستند' }, paper);
  let sheet = null;

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
  function preview() {
    sheet = InvoiceDoc.render(computed(), ivState.profile, { watermark: d.id ? '' : (d.lang === 'en' ? 'DRAFT' : 'مسودة') });
    paper.replaceChildren(sheet);
    fit();
    totalsLine.textContent = `الإجمالي: ${ivMoney(computed().total, d.currency)}`;
  }
  new ResizeObserver(fit).observe(previewBox);
  const changed = () => { preview(); refreshBar(); };

  setPending({
    label: isNew ? `${T.name} جديدة` : d.number,
    count: () => (same(d, saved) ? 0 : 1),
    discard: () => { if (isNew) { location.hash = '#/invoices'; return; } ivEditor(view, clone(saved)); },
    save: async () => {
      const r = isNew ? await api('POST', '/invoices', d) : await api('PUT', `/invoices/${d.id}`, d);
      ivState.docs = r.docs;
      saved = clone(r.doc);
      Object.assign(d, clone(r.doc));
      if (isNew) { setPending(null); history.replaceState(null, '', `#/invoices/${r.doc.id}`); }
      ivEditor(view, clone(r.doc));
    },
  });

  // fields
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  const text = (obj, key, props = {}) => h(props.rows ? 'textarea' : 'input', {
    value: obj[key] ?? '', dir: props.dir || 'auto', rows: props.rows, type: props.type, inputmode: props.inputmode, list: props.list, placeholder: props.placeholder,
    oninput: (e) => { obj[key] = props.number ? e.target.value : e.target.value; if (props.after) props.after(e); changed(); },
  });
  const select = (obj, key, options, after) => h('select', { onchange: (e) => { obj[key] = e.target.value; if (after) after(e); changed(); } },
    options.map(([v, label]) => h('option', { value: v, selected: String(obj[key]) === String(v) }, label)));

  // known clients, from the earlier documents
  const clients = new Map();
  for (const x of ivState.docs) { const k = ivClientName(x); if (k !== '—' && !clients.has(k)) clients.set(k, x.client); }
  const datalist = h('datalist', { id: 'ivx-clients' }, [...clients.keys()].map((k) => h('option', { value: k })));
  const clientBox = h('div', { class: 'grid' });
  const drawClient = () => clientBox.replaceChildren(
    h('div', { class: 'two' },
      field('اسم العميل', text(d.client, 'name', { list: 'ivx-clients', after: (e) => {
        const known = clients.get(e.target.value);
        if (known) { for (const k of Object.keys(d.client)) if (!d.client[k] || k === 'name') d.client[k] = known[k] || d.client[k]; d.client.name = e.target.value; drawClient(); }
      } })),
      field('الشركة', text(d.client, 'company'))),
    h('div', { class: 'two' },
      field('الهاتف / واتساب', text(d.client, 'phone', { dir: 'ltr', type: 'tel', placeholder: '+971 50 000 0000' })),
      field('البريد الإلكتروني', text(d.client, 'email', { dir: 'ltr', type: 'email' }))),
    h('div', { class: 'two' },
      field('العنوان', text(d.client, 'address', { rows: 2 })),
      field('الرقم الضريبي للعميل (اختياري)', text(d.client, 'taxNo', { dir: 'ltr' }))));
  drawClient();

  // line items
  const itemsBox = h('div', { class: 'ivx-items' });
  const drawItems = () => itemsBox.replaceChildren(
    ...d.items.map((it, i) => {
      const line = h('b', { class: 'ivx-line' });
      const showLine = () => { line.textContent = ivMoney(ivNum(it.qty) * ivNum(it.price), d.currency); };
      showLine();
      const num = (key, label) => h('label', { class: 'field ivx-n' }, h('span', null, label), h('input', {
        value: it[key], dir: 'ltr', inputmode: 'decimal', onfocus: (e) => e.target.select(),
        oninput: (e) => { it[key] = ivNum(e.target.value); showLine(); changed(); },
      }));
      return h('div', { class: 'ivx-item' },
        h('span', { class: 'tag' }, i + 1),
        h('label', { class: 'field ivx-desc' }, h('span', null, 'الوصف'), h('textarea', { rows: 1, dir: 'auto', value: it.desc, placeholder: 'مثال: تصميم هوية بصرية كاملة', oninput: (e) => { it.desc = e.target.value; changed(); } })),
        num('qty', 'الكمية'), num('price', 'سعر الوحدة'),
        h('div', { class: 'ivx-item-end' }, line, h('span', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; drawItems(); changed(); } }, '↑'),
          h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === d.items.length - 1, onclick: () => { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; drawItems(); changed(); } }, '↓'),
          h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف البند', 'aria-label': 'حذف البند', disabled: d.items.length === 1, onclick: () => { d.items.splice(i, 1); drawItems(); changed(); } }, '✕'))));
    }),
    h('button', { type: 'button', class: 'btn btn-ghost ivx-add', disabled: d.items.length >= 200, onclick: () => { d.items.push({ desc: '', qty: 1, price: 0 }); drawItems(); changed(); itemsBox.querySelector('.ivx-item:last-of-type textarea')?.focus(); } }, '+ بند جديد'));
  if (d.type !== 'receipt') drawItems();

  // a language switch also swaps the default notes, when they weren't changed
  const p = ivState.profile;
  const swapDefaults = () => {
    const en = d.lang === 'en';
    if (d.notes === (en ? p.notesAr : p.notesEn)) d.notes = en ? p.notesEn : p.notesAr;
    if (d.terms === (en ? p.termsAr : p.termsEn)) d.terms = en ? p.termsEn : p.termsAr;
    notesCard.replaceWith(notesCard = drawNotes());
  };
  const drawNotes = () => h('div', { class: 'card grid' }, h('h2', null, 'ملاحظات وشروط'),
    field(d.type === 'receipt' ? 'وذلك عن (الوصف)' : 'ملاحظات تظهر في المستند', text(d, 'notes', { rows: 3 })),
    d.type === 'receipt' ? null : field('الشروط / طريقة الدفع', text(d, 'terms', { rows: 3 }), 'بيانات البنك تُضاف تلقائياً من «بيانات الشركة».'));
  let notesCard = drawNotes();

  const inv = d.type === 'receipt' ? ivState.docs.filter((x) => x.type === 'invoice' && x.status !== 'cancelled') : [];
  const statusOptions = { invoice: ['draft', 'sent', 'cancelled'], quote: ['draft', 'sent', 'accepted', 'rejected'], receipt: ['issued', 'cancelled'] }[d.type];
  const statusShown = { ...d, status: d.status === 'paid' || d.status === 'partial' ? 'sent' : d.status };

  const settingsCard = h('div', { class: 'card grid' }, h('h2', null, 'البيانات الأساسية'),
    h('div', { class: 'three' },
      field('لغة المستند', select(d, 'lang', [['ar', 'العربية'], ['en', 'English']], swapDefaults)),
      field('العملة', h('input', { value: d.currency, dir: 'ltr', list: 'ivx-currencies', maxlength: 3, disabled: Boolean(d.type === 'receipt' && d.invoiceId), oninput: (e) => { const c = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); if (c.length === 3) { d.currency = c; changed(); if (d.type !== 'receipt') drawItems(); } } }),
        h('datalist', { id: 'ivx-currencies' }, IV.currencies.map((c) => h('option', { value: c })))),
      field('الحالة', h('select', { onchange: (e) => { d.status = e.target.value; changed(); } }, statusOptions.map((k) => h('option', { value: k, selected: statusShown.status === k }, IV.status[k]))),
        d.type === 'invoice' ? 'تصبح «مدفوعة» تلقائياً عند تسجيل الدفعات.' : null)),
    h('div', { class: 'two' },
      field('تاريخ الإصدار', text(d, 'issueDate', { type: 'date', dir: 'ltr' })),
      d.type === 'receipt' ? null : field(d.type === 'quote' ? 'صالح حتى' : 'تاريخ الاستحقاق', text(d, 'dueDate', { type: 'date', dir: 'ltr' }))));

  const receiptCard = d.type === 'receipt' ? h('div', { class: 'card grid' }, h('h2', null, 'الدفعة'),
    h('div', { class: 'two' },
      field(`المبلغ المستلم (${d.currency})`, h('input', { value: d.amount, dir: 'ltr', inputmode: 'decimal', onfocus: (e) => e.target.select(), oninput: (e) => { d.amount = ivNum(e.target.value); changed(); } })),
      field('طريقة الدفع', select(d, 'method', Object.entries(IV.methods)))),
    h('div', { class: 'two' },
      field('عن الفاتورة (اختياري)', select(d, 'invoiceId', [['', '— بدون فاتورة —'], ...inv.map((x) => [x.id, `${x.number} · ${ivClientName(x)} · المتبقي ${ivMoney(x.balance, x.currency)}`])], () => {
        const x = inv.find((y) => y.id === d.invoiceId);
        if (x) { d.currency = x.currency; if (!d.client.name && !d.client.company) { d.client = clone(x.client); drawClient(); } if (!d.amount) d.amount = x.balance; }
        ivEditor(view, d, saved);
      }), 'تُسجَّل الدفعة على الفاتورة وتتغيّر حالتها تلقائياً.'),
      field('رقم المرجع (اختياري)', text(d, 'reference', { dir: 'ltr', placeholder: 'رقم الحوالة أو الشيك' })))) : null;

  const moneyCard = d.type === 'receipt' ? null : h('div', { class: 'card grid' }, h('h2', null, 'الخصم والضريبة'),
    h('div', { class: 'three' },
      field('نوع الخصم', select(d, 'discountType', [['amount', `مبلغ (${d.currency})`], ['percent', 'نسبة %']])),
      field('الخصم', h('input', { value: d.discount, dir: 'ltr', inputmode: 'decimal', onfocus: (e) => e.target.select(), oninput: (e) => { d.discount = ivNum(e.target.value); changed(); } })),
      field('الضريبة %', h('input', { value: d.taxRate, dir: 'ltr', inputmode: 'decimal', onfocus: (e) => e.target.select(), oninput: (e) => { d.taxRate = Math.min(100, ivNum(e.target.value)); changed(); } }))),
    d.type === 'invoice' ? field(`مدفوع خارج الإيصالات (${d.currency})`, h('input', { value: d.paidManual, dir: 'ltr', inputmode: 'decimal', onfocus: (e) => e.target.select(), oninput: (e) => { d.paidManual = ivNum(e.target.value); changed(); } }),
      'دفعة قديمة أو مسجّلة في مكان آخر. الإيصالات المرتبطة بهذه الفاتورة تُحسب تلقائياً.') : null);

  const totalsLine = h('b', { class: 'ivx-total-line' });

  // print the sheet as it is now (also before saving): the browser's «Save as PDF»
  const printNow = () => {
    const box = h('div', { id: 'ivd-print' }, InvoiceDoc.render(computed(), ivState.profile));
    document.body.append(box);
    document.body.classList.add('ivd-printing');
    const done = () => { box.remove(); document.body.classList.remove('ivd-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    const title = document.title;
    document.title = `${d.number || T.name} — ${ivClientName(d)}`; // the PDF's file name
    window.print();
    document.title = title;
    setTimeout(done, 1000);
  };

  const shareCard = d.id ? ivShareCard(view, d, () => same(d, saved), (doc) => ivEditor(view, clone(doc))) : h('div', { class: 'card ivx-share muted' }, 'احفظ المستند أولاً ليُعطى رقماً ورابطاً خاصاً ترسله للعميل.');

  const remove = async (btn) => {
    if (!confirm(`حذف ${T.name} ${d.number}؟ لا يمكن التراجع عن الحذف.`)) return;
    try { const r = await busy(btn, () => api('DELETE', `/invoices/${d.id}`)); ivState.docs = r.docs; setPending(null); toast('حُذف المستند'); location.hash = '#/invoices'; } catch (err) { toast(err.message, 'err'); }
  };
  const back = (e) => { if (dirty() && !confirm('لديك تغييرات غير محفوظة. المغادرة بدون حفظ؟')) e.preventDefault(); else setPending(null); };

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, T.prefix),
      h('h1', null, d.id ? `${T.name} ${d.number}` : `${T.name} جديدة`),
      h('p', null, h('a', { href: '#/invoices', onclick: back }, '→ كل المستندات'), ' · ', totalsLine)),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => saveNow(e.currentTarget) }, isNew ? 'حفظ وإعطاء رقم' : 'حفظ'),
        h('button', { type: 'button', class: 'btn', onclick: printNow }, '⤓ تنزيل PDF'),
        d.id ? h('a', { class: 'btn btn-ghost', href: `#/invoices/new/${d.type}/${d.id}`, title: 'نسخة جديدة بنفس البيانات' }, '⧉ نسخة') : null,
        d.id && d.type === 'invoice' && d.balance > 0 ? h('a', { class: 'btn btn-ghost', href: `#/invoices/new/receipt/${d.id}` }, '+ إيصال دفعة') : null,
        d.id && d.type === 'quote' ? h('a', { class: 'btn btn-ghost', href: `#/invoices/new/invoice/${d.id}` }, '← تحويل إلى فاتورة') : null,
        d.id ? h('button', { type: 'button', class: 'btn btn-danger', onclick: (e) => remove(e.currentTarget) }, 'حذف') : null)),
    h('div', { class: 'ivx-editor' },
      h('div', { class: 'ivx-form' },
        shareCard,
        settingsCard,
        h('div', { class: 'card grid' }, h('h2', null, d.type === 'receipt' ? 'استلمنا من' : 'العميل'), datalist, clientBox),
        receiptCard,
        d.type === 'receipt' ? null : h('div', { class: 'card grid' }, h('h2', null, 'البنود'), itemsBox),
        moneyCard,
        notesCard),
      h('div', { class: 'ivx-side' }, h('p', { class: 'hint' }, 'معاينة مباشرة — هكذا يظهر PDF للعميل'), previewBox)));
  preview();
  refreshBar();
}

// sending: the private link, WhatsApp, email (from this device, or from the server when SMTP is set)
function ivShareCard(view, d, isSaved, reopen) {
  const en = d.lang === 'en';
  const kind = InvoiceDoc.labels[en ? 'en' : 'ar'][d.type];
  const company = en ? ivState.profile.nameEn : ivState.profile.nameAr;
  const who = ivClientName(d);
  const message = () => (en
    ? `Hello ${who},\nPlease find your ${kind.toLowerCase()} ${d.number} for ${InvoiceDoc.money(d.total, d.currency, 'en')}.\nYou can view and download it as a PDF here:\n${ivLink(d)}\n\nThank you — ${company}`
    : `مرحباً ${who}،\nمرفق ${kind} رقم ${d.number} بقيمة ${InvoiceDoc.money(d.total, d.currency, 'ar')}.\nيمكنكم عرضها وتنزيلها بصيغة PDF من الرابط:\n${ivLink(d)}\n\nشكراً لكم — ${company}`);
  const unsaved = () => { if (isSaved()) return false; toast('احفظ التغييرات أولاً ليرى العميل النسخة الأخيرة', 'err'); return true; };
  const phone = d.client.phone.replace(/[^\d]/g, '').replace(/^00/, '');
  const markSent = async () => {
    if (d.status !== 'draft') return;
    try { const r = await api('PUT', `/invoices/${d.id}`, { ...d, status: 'sent' }); ivState.docs = r.docs; reopen(r.doc); } catch { /* the link still went out */ }
  };
  const copy = async () => {
    if (unsaved()) return;
    try { await navigator.clipboard.writeText(ivLink(d)); toast('نُسخ الرابط'); } catch { prompt('انسخ الرابط:', ivLink(d)); }
  };
  const wa = () => {
    if (unsaved()) return;
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
    try { const r = await busy(btn, () => api('POST', `/invoices/${d.id}/email`, { to })); ivState.docs = r.docs; toast(`أُرسل إلى ${to}`); reopen(r.docs.find((x) => x.id === d.id)); } catch (err) { toast(err.message, 'err'); }
  };
  const renew = async (btn) => {
    if (!confirm('رابط جديد؟ الرابط القديم يتوقف عن العمل فوراً لمن أرسلته إليه.')) return;
    try { const r = await busy(btn, () => api('POST', `/invoices/${d.id}/token`)); ivState.docs = r.docs; toast('أُنشئ رابط جديد'); reopen(r.doc); } catch (err) { toast(err.message, 'err'); }
  };
  return h('div', { class: 'card ivx-share' },
    h('div', { class: 'ivx-share-head' }, h('h2', null, 'أرسل للعميل'), h('span', { class: `ivx-st st-${d.status}` }, IV.status[d.status])),
    h('div', { class: 'ivx-link' }, h('input', { value: ivLink(d), readonly: true, dir: 'ltr', 'aria-label': 'رابط المستند', onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', class: 'btn btn-small', onclick: copy }, 'نسخ'),
      h('a', { class: 'btn btn-small btn-ghost', href: ivLink(d), target: '_blank', rel: 'noopener' }, 'فتح ↗')),
    h('div', { class: 'row ivx-send' },
      h('button', { type: 'button', class: 'btn ivx-wa', onclick: wa }, 'واتساب', phone ? null : h('small', null, ' (بدون رقم)')),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: mailto }, 'بريد من جهازي'),
      ivState.mail ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: (e) => serverMail(e.currentTarget) }, 'إرسال من الموقع') : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: (e) => renew(e.currentTarget), title: 'يوقف الرابط القديم' }, '↻ رابط جديد')),
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
      const r = await api('PUT', '/invoices/profile', { rev: ivState.rev, profile: p });
      ivState.profile = r.profile; ivState.rev = r.rev;
      ivProfile(view);
    },
  });
  const changed = () => refreshBar();
  const field = (label, key, props = {}) => h('label', { class: 'field' }, h('span', null, label),
    h(props.rows ? 'textarea' : 'input', { value: p[key] ?? '', dir: props.dir || 'auto', rows: props.rows, inputmode: props.inputmode, oninput: (e) => { p[key] = props.number ? ivNum(e.target.value) : e.target.value; changed(); } }),
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
        h('div', { class: 'two' }, field('العملة الافتراضية', 'currency', { dir: 'ltr' }), field('نسبة الضريبة الافتراضية %', 'taxRate', { dir: 'ltr', inputmode: 'decimal', number: true }))),
      h('div', { class: 'card' }, h('h2', null, 'النصوص الافتراضية لكل مستند جديد'),
        h('div', { class: 'pair' }, field('ملاحظات — بالعربية', 'notesAr', { rows: 3 }), field('Notes — English', 'notesEn', { rows: 3, dir: 'ltr' })),
        h('div', { class: 'pair' }, field('الشروط — بالعربية', 'termsAr', { rows: 3 }), field('Terms — English', 'termsEn', { rows: 3, dir: 'ltr' }))),
      h('div', { class: 'card' }, h('h2', null, 'الشعار والختم'),
        h('div', { class: 'two' }, imageBox('logo', 'الشعار', 600, '/assets/icon.svg'), imageBox('stamp', 'الختم أو التوقيع (اختياري، PNG شفاف)', 800, '')))));
  refreshBar();
}
