// Screens for the admin-panel user guide, in the order a user moves through the panel.
// Run against the demo copy of the site (demo data, port 5180):
//   GUIDE_PASS=… node user-guide/tools/capture.mjs user-guide/shots.mjs --out user-guide/shots
const mark = (sel, name, test) => ({ eval: `const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${test}); if (!el) throw new Error('not found: ${name}'); el.dataset.cap = '${name}'; el.scrollIntoView({ block: 'center' });` });
const hash = (h) => ({ hash: h });

// demo content: one text already edited, sample photos on one project (only ever on the demo data)
const PREP = `
  const H = { 'X-PX-Admin': '1', 'Content-Type': 'application/json' };
  await fetch('/api/admin/texts', { method: 'PATCH', headers: H, body: JSON.stringify({ changes: [
    { key: 'مرّر لتكتمل الصورة\\u241fScroll to complete the picture', ar: 'مرّر لتكتمل أحجيتك', en: 'Scroll to finish the puzzle' } ] }) });
  const photo = async (c1, c2, line1, line2) => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1600, 1000); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fillRect(0, 0, 1600, 1000);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3;
    for (let x = 0; x < 1600; x += 160) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1000); g.stroke(); }
    for (let y = 0; y < 1000; y += 160) { g.beginPath(); g.moveTo(0, y); g.lineTo(1600, y); g.stroke(); }
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(560, 260, 480, 480, 80); g.fill();
    g.fillStyle = c2; g.font = '900 150px Alexandria, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(line1, 800, 500);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 46px Alexandria, sans-serif'; g.fillText(line2, 800, 860);
    return new Promise((r) => cv.toBlob(r, 'image/webp', 0.9));
  };
  const up = async (b) => (await (await fetch('/api/admin/upload', { method: 'POST', headers: { 'X-PX-Admin': '1', 'Content-Type': 'image/webp' }, body: b })).json()).src;
  const cover = await up(await photo('#0b7a3b', '#05351a', '021', 'صورة توضيحية — الغلاف'));
  const g1 = await up(await photo('#127a45', '#073b20', 'CUP', 'صورة توضيحية 1'));
  const g2 = await up(await photo('#2f8a52', '#0b3d22', 'MENU', 'صورة توضيحية 2'));
  const g3 = await up(await photo('#0d5c33', '#042514', 'SHIRT', 'صورة توضيحية 3'));
  const pr = await (await fetch('/api/admin/projects')).json();
  const p = pr.data.projects.find((x) => x.id === 'coffee-021');
  p.cover = cover; p.gallery = [g1, g2, g3];
  const r = await fetch('/api/admin/projects', { method: 'PUT', headers: H, body: JSON.stringify({ rev: pr.rev, data: pr.data }) });
  if (!(await r.json()).ok) throw new Error('prep: projects not saved');
`;

export default {
  base_url: 'http://localhost:5180',
  display_base_url: 'https://www.puzzlexmedia.com',
  viewport: { width: 1280, height: 760 },
  device_scale_factor: 2,
  delay_ms: 450,
  css: '.toasts { display: none; }',
  screens: [
    /* ---------- getting started ---------- */
    {
      id: 'login', url: '/admin/', wait_for: '#login-form',
      actions: [{ fill: { selector: 'input[name=username]', value: 'hussein' } }, { fill: { selector: 'input[name=password]', value: '$ENV:GUIDE_PASS' } }],
      clip: '.login-card', clip_padding: 18,
      callouts: [{ key: 'user', selector: 'input[name=username]' }, { key: 'pass', selector: 'input[name=password]' }, { key: 'go', selector: '#login-form button[type=submit]' }],
    },
    {
      id: 'dashboard', url: null,
      actions: [{ click: '#login-form button[type=submit]' }, { wait_for: '#who' }, { eval: PREP }, hash('#/messages'), hash('#/'), { wait: 600 }],
      wait_for: '.stats',
      callouts: [
        { key: 'menu', selector: '.side-nav' }, { key: 'stats', selector: '.stats' },
        { key: 'site', selector: '.side-foot .btn' }, { key: 'who', selector: '#who' },
      ],
    },
    {
      id: 'nav', url: null, clip: '.side-nav', clip_padding: 10,
      callouts: [
        { key: 'texts', selector: '[data-route=texts]' }, { key: 'projects', selector: '[data-route=projects]' },
        { key: 'partners', selector: '[data-route=partners]' }, { key: 'contact', selector: '[data-route=contact]' },
        { key: 'messages', selector: '[data-route=messages]' }, { key: 'account', selector: '[data-route=account]' },
      ],
    },
    {
      id: 'stats', url: null, clip: '.stats', clip_padding: 8,
      callouts: [{ key: 'unread', selector: '.stat.hot' }, { key: 'projects', selector: '.stats >> a[href="#/projects"]' }],
    },

    /* ---------- texts ---------- */
    {
      id: 'texts', url: null, actions: [{ eval: "sessionStorage.setItem('px-text-group', 'index.html')" }, hash('#/texts')], wait_for: '.text-item',
      callouts: [{ key: 'search', selector: '.toolbar input[type=search]' }, { key: 'chips', selector: '.toolbar .chips' }, { key: 'open', selector: '.page-head .btn' }],
    },
    {
      id: 'texts-toolbar', url: null, clip: '.toolbar', clip_padding: 8,
      callouts: [
        { key: 'search', selector: '.toolbar input[type=search]' }, { key: 'page', selector: '.chip[aria-pressed=true]' },
        { key: 'shared', selector: '.toolbar .chips .chip:first-child' }, { key: 'edited', selector: '.toolbar >> text=المعدّلة فقط' },
      ],
    },
    {
      id: 'text-item', url: null,
      actions: [mark('.text-item', 'hero', "x.querySelector('textarea[lang=ar]').value === 'كل أحجية'")],
      clip: '[data-cap=hero]', clip_padding: 10,
      callouts: [
        { key: 'kind', selector: '[data-cap=hero] >> .tag' }, { key: 'where', selector: '[data-cap=hero] >> .text-meta span:nth-child(2)' },
        { key: 'ar', selector: '[data-cap=hero] >> textarea[lang=ar]' }, { key: 'en', selector: '[data-cap=hero] >> textarea[lang=en]' },
      ],
    },
    {
      id: 'text-item-dirty', url: null,
      actions: [{ eval: "const t = document.querySelector('[data-cap=hero] textarea[lang=ar]'); __set(t, 'كل مشروع');" }, { wait: 300 }],
      clip: '[data-cap=hero]', clip_padding: 10,
      callouts: [{ key: 'ar', selector: '[data-cap=hero] >> textarea[lang=ar]' }],
    },
    {
      id: 'savebar', url: null, clip: '#savebar', clip_padding: 10,
      callouts: [{ key: 'count', selector: '#savebar-text' }, { key: 'save', selector: '#savebar-save' }, { key: 'undo', selector: '#savebar-undo' }],
    },
    {
      id: 'text-item-edited', url: null,
      actions: [{ click: '#savebar-undo' }, { wait: 300 }, mark('.text-item', 'edited', "x.querySelector('textarea[lang=ar]').value === 'مرّر لتكتمل أحجيتك'")],
      clip: '[data-cap=edited]', clip_padding: 10,
      callouts: [
        { key: 'badge', selector: '[data-cap=edited] >> .tag.lime' }, { key: 'restore', selector: '[data-cap=edited] >> text=استرجاع الأصل' },
        { key: 'original', selector: '[data-cap=edited] >> .default-note' },
      ],
    },
    {
      id: 'texts-seo', url: null,
      actions: [{ eval: "[...document.querySelectorAll('.toolbar .chip')].find((c) => c.textContent.startsWith('عناوين الصفحات')).click();" }, { wait: 300 }, mark('.text-item', 'seo', "x.querySelector('.tag').textContent.startsWith('وصف الصفحة')")],
      clip: '[data-cap=seo]', clip_padding: 10,
      callouts: [{ key: 'kind', selector: '[data-cap=seo] >> .tag' }, { key: 'ar', selector: '[data-cap=seo] >> textarea[lang=ar]' }],
    },

    /* ---------- projects ---------- */
    {
      id: 'projects', url: null, actions: [hash('#/projects')], wait_for: '.proj-row',
      callouts: [
        { key: 'new', selector: 'text=+ مشروع جديد' }, { key: 'row', selector: '.proj-row' },
        { key: 'open', selector: '.page-head >> text=افتح صفحة الأعمال ↗' },
      ],
    },
    {
      id: 'project-row', url: null,
      actions: [mark('.proj-row', 'row', "x.textContent.includes('Zero Twenty One')")],
      clip: '[data-cap=row]', clip_padding: 8,
      callouts: [
        { key: 'thumb', selector: '[data-cap=row] >> .thumb' }, { key: 'up', selector: '[data-cap=row] >> [aria-label=تقديم]' },
        { key: 'down', selector: '[data-cap=row] >> [aria-label=تأخير]' }, { key: 'edit', selector: '[data-cap=row] >> text=تعديل' },
      ],
    },
    {
      id: 'sectors', url: null, clip: '.main .card.grid', clip_padding: 8,
      callouts: [{ key: 'ar', selector: '.main .card.grid >> input' }],
    },
    {
      id: 'project-editor', url: null, actions: [hash('#/projects/coffee-021'), { eval: 'scrollTo(0, 0)' }, { wait: 300 }], wait_for: '.editor',
      callouts: [{ key: 'back', selector: '.page-head >> text=→ كل المشاريع' }, { key: 'view', selector: '.page-head >> text=عرض على الموقع ↗' }, { key: 'delete', selector: '.page-head >> text=حذف المشروع' }],
    },
    {
      id: 'editor-texts', url: null, clip: '.editor .card:nth-child(1)', clip_padding: 8,
      callouts: [
        { key: 'client', selector: '.editor .card:nth-child(1) .pair:nth-of-type(1)' }, { key: 'title', selector: '.editor .card:nth-child(1) .pair:nth-of-type(2)' },
        { key: 'summary', selector: '.editor .card:nth-child(1) .pair:nth-of-type(3)' }, { key: 'services', selector: '.editor .card:nth-child(1) .pair:nth-of-type(4)' },
      ],
    },
    {
      id: 'editor-class', url: null, clip: '.editor .card:nth-child(2)', clip_padding: 8,
      callouts: [{ key: 'sector', selector: '.editor .card:nth-child(2) select' }, { key: 'year', selector: '.editor .card:nth-child(2) input[type=number]' }, { key: 'link', selector: '.editor .card:nth-child(2) input[dir=ltr]:not([type])' }],
    },
    {
      id: 'editor-logo', url: null, clip: '.editor .card:nth-child(3)', clip_padding: 8,
      callouts: [{ key: 'logo', selector: '.editor .card:nth-child(3) .logo-box' }, { key: 'pick', selector: 'text=اختيار من شعارات الشركاء' }, { key: 'upload', selector: 'text=رفع شعار جديد' }],
    },
    {
      id: 'logo-picker', url: null, actions: [{ click: 'text=اختيار من شعارات الشركاء' }, { wait: 500 }], clip: 'dialog', clip_padding: 0,
      css: 'dialog { max-height: 560px; overflow: hidden; }',
      callouts: [{ key: 'grid', selector: 'dialog .pick-grid button' }],
    },
    {
      id: 'editor-cover', url: null, actions: [{ click: 'dialog >> text=إغلاق' }, { wait: 300 }], clip: '.editor .card:nth-child(4)', clip_padding: 8,
      callouts: [{ key: 'img', selector: '.editor .card:nth-child(4) .img-tile img' }, { key: 'remove', selector: '.editor .card:nth-child(4) >> text=إزالة' }],
    },
    {
      id: 'editor-gallery', url: null, clip: '.editor .card:nth-child(5)', clip_padding: 8,
      callouts: [
        { key: 'first', selector: '.editor .card:nth-child(5) .img-tile' }, { key: 'earlier', selector: '.editor .card:nth-child(5) .img-tile:nth-child(2) [aria-label=تقديم]' },
        { key: 'del', selector: '.editor .card:nth-child(5) .img-tile:nth-child(2) [aria-label=حذف]' }, { key: 'later', selector: '.editor .card:nth-child(5) .img-tile:nth-child(2) [aria-label=تأخير]' },
        { key: 'add', selector: '.editor .card:nth-child(5) .drop' },
      ],
    },
    {
      id: 'editor-colors', url: null, clip: '.editor .card:nth-child(6)', clip_padding: 8,
      callouts: [{ key: 'c1', selector: '.editor .card:nth-child(6) input[type=color]' }],
    },
    {
      id: 'project-new', url: null, actions: [hash('#/projects'), { click: 'text=+ مشروع جديد' }, { wait: 900 }], clip: '.editor .card:nth-child(1)', clip_padding: 8, css: '#savebar { display: none !important; }',
      callouts: [{ key: 'client', selector: '.editor .card:nth-child(1) .pair:nth-of-type(1)' }, { key: 'title', selector: '.editor .card:nth-child(1) .pair:nth-of-type(2)' }],
    },
    {
      id: 'project-new-link', url: null,
      actions: [
        { eval: "const f = (l) => [...document.querySelectorAll('.editor .field')].find((x) => x.querySelector('span').textContent.startsWith(l)).querySelector('input, textarea'); __set(f('اسم العميل — English'), 'Al Waha Bakery'); __set(f('عنوان المشروع — English'), 'Brand identity');" },
        { wait: 300 },
      ],
      clip: '.editor .card:nth-child(2)', clip_padding: 8, css: '#savebar { display: none !important; }',
      callouts: [{ key: 'link', selector: '.editor .card:nth-child(2) input[dir=ltr]:not([type])' }, { key: 'address', selector: '.editor .card:nth-child(2) .hint.ltr' }],
    },

    /* ---------- partners ---------- */
    {
      id: 'partners', url: null, actions: [{ click: '#savebar-undo' }, hash('#/partners')], wait_for: '.logo-tile',
      callouts: [{ key: 'info', selector: '.main > .hint' }, { key: 'tile', selector: '.logo-tile' }, { key: 'open', selector: '.page-head .btn' }],
    },
    {
      id: 'partner-tile', url: null, clip: '.logos .logo-tile:nth-child(2)', clip_padding: 8,
      callouts: [
        { key: 'num', selector: '.logos .logo-tile:nth-child(2) .n' }, { key: 'name', selector: '.logos .logo-tile:nth-child(2) input' },
        { key: 'earlier', selector: '.logos .logo-tile:nth-child(2) [aria-label=تقديم]' }, { key: 'del', selector: '.logos .logo-tile:nth-child(2) [aria-label=حذف]' },
        { key: 'later', selector: '.logos .logo-tile:nth-child(2) [aria-label=تأخير]' },
      ],
    },
    {
      id: 'partners-add', url: null, actions: [{ scroll_to: '.logos .drop' }, { wait: 300 }],
      clip: '.logos .drop', clip_padding: 10,
      callouts: [{ key: 'add', selector: '.logos .drop' }],
    },

    /* ---------- contact ---------- */
    {
      id: 'contact', url: null, actions: [hash('#/contact')], wait_for: '#view .field',
      clip: '#view .grid > .card:nth-child(1)', clip_padding: 8,
      callouts: [
        { key: 'phone', selector: '#view input[type=tel]' }, { key: 'wa', selector: '#view .grid > .card:nth-child(1) .field:nth-child(2) input' },
        { key: 'email', selector: '#view input[type=email]' }, { key: 'site', selector: '#view .grid > .card:nth-child(1) input[type=url]' },
      ],
    },
    {
      id: 'socials', url: null, clip: '#view .grid > .card:nth-child(2)', clip_padding: 8,
      callouts: [{ key: 'li', selector: '#view .grid > .card:nth-child(2) .field:nth-child(1) input' }, { key: 'x', selector: '#view .grid > .card:nth-child(2) .field:nth-child(3) input' }],
    },
    {
      id: 'site-contact', url: '/contact', wait_for: '.contact-card', clip: '.contact-card', clip_padding: 12,
      callouts: [{ key: 'phone', selector: '.contact-card a[data-contact=phone]' }, { key: 'wa', selector: '.contact-card a[data-contact=whatsapp]' }, { key: 'socials', selector: '.contact-card .socials' }],
    },

    /* ---------- messages ---------- */
    {
      id: 'messages', url: '/admin/#/messages', wait_for: 'details.msg',
      callouts: [
        { key: 'badge', selector: '#unread' }, { key: 'filter', selector: '#view .chips' },
        { key: 'unread', selector: 'details.msg.unread' }, { key: 'read', selector: 'details.msg:not(.unread)' },
      ],
    },
    {
      id: 'message-open', url: null, actions: [{ click: 'details.msg.unread summary' }, { wait: 700 }], clip: 'details[open]', clip_padding: 8,
      callouts: [
        { key: 'email', selector: 'details[open] .kv a' }, { key: 'services', selector: 'details[open] .kv .chips' },
        { key: 'reply', selector: 'details[open] >> text=رد بالبريد' }, { key: 'unread', selector: 'details[open] >> text=تعليم كغير مقروءة' },
        { key: 'delete', selector: 'details[open] >> text=حذف' },
      ],
    },

    /* ---------- account ---------- */
    {
      id: 'account', url: null, actions: [hash('#/account')], wait_for: '#view form', clip: '#view form', clip_padding: 8,
      callouts: [
        { key: 'current', selector: '#view input[name=current]' }, { key: 'new', selector: '#view input[name=next]' },
        { key: 'again', selector: '#view input[name=again]' }, { key: 'go', selector: '#view form button[type=submit]' },
      ],
    },
    {
      id: 'logout', url: null, clip: '#view > div:last-child', clip_padding: 10,
      callouts: [{ key: 'out', selector: 'text=تسجيل الخروج' }],
    },
  ],
};
