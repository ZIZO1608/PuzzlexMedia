/* PuzzleX — draws an invoice, receipt or quotation as an A4 sheet (invoice-doc.css).
   Used by the admin panel's live preview (admin/invoices.js) and by the client's page (doc.html → /doc/<token>).
   Everything is built with createElement / textContent: whatever was typed is shown as text, never as HTML.
     InvoiceDoc.render(doc, profile) → <div class="ivd-pages"> with one <article class="ivd"> per A4 page
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
      signature: 'التوقيع والختم', page: 'صفحة', of: 'من', cont: 'تابع',
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
      signature: 'Signature & stamp', page: 'Page', of: 'of', cont: 'continued',
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

  // the height a sheet's content may reach: A4 less the bottom margin that holds the footer
  const PAGE_HEIGHT = 1123, BOTTOM = 88;
  const PAGE_TEXT = 6000; // more characters than a page can hold: longer text is never measured whole, which keeps this quick

  /* Draws the document as real A4 pages and returns <div class="ivd-pages"> holding one .ivd per page. Pieces are laid out
     one at a time in a hidden copy, so anything that passes the bottom of a page goes to the next: table rows move whole,
     long text is cut between words and carries on. opts.blanks also shows an added page that has nothing in it yet. */
  function render(doc, profile, opts = {}) {
    const lang = doc.lang === 'en' ? 'en' : 'ar';
    const t = L[lang];
    const en = lang === 'en';
    const p = profile || {};
    const cur = doc.currency || 'USD';
    const m = (v) => money(v, cur, lang);
    const company = en ? p.nameEn || p.nameAr : p.nameAr || p.nameEn;
    const address = en ? p.addressEn || p.addressAr : p.addressAr || p.addressEn;

    const pages = el('div', 'ivd-pages');
    const hidden = el('div');
    hidden.style.cssText = 'position:fixed;top:0;left:0;width:794px;visibility:hidden;pointer-events:none;z-index:-1';
    hidden.append(pages);
    document.body.append(hidden);

    let sheet = null;
    let table = null; // this page's items table, once it has one
    let used = false; // has this page got anything beyond its heading?
    const newSheet = () => {
      sheet = el('article', `ivd ivd--${doc.type}`);
      sheet.dir = en ? 'ltr' : 'rtl';
      sheet.lang = lang;
      pages.append(sheet);
      table = null;
      used = false;
    };
    const fits = (node) => node.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top <= PAGE_HEIGHT - BOTTOM + 0.5;
    // from the second page on: a slim heading that says what these pages belong to
    const nextPage = () => {
      newSheet();
      sheet.append(el('header', 'ivd-cont',
        el('div', 'ivd-cont-brand', img(p.logo || '/assets/icon.svg', 'ivd-cont-logo'), el('p', 'ivd-cont-company', company)),
        el('div', 'ivd-cont-title', el('p', 'ivd-cont-kind', t[doc.type]), el('p', 'ivd-number', doc.number || '—'))));
    };
    // a piece that can't be cut: it goes where it fits
    const place = (node) => {
      sheet.append(node);
      if (!fits(node) && used) { node.remove(); nextPage(); sheet.append(node); }
      used = true;
    };
    // the most of `text` that fits when test(part) puts it on the page, ending between words: its length
    const longestFit = (text, test) => {
      let lo = 0, hi = Math.min(text.length, PAGE_TEXT);
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (test(text.slice(0, mid))) lo = mid; else hi = mid - 1;
      }
      if (lo === text.length) return lo;
      const before = text.slice(0, lo + 1);
      const space = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'));
      return space > 0 ? space : lo; // one very long word is cut where it has to be
    };
    // text across as many pages as it takes; make(part, continued) builds the piece holding part of it
    const flowText = (text, make) => {
      let rest = text, continued = false;
      for (;;) {
        if (rest.length <= PAGE_TEXT) {
          const whole = make(rest, continued);
          sheet.append(whole);
          if (fits(whole)) { used = true; return; }
          whole.remove();
        }
        let n = longestFit(rest, (part) => { const b = make(part, continued); sheet.append(b); const ok = fits(b); b.remove(); return ok; });
        if (n < 30 && used) n = 0; // a scrap at the foot of a page: start on the next one instead
        else if (n === 0) n = Math.min(rest.length, 200); // never stuck, whatever was typed
        if (n) {
          sheet.append(make(rest.slice(0, n).trimEnd(), continued));
          rest = rest.slice(n).trimStart();
          continued = true;
          if (!rest) { used = true; return; }
        }
        nextPage();
      }
    };

    // the first page's head: who we are, what this is, dates and the client
    newSheet();
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
    const meta = el('div', 'ivd-meta',
      kv(t.issued, dateText(doc.issueDate, lang)),
      doc.type === 'invoice' ? kv(t.due, dateText(doc.dueDate, lang)) : null,
      doc.type === 'quote' ? kv(t.valid, dateText(doc.dueDate, lang)) : null,
      kv(t.number, doc.number, 'ivd-ltr-val ivd-kv-id'));
    const c = doc.client || {};
    const who = el('div', 'ivd-client',
      el('p', 'ivd-label', doc.type === 'receipt' ? t.from : doc.type === 'quote' ? t.quoteTo : t.billTo),
      el('p', 'ivd-client-name', c.name || c.company),
      c.name && c.company ? el('p', null, c.company) : null,
      c.address ? lines(c.address, 'ivd-muted') : null,
      [c.phone, c.email].some(Boolean) ? el('p', 'ivd-muted ivd-ltr', [c.phone, c.email].filter(Boolean).join('  ·  ')) : null,
      c.taxNo ? el('p', 'ivd-muted', `${t.taxNo}: `, el('span', 'ivd-ltr', c.taxNo)) : null);
    sheet.append(el('section', 'ivd-parties', who, meta));
    const firstSheet = sheet;

    if (doc.type === 'receipt') {
      place(el('section', 'ivd-receipt',
        el('p', 'ivd-label', t.received),
        el('p', 'ivd-big', m(doc.total)),
        el('div', 'ivd-receipt-rows',
          kv(t.method, t.methods[doc.method] || doc.method),
          kv(t.reference, doc.reference, 'ivd-ltr-val'),
          kv(t.against, doc.invoiceNumber, 'ivd-ltr-val'))));
    } else {
      // every page with rows gets its own table and heading row
      const tbody = () => {
        if (!table) {
          table = el('table', 'ivd-items',
            el('thead', null, el('tr', null, el('th', null, t.desc), el('th', 'ivd-num', t.qty), el('th', 'ivd-num', t.price), el('th', 'ivd-num', t.amount))),
            el('tbody'));
          sheet.append(table);
        }
        return table.tBodies[0];
      };
      const breakPage = () => { if (table && !table.tBodies[0].rows.length) table.remove(); nextPage(); };
      (doc.items || []).forEach((it) => {
        // a row carried over from the page before shows only the rest of its description
        const row = (desc, continued) => el('tr', null,
          el('td', 'ivd-desc', desc),
          el('td', 'ivd-num', continued ? '' : qtyText(Number(it.qty) || 0)),
          el('td', 'ivd-num', continued ? '' : m(it.price)),
          el('td', 'ivd-num', continued ? '' : m((Number(it.qty) || 0) * (Number(it.price) || 0))));
        let rest = String(it.desc || ''), continued = false;
        for (;;) {
          const body = tbody();
          const fresh = !used && !body.rows.length;
          if (rest.length <= PAGE_TEXT) {
            const tr = row(rest, continued);
            body.append(tr);
            if (fits(tr)) break;
            tr.remove();
          }
          // short rows move whole; a long description is cut and carries on over the page
          let n = rest.length > 240 || fresh
            ? longestFit(rest, (part) => { const b = row(part, continued); body.append(b); const ok = fits(b); b.remove(); return ok; })
            : 0;
          if (n < 30 && !fresh) n = 0;
          else if (n === 0) n = Math.min(rest.length, 200);
          if (n) {
            body.append(row(rest.slice(0, n).trimEnd(), continued));
            rest = rest.slice(n).trimStart();
            continued = true;
            if (!rest) break;
          }
          breakPage();
        }
        used = true;
      });

      place(el('section', 'ivd-totals',
        el('div', 'ivd-thanks', el('p', null, t.thanks), el('span', 'ivd-dots')),
        el('div', 'ivd-sums',
          kv(t.subtotal, m(doc.subtotal)),
          doc.discountAmount ? kv(`${t.discount}${doc.discountType === 'percent' ? ` (${doc.discount}%)` : ''}`, `− ${m(doc.discountAmount)}`) : null,
          doc.taxRate ? kv(`${t.tax} (${doc.taxRate}%)`, m(doc.taxAmount)) : null,
          el('div', 'ivd-kv ivd-total', el('span', null, t.total), el('b', null, m(doc.total))),
          doc.type === 'invoice' && doc.paid ? kv(t.paid, m(doc.paid)) : null,
          doc.type === 'invoice' && doc.paid ? kv(t.balance, m(doc.balance), 'ivd-balance') : null)));
    }

    // notes, terms, how to pay: side by side when they fit; otherwise one under the other, across pages
    const blocks = [
      doc.notes && { label: t.notes, text: doc.notes },
      doc.terms && { label: t.terms, text: doc.terms },
      p.bank && doc.type !== 'receipt' && { label: t.bank, text: p.bank, cls: 'ivd-ltr-block' },
    ].filter(Boolean);
    if (blocks.length) {
      const together = el('section', 'ivd-extra', blocks.map((b) => el('div', null, el('p', 'ivd-label', b.label), lines(b.text, b.cls))));
      sheet.append(together);
      if (fits(together)) used = true;
      else {
        together.remove();
        for (const b of blocks) {
          flowText(b.text, (part, continued) => el('section', 'ivd-extra ivd-extra-full',
            el('div', null, el('p', 'ivd-label', continued ? `${b.label} — ${t.cont}` : b.label), lines(part, b.cls))));
        }
      }
    }

    // pages added by hand: each starts on a page of its own and runs on if it's long
    for (const x of doc.extraPages || []) {
      if (!x.title && !x.body && !opts.blanks) continue;
      nextPage();
      if (x.title) sheet.append(el('h2', 'ivd-page-title', x.title));
      if (x.body) {
        flowText(x.body, (part, continued) => el('section', 'ivd-page-text',
          continued && x.title ? el('p', 'ivd-label', `${x.title} — ${t.cont}`) : null, lines(part)));
      }
      used = true;
    }

    // the signature closes the document, on the last page
    const sign = el('section', `ivd-sign${p.stamp ? ' has-stamp' : ''}`,
      el('div', 'ivd-sign-box', p.stamp ? img(p.stamp, 'ivd-stamp-img') : null, el('span', null, t.signature)));
    place(sign);

    const stamp = t.stamps[doc.status];
    if (stamp && doc.status !== 'issued' && doc.status !== 'partial') firstSheet.append(el('div', `ivd-status ivd-status-${doc.status}`, stamp));

    const all = [...pages.children];
    all.forEach((s, i) => {
      s.append(el('footer', 'ivd-foot',
        el('span', null, company),
        el('span', 'ivd-ltr', [p.website, p.email, p.phone].filter(Boolean).join('  ·  ')),
        el('span', 'ivd-ltr', doc.number || ''),
        all.length > 1 ? el('b', 'ivd-page-no', `${t.page} ${i + 1} ${t.of} ${all.length}`) : null));
      if (opts.watermark) s.append(el('div', 'ivd-watermark', opts.watermark));
    });
    hidden.remove();
    pages.remove();
    return pages;
  }

  window.InvoiceDoc = { render, money, decimals, labels: L, dateText };
})();
