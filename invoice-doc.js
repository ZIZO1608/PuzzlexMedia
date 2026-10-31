/* PuzzleX — draws an invoice, receipt or quotation as an A4 sheet (invoice-doc.css).
   Used by the admin panel's live preview (admin/invoices.js) and by the client's page (doc.html → /doc/<token>).
   Everything is built with createElement / textContent: whatever was typed is shown as text, never as HTML.
     InvoiceDoc.render(doc, profile) → <article class="ivd">
     InvoiceDoc.money(value, currency, lang) → "1,250.00 US$" style text */
'use strict';

(function () {
  const THREE = ['KWD', 'BHD', 'OMR', 'JOD'];
  const decimals = (c) => (THREE.includes(c) ? 3 : 2);
  const L = {
    ar: {
      invoice: 'فاتورة', receipt: 'إيصال استلام', quote: 'عرض سعر',
      invoiceEn: 'INVOICE', receiptEn: 'RECEIPT', quoteEn: 'QUOTATION',
      number: 'الرقم', issued: 'تاريخ الإصدار', due: 'تاريخ الاستحقاق', valid: 'صالح حتى',
      billTo: 'فاتورة إلى', quoteTo: 'مقدَّم إلى', from: 'استلمنا من',
      taxNo: 'الرقم الضريبي', desc: 'الوصف', qty: 'الكمية', price: 'سعر الوحدة', amount: 'المبلغ',
      subtotal: 'المجموع الفرعي', discount: 'الخصم', tax: 'الضريبة', total: 'الإجمالي', paid: 'المدفوع', balance: 'المتبقي',
      notes: 'ملاحظات', terms: 'الشروط والأحكام', bank: 'بيانات الدفع', thanks: 'شكراً لثقتكم',
      received: 'المبلغ المستلم', sum: 'مبلغ وقدره', method: 'طريقة الدفع', reference: 'رقم المرجع', against: 'عن الفاتورة',
      methods: { cash: 'نقداً', bank: 'تحويل بنكي', card: 'بطاقة', transfer: 'حوالة مالية', other: 'أخرى' },
      stamps: { paid: 'مدفوعة', cancelled: 'ملغاة', partial: 'مدفوعة جزئياً', accepted: 'مقبول', rejected: 'مرفوض', issued: 'تم الاستلام' },
      signature: 'التوقيع والختم', page: 'صفحة',
    },
    en: {
      invoice: 'Invoice', receipt: 'Receipt', quote: 'Quotation',
      invoiceEn: 'INVOICE', receiptEn: 'RECEIPT', quoteEn: 'QUOTATION',
      number: 'No.', issued: 'Issue date', due: 'Due date', valid: 'Valid until',
      billTo: 'Bill to', quoteTo: 'Prepared for', from: 'Received from',
      taxNo: 'Tax no.', desc: 'Description', qty: 'Qty', price: 'Unit price', amount: 'Amount',
      subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', total: 'Total', paid: 'Paid', balance: 'Balance due',
      notes: 'Notes', terms: 'Terms & conditions', bank: 'Payment details', thanks: 'Thank you for your business',
      received: 'Amount received', sum: 'The sum of', method: 'Payment method', reference: 'Reference', against: 'Against invoice',
      methods: { cash: 'Cash', bank: 'Bank transfer', card: 'Card', transfer: 'Money transfer', other: 'Other' },
      stamps: { paid: 'PAID', cancelled: 'CANCELLED', partial: 'PARTIALLY PAID', accepted: 'ACCEPTED', rejected: 'REJECTED', issued: 'RECEIVED' },
      signature: 'Signature & stamp', page: 'Page',
    },
  };

  function money(v, currency, lang) {
    const d = decimals(currency);
    const n = Number(v) || 0;
    // the code, not a symbol: "US$" turns into "$US" inside Arabic text, and SAR / AED symbols differ per device
    const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    return lang === 'en' ? `${currency} ${amount}` : `${amount} ${currency}`;
  }
  const qtyText = (q) => (Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3))));
  function dateText(iso, lang) {
    if (!iso) return '';
    try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; }
  }

  function el(tag, cls, ...kids) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k of kids.flat()) if (k != null && k !== false && k !== '') e.append(k instanceof Node ? k : String(k));
    return e;
  }
  const img = (src, cls, alt) => { const i = document.createElement('img'); i.src = src; i.alt = alt || ''; if (cls) i.className = cls; return i; };
  // a text block that keeps the line breaks someone typed
  const lines = (text, cls) => el('p', cls, text);
  const kv = (label, value, cls) => (value ? el('div', `ivd-kv${cls ? ` ${cls}` : ''}`, el('span', null, label), el('b', null, value)) : null);

  function render(doc, profile, opts = {}) {
    const lang = doc.lang === 'en' ? 'en' : 'ar';
    const t = L[lang];
    const en = lang === 'en';
    const p = profile || {};
    const cur = doc.currency || 'USD';
    const m = (v) => money(v, cur, lang);
    const company = en ? p.nameEn || p.nameAr : p.nameAr || p.nameEn;
    const address = en ? p.addressEn || p.addressAr : p.addressAr || p.addressEn;

    const sheet = el('article', `ivd ivd--${doc.type}`);
    sheet.dir = en ? 'ltr' : 'rtl';
    sheet.lang = lang;

    // head: who we are | what this is
    const brand = el('div', 'ivd-brand',
      img(p.logo || '/assets/icon.svg', 'ivd-logo'),
      el('div', null,
        el('p', 'ivd-company', company),
        address ? lines(address, 'ivd-muted') : null,
        el('p', 'ivd-muted ivd-ltr', [p.phone, p.email, p.website].filter(Boolean).join('  ·  ')),
        p.taxNo ? el('p', 'ivd-muted', `${t.taxNo}: `, el('span', 'ivd-ltr', p.taxNo)) : null));
    const title = el('div', 'ivd-title',
      el('p', 'ivd-kind', t[doc.type]),
      en ? null : el('p', 'ivd-kind-en', t[`${doc.type}En`]),
      el('p', 'ivd-number', doc.number || '—'));
    sheet.append(el('header', 'ivd-head', brand, title), el('div', 'ivd-rule'));

    // dates and the client
    const meta = el('div', 'ivd-meta',
      kv(t.issued, dateText(doc.issueDate, lang)),
      doc.type === 'invoice' ? kv(t.due, dateText(doc.dueDate, lang)) : null,
      doc.type === 'quote' ? kv(t.valid, dateText(doc.dueDate, lang)) : null,
      kv(t.number, doc.number, 'ivd-ltr-val'));
    const c = doc.client || {};
    const who = el('div', 'ivd-client',
      el('p', 'ivd-label', doc.type === 'receipt' ? t.from : doc.type === 'quote' ? t.quoteTo : t.billTo),
      el('p', 'ivd-client-name', c.name || c.company),
      c.name && c.company ? el('p', null, c.company) : null,
      c.address ? lines(c.address, 'ivd-muted') : null,
      [c.phone, c.email].some(Boolean) ? el('p', 'ivd-muted ivd-ltr', [c.phone, c.email].filter(Boolean).join('  ·  ')) : null,
      c.taxNo ? el('p', 'ivd-muted', `${t.taxNo}: `, el('span', 'ivd-ltr', c.taxNo)) : null);
    sheet.append(el('section', 'ivd-parties', who, meta));

    if (doc.type === 'receipt') {
      sheet.append(el('section', 'ivd-receipt',
        el('p', 'ivd-label', t.received),
        el('p', 'ivd-big', m(doc.total)),
        el('div', 'ivd-receipt-rows',
          kv(t.method, t.methods[doc.method] || doc.method),
          kv(t.reference, doc.reference, 'ivd-ltr-val'),
          kv(t.against, doc.invoiceNumber, 'ivd-ltr-val'))));
    } else {
      const head = el('tr', null, el('th', 'ivd-n', '#'), el('th', null, t.desc), el('th', 'ivd-num', t.qty), el('th', 'ivd-num', t.price), el('th', 'ivd-num', t.amount));
      const rows = (doc.items || []).map((it, i) => el('tr', null,
        el('td', 'ivd-n', String(i + 1)),
        el('td', 'ivd-desc', it.desc),
        el('td', 'ivd-num', qtyText(Number(it.qty) || 0)),
        el('td', 'ivd-num', m(it.price)),
        el('td', 'ivd-num', m((Number(it.qty) || 0) * (Number(it.price) || 0)))));
      sheet.append(el('table', 'ivd-items', el('thead', null, head), el('tbody', null, rows)));

      const sums = el('div', 'ivd-sums',
        kv(t.subtotal, m(doc.subtotal)),
        doc.discountAmount ? kv(`${t.discount}${doc.discountType === 'percent' ? ` (${doc.discount}%)` : ''}`, `− ${m(doc.discountAmount)}`) : null,
        doc.taxRate ? kv(`${t.tax} (${doc.taxRate}%)`, m(doc.taxAmount)) : null,
        el('div', 'ivd-kv ivd-total', el('span', null, t.total), el('b', null, m(doc.total))),
        doc.type === 'invoice' && doc.paid ? kv(t.paid, m(doc.paid)) : null,
        doc.type === 'invoice' && doc.paid ? kv(t.balance, m(doc.balance), 'ivd-balance') : null);
      sheet.append(el('section', 'ivd-totals', el('div', 'ivd-thanks', el('p', null, t.thanks), el('span', 'ivd-dots')), sums));
    }

    // notes, terms, how to pay
    const notes = doc.notes || '', terms = doc.terms || '';
    const extra = el('section', 'ivd-extra',
      notes ? el('div', null, el('p', 'ivd-label', t.notes), lines(notes)) : null,
      terms ? el('div', null, el('p', 'ivd-label', t.terms), lines(terms)) : null,
      p.bank && doc.type !== 'receipt' ? el('div', null, el('p', 'ivd-label', t.bank), lines(p.bank, 'ivd-ltr-block')) : null);
    if (extra.childElementCount) sheet.append(extra);

    const sign = el('section', 'ivd-sign',
      el('div', 'ivd-sign-box', p.stamp ? img(p.stamp, 'ivd-stamp-img') : null, el('span', null, t.signature)));
    sheet.append(sign);

    const stamp = t.stamps[doc.status];
    if (stamp && doc.status !== 'issued' && doc.status !== 'partial') sheet.append(el('div', `ivd-status ivd-status-${doc.status}`, stamp));

    sheet.append(el('footer', 'ivd-foot',
      el('span', null, company),
      el('span', 'ivd-ltr', [p.website, p.email, p.phone].filter(Boolean).join('  ·  ')),
      el('span', 'ivd-ltr', doc.number || '')));
    if (opts.watermark) sheet.append(el('div', 'ivd-watermark', opts.watermark));
    return sheet;
  }

  window.InvoiceDoc = { render, money, decimals, labels: L, dateText };
})();
