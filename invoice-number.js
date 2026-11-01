/* PuzzleX — the number on an invoice, receipt or quotation. One file for both sides: the server (lib/invoices.js) gives
   the number, the panel (admin/invoices.js) shows the same one while it's being typed.
     first name's initial - surname's initial - company - last 3 digits of the phone - month - year - day
     سارة أحمد · شركة النور · +971 50 123 4567 · 2026-11-01  →  S-A-ALNWR-567-11-2026-01
   Receipts and quotations start with RCT- / QUO-. Numbers are Latin capitals only, so they read the same inside Arabic
   text, in file names and in links: Arabic is spelled in Latin letters. A part with nothing to show is left out. */
'use strict';

(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.InvoiceNumber = make();
})(typeof self !== 'undefined' ? self : this, () => {
  const PREFIX = { invoice: '', receipt: 'RCT', quote: 'QUO' };
  const MAX_COMPANY = 12;
  const VALID = /^[A-Z0-9](?:[A-Z0-9-]{0,58}[A-Z0-9])?$/;
  // words that say what kind of business it is, not which one
  const LEGAL = new Set(['شركة', 'شركه', 'مؤسسة', 'مؤسسه', 'ذمم', 'COMPANY', 'CO', 'LLC', 'LTD', 'LIMITED', 'INC', 'FZE', 'FZC', 'FZCO', 'FZLLC']);
  const ARABIC = {
    ا: 'A', أ: 'A', إ: 'A', آ: 'A', ى: 'A', ع: 'A', ب: 'B', پ: 'P', ت: 'T', ث: 'TH', ج: 'J', چ: 'CH', ح: 'H', خ: 'KH', د: 'D', ذ: 'TH', ر: 'R', ز: 'Z',
    س: 'S', ش: 'SH', ص: 'S', ض: 'D', ط: 'T', ظ: 'Z', غ: 'GH', ف: 'F', ق: 'Q', ك: 'K', ک: 'K', گ: 'G', ل: 'L', م: 'M', ن: 'N', ه: 'H', ة: 'H',
    و: 'W', ؤ: 'W', ي: 'Y', ی: 'Y', ئ: 'Y',
  };

  const digits = (s) => String(s ?? '').replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
  // any text → Latin capitals and digits
  const latin = (s) => digits(s).replace(/[؀-ۿ]/g, (c) => ARABIC[c] || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);

  function companyPart(name) {
    const all = words(name);
    const kept = all.filter((w) => !LEGAL.has(w.replace(/[.,]/g, '').toUpperCase()));
    return (kept.length ? kept : all).map(latin).join('').slice(0, MAX_COMPANY);
  }
  function datePart(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    return m ? `${m[2]}-${m[1]}-${m[3]}` : '';
  }

  // the pieces in order, each named so the panel can label it: [{ key, value }]
  function parts(doc) {
    const c = (doc && doc.client) || {};
    const name = words(c.name).map(latin).filter(Boolean);
    const phone = digits(c.phone).replace(/\D/g, '');
    return [
      { key: 'type', value: PREFIX[doc && doc.type] || '' },
      { key: 'first', value: name.length ? name[0][0] : '' },
      { key: 'last', value: name.length > 1 ? name[name.length - 1][0] : '' },
      { key: 'company', value: companyPart(c.company) },
      { key: 'phone', value: phone.length >= 3 ? phone.slice(-3) : '' },
      { key: 'date', value: datePart(doc && doc.issueDate) },
    ];
  }

  const isTaken = (number, taken) => (taken || []).some((n) => String(n).toUpperCase() === number);
  // the number for this document; the same client twice on one day gets -2, -3…
  function build(doc, taken) {
    const base = parts(doc).map((p) => p.value).filter(Boolean).join('-');
    let number = base;
    for (let i = 2; isTaken(number, taken); i++) number = `${base}-${i}`;
    return number;
  }
  // what someone typed by hand, as it would be stored
  const clean = (s) => digits(s).toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
  const valid = (s) => VALID.test(s);

  return { parts, build, clean, valid, isTaken };
});
