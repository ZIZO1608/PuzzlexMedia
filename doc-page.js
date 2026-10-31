/* PuzzleX — the client's page for one invoice / receipt / quotation: /doc/<token> (doc.html).
   Fetches /api/doc/<token>, draws the sheet with invoice-doc.js and scales it to the screen;
   «Download PDF» prints it (the browser's Save as PDF keeps the Arabic exactly as shown). */
'use strict';

(async function () {
  const msg = document.querySelector('[data-msg]');
  const paper = document.querySelector('[data-paper]');
  const printBtn = document.querySelector('[data-print]');
  const token = (location.pathname.match(/\/doc\/([a-f0-9]{24})$/) || [])[1];
  let data = null;
  try {
    const res = await fetch(`/api/doc/${token}`, { cache: 'no-store' });
    data = res.ok ? await res.json() : null;
  } catch { /* shown below */ }
  if (!data || !data.ok) {
    msg.textContent = 'هذا الرابط غير صالح أو انتهت صلاحيته. — This link is not valid or has expired.';
    return;
  }
  const { doc, profile } = data;
  const en = doc.lang === 'en';
  const t = InvoiceDoc.labels[doc.lang === 'en' ? 'en' : 'ar'];
  document.documentElement.lang = en ? 'en' : 'ar';
  document.documentElement.dir = en ? 'ltr' : 'rtl';
  document.title = `${t[doc.type]} ${doc.number} — ${en ? profile.nameEn : profile.nameAr}`;
  printBtn.textContent = en ? 'Download PDF' : 'تنزيل PDF';
  printBtn.hidden = false;
  printBtn.addEventListener('click', () => window.print());

  const sheet = InvoiceDoc.render(doc, profile);
  paper.append(sheet);
  paper.hidden = false;
  msg.remove();

  // the A4 sheet keeps its size; on a phone it is shown smaller
  const fit = () => {
    const scale = Math.min(1, (document.documentElement.clientWidth - 24) / 794);
    sheet.style.transform = scale < 1 ? `scale(${scale})` : '';
    paper.style.height = scale < 1 ? `${sheet.offsetHeight * scale}px` : '';
    paper.style.width = scale < 1 ? `${794 * scale}px` : '';
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', () => { sheet.style.transform = ''; paper.style.height = ''; paper.style.width = ''; });
  window.addEventListener('afterprint', fit);
})();
