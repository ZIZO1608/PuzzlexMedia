/* PuzzleX admin panel — one page, no build step. Talks to /api/admin/* (lib/admin.js).
   Every view builds its DOM with h(), which only ever inserts text (never HTML), so whatever is stored
   is shown as typed. Unsaved changes live in the view until "حفظ" sends them; the save bar shows how many. */
'use strict';

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const asset = (src) => (/^(\/|https?:)/.test(src) ? src : `/${src}`);
// the noun after a number in Arabic: 1 and 2 have their own forms, 3–10 (and 0) plural, 11+ singular accusative
const noun = (n, [one, two, few, many]) => (n === 1 ? one : n === 2 ? two : n === 0 || n <= 10 ? few : many);
const fmtDate = (iso) => new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });

function toast(text, kind = 'ok') {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'err' ? 'alert' : 'status' }, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}

async function api(method, path, body, rawType) {
  const headers = { 'X-PX-Admin': '1' };
  if (rawType) headers['Content-Type'] = rawType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api/admin${path}`, { method, headers, credentials: 'same-origin', body: rawType ? body : body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('تعذّر الاتصال بالخادم — تحقق من الإنترنت');
  }
  const data = await res.json().catch(() => ({ ok: false, error: 'استجابة غير متوقعة من الخادم' }));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(data.error || 'انتهت الجلسة — سجّل الدخول من جديد'); }
  if (!data.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

// images are shrunk and turned into WebP in the browser before they're sent: faster site, smaller uploads
async function prepareImage(file, maxSide) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`«${file.name}»: الصور بصيغة JPG أو PNG أو WebP فقط`);
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const cv = h('canvas');
    cv.width = Math.round(bmp.width * scale);
    cv.height = Math.round(bmp.height * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.86));
    if (blob && blob.type === 'image/webp' && (blob.size < file.size || scale < 1)) return blob;
  } catch { /* the browser can't convert it: send the original */ }
  return file;
}
async function upload(file, maxSide) {
  const blob = await prepareImage(file, maxSide);
  if (blob.size > 8 * 1024 * 1024) throw new Error(`«${file.name}» أكبر من 8 ميغابايت`);
  const { src } = await api('POST', '/upload', blob, blob.type);
  return src;
}
function pickFiles(multiple, onFiles) {
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple });
  input.addEventListener('change', () => input.files.length && onFiles([...input.files]));
  input.click();
}
// a dashed drop zone that also opens the file picker
function dropZone(label, multiple, onFiles) {
  const z = h('button', { type: 'button', class: 'drop' }, h('b', null, '+'), label, h('span', { class: 'small' }, 'أو اسحب الصور هنا'));
  z.addEventListener('click', () => pickFiles(multiple, onFiles));
  z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', (e) => {
    e.preventDefault(); z.classList.remove('over');
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  });
  return z;
}
async function busy(btn, job) {
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = '… جارٍ العمل';
  try { return await job(); } finally { btn.disabled = false; btn.textContent = was; }
}

/* ---------- unsaved changes: the bar at the bottom ---------- */
let pending = null; // { count(), save(), discard(), label }
function setPending(p) { pending = p; refreshBar(); }
function refreshBar() {
  const n = pending ? pending.count() : 0;
  $('#savebar').hidden = !n;
  if (n) $('#savebar-text').textContent = `${n === 1 ? 'تغيير غير محفوظ' : `تغييرات غير محفوظة: ${n}`}${pending.label ? ` · ${pending.label}` : ''}`;
}
const dirty = () => Boolean(pending && pending.count());
$('#savebar-save').addEventListener('click', (e) => saveNow(e.currentTarget));
$('#savebar-undo').addEventListener('click', () => { if (pending && confirm('تجاهل كل التغييرات غير المحفوظة؟')) { pending.discard(); refreshBar(); } });
async function saveNow(btn) {
  if (!dirty()) return;
  try { await busy(btn || $('#savebar-save'), () => pending.save()); refreshBar(); toast('تم الحفظ — التغييرات ظاهرة الآن على الموقع'); } catch (err) { toast(err.message, 'err'); }
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
});
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- sign in / out ---------- */
let me = null;
function showLogin() {
  me = null;
  $('#app').hidden = true;
  $('#savebar').hidden = true;
  $('#login').hidden = false;
  setTimeout(() => $('#login-form [name="username"]').focus(), 50);
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget, btn = f.querySelector('button');
  $('#login-error').textContent = '';
  try {
    await busy(btn, () => api('POST', '/login', { username: f.username.value, password: f.password.value }));
    f.password.value = '';
    $('#login').hidden = true;
    await start();
  } catch (err) { $('#login-error').textContent = err.message; }
});

async function refreshMe() {
  const r = await api('GET', '/me');
  me = r.user;
  $('#who').textContent = `مسجّل باسم ${me.name}`;
  const b = $('#unread');
  b.hidden = !r.stats.unread;
  b.textContent = r.stats.unread;
  return r;
}

/* ---------- routing ---------- */
const VIEWS = { home: viewHome, texts: viewTexts, projects: viewProjects, partners: viewPartners, testimonials: viewTestimonials, contact: viewContact, messages: viewMessages, account: viewAccount };
let shownHash = null;
function route() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: VIEWS[name] ? name : 'home', arg: decodeURIComponent(rest.join('/')) };
}
async function render() {
  const { name, arg } = route();
  document.querySelectorAll('#nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.route === name));
  document.querySelectorAll('#nav a[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  const view = $('#view');
  view.replaceChildren(h('p', { class: 'loading' }, 'جارٍ التحميل…'));
  try { await VIEWS[name](view, arg); } catch (err) {
    view.replaceChildren(h('div', { class: 'empty' }, 'تعذّر التحميل: ', err.message, h('br'), h('button', { class: 'btn btn-small', type: 'button', style: 'margin-top:12px', onclick: render }, 'إعادة المحاولة')));
  }
  shownHash = location.hash;
}
window.addEventListener('hashchange', () => {
  // leaving a section with unsaved changes asks first (moving inside the projects section keeps them)
  const leavingSection = shownHash !== null && shownHash.split('/')[1] !== location.hash.split('/')[1];
  if (leavingSection && dirty() && !confirm('لديك تغييرات غير محفوظة. المغادرة بدون حفظ؟')) {
    history.replaceState(null, '', shownHash);
    return;
  }
  if (leavingSection) { setPending(null); proj = null; } // unsaved project edits are dropped with the section
  render();
});

async function start() {
  await refreshMe();
  $('#app').hidden = false;
  render();
}

/* =========================================================
   Home
   ========================================================= */
async function viewHome(view) {
  const { stats } = await refreshMe();
  const hour = new Date().getHours();
  const stat = (n, label, href, hot) => h('a', { class: `stat${hot ? ' hot' : ''}`, href }, h('b', null, n), h('span', null, label));
  const short = (title, text, href) => h('a', { class: 'card stat', href }, h('strong', null, title), h('span', null, text));
  let recent = [];
  try { recent = (await api('GET', '/messages')).messages.slice(0, 3); } catch { /* the dashboard still works */ }
  view.replaceChildren(...[
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'PUZZLEX ADMIN'),
      h('h1', null, `${hour < 12 ? 'صباح الخير' : 'مساء الخير'}، ${me.name}`),
      h('p', null, 'من هنا تعدّل كل ما يظهر على الموقع: النصوص بالعربية والإنجليزية، المشاريع وصورها، شعارات الشركاء، آراء العملاء، ومعلومات التواصل. كل تغيير تحفظه يظهر على الموقع فورًا.'))),
    h('div', { class: 'stats' },
      stat(stats.unread, noun(stats.unread, ['رسالة جديدة', 'رسالتان جديدتان', 'رسائل جديدة', 'رسالة جديدة']), '#/messages', stats.unread > 0),
      stat(stats.projects, noun(stats.projects, ['مشروع', 'مشروعان', 'مشاريع', 'مشروعًا']), '#/projects'),
      stat(stats.partners, noun(stats.partners, ['شعار شريك', 'شعارا شريكين', 'شعارات شركاء', 'شعار شريك']), '#/partners'),
      stat(stats.testimonials, noun(stats.testimonials, ['رأي عميل', 'رأيا عميلين', 'آراء عملاء', 'رأي عميل']), '#/testimonials'),
      stat(stats.editedTexts, noun(stats.editedTexts, ['نص معدّل', 'نصان معدّلان', 'نصوص معدّلة', 'نصًا معدّلًا']), '#/texts')),
    h('h2', { class: 'section-title' }, 'ماذا تريد أن تعدّل؟'),
    h('div', { class: 'stats' },
      short('النصوص', 'العناوين والفقرات والأزرار في كل الصفحات', '#/texts'),
      short('المشاريع', 'أضف مشروعًا، ارفع صوره، رتّب الأعمال', '#/projects'),
      short('شعارات الشركاء', 'الشعارات في أحجية «شركاء النجاح»', '#/partners'),
      short('آراء العملاء', 'ما يقوله عملاؤكم، في الصفحة الرئيسية', '#/testimonials'),
      short('التواصل والروابط', 'الهاتف، واتساب، البريد، حسابات التواصل', '#/contact')),
    recent.length ? h('h2', { class: 'section-title' }, 'آخر الرسائل') : null,
    recent.length ? h('div', { class: 'msgs' }, recent.map((m) => h('a', { class: `msg card${m.read ? '' : ' unread'}`, href: '#/messages', style: 'display:grid;gap:4px' },
      h('strong', null, m.name, m.company ? ` — ${m.company}` : ''), h('span', { class: 'muted small' }, fmtDate(m.date)),
      h('span', { class: 'muted' }, m.message.length > 140 ? `${m.message.slice(0, 140)}…` : m.message)))) : null,
  ].filter(Boolean));
}

/* =========================================================
   Texts
   ========================================================= */
const TEXT_GROUPS = [
  ['shared', 'مشترك بين الصفحات', '/'], ['index.html', 'الرئيسية', '/'], ['about.html', 'من نحن', '/about'],
  ['services.html', 'خدماتنا', '/services'], ['work.html', 'أعمالنا', '/work'], ['project.html', 'صفحة المشروع', '/project.html?id=lcoy'],
  ['contact.html', 'تواصل معنا', '/contact'], ['404.html', 'صفحة 404', '/404-test'], ['scripts', 'الرسوم المتحركة والتفاعلات', '/'],
  ['seo', 'عناوين الصفحات ووصف المشاركة', '/'],
];
const PAGE_NAMES = Object.fromEntries(TEXT_GROUPS.slice(1, 8).map(([k, n]) => [k, n]));
const CTX = {
  h1: 'العنوان الرئيسي', h2: 'عنوان', h3: 'عنوان فرعي', h4: 'عنوان فرعي', p: 'فقرة', a: 'رابط', button: 'زر', label: 'اسم حقل',
  legend: 'عنوان مجموعة', li: 'عنصر قائمة', span: 'نص', strong: 'نص بارز', em: 'نص', b: 'نص بارز', dt: 'تسمية', dd: 'قيمة',
  figcaption: 'وصف صورة', blockquote: 'اقتباس', title: 'عنوان الصفحة (تبويب المتصفح)', description: 'وصف الصفحة في محركات البحث',
  'og:title': 'عنوان المشاركة (واتساب، فيسبوك…)', 'og:description': 'وصف المشاركة (واتساب، فيسبوك…)', 'twitter:title': 'عنوان المشاركة على X',
  'twitter:description': 'وصف المشاركة على X', placeholder: 'نص توضيحي داخل حقل', script: 'نص يظهر في الرسوم أو التفاعلات', option: 'خيار',
};
function groupOf(t) {
  if (t.kind === 'seo') return 'seo';
  const html = t.pages.filter((p) => !p.startsWith('script:'));
  if (!html.length) return 'scripts';
  return html.length > 1 ? 'shared' : html[0];
}

async function viewTexts(view) {
  let texts = (await api('GET', '/texts')).texts;
  const edits = new Map(); // key → { ar, en } typed but not saved
  let group = sessionStorage.getItem('px-text-group') || 'index.html';
  let query = '', onlyEdited = false;

  const list = h('div', { class: 'text-list' });
  const chips = h('div', { class: 'chips' });
  const search = h('input', { type: 'search', placeholder: 'ابحث في كل النصوص — بالعربية أو الإنجليزية', 'aria-label': 'بحث في النصوص' });
  const editedChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, 'المعدّلة فقط');
  editedChip.addEventListener('click', () => { onlyEdited = !onlyEdited; editedChip.setAttribute('aria-pressed', String(onlyEdited)); draw(); });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });

  setPending({
    label: 'النصوص',
    count: () => edits.size,
    discard: () => { edits.clear(); draw(); },
    save: async () => {
      const changes = [...edits].map(([key, v]) => ({ key, ...v }));
      texts = (await api('PATCH', '/texts', { changes })).texts;
      edits.clear();
      draw();
    },
  });

  function drawChips() {
    const counts = {};
    for (const t of texts) counts[groupOf(t)] = (counts[groupOf(t)] || 0) + 1;
    chips.replaceChildren(...TEXT_GROUPS.filter(([k]) => counts[k]).map(([k, name]) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!query && k === group) }, name, h('i', null, counts[k]));
      b.addEventListener('click', () => { group = k; sessionStorage.setItem('px-text-group', k); search.value = ''; query = ''; draw(); });
      return b;
    }), editedChip);
  }

  function item(t) {
    const cur = edits.get(t.key) || t.value;
    const box = h('div', { class: `text-item${t.edited ? ' edited' : ''}${edits.has(t.key) ? ' dirty' : ''}` });
    const area = (lang) => {
      const ta = h('textarea', { dir: lang === 'ar' ? 'rtl' : 'ltr', lang, rows: 1, value: cur[lang], 'aria-label': lang === 'ar' ? 'النص بالعربية' : 'النص بالإنجليزية' });
      const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
      requestAnimationFrame(fit);
      ta.addEventListener('input', () => {
        fit();
        const next = { ...(edits.get(t.key) || t.value), [lang]: ta.value };
        if (same(next, t.value)) edits.delete(t.key); else edits.set(t.key, next);
        box.classList.toggle('dirty', edits.has(t.key));
        refreshBar();
      });
      return ta;
    };
    const where = t.pages.filter((p) => !p.startsWith('script:')).map((p) => PAGE_NAMES[p] || p);
    box.append(...[
      h('div', { class: 'text-meta' },
        h('span', { class: 'tag' }, CTX[t.ctx] || 'نص'),
        where.length ? h('span', null, `يظهر في: ${where.join('، ')}`) : h('span', null, 'يظهر في الرسوم المتحركة والتفاعلات'),
        t.edited ? h('span', { class: 'tag lime' }, 'معدّل') : null,
        h('span', { class: 'spacer' }),
        t.edited || edits.has(t.key) ? h('button', {
          type: 'button', class: 'btn btn-small btn-ghost',
          onclick: () => { edits.set(t.key, { ...t.default }); if (same(t.default, t.value)) edits.delete(t.key); draw(); refreshBar(); },
        }, 'استرجاع الأصل') : null),
      h('div', { class: 'text-pair' },
        h('label', null, h('span', null, 'العربية'), area('ar')),
        h('label', null, h('span', null, 'English'), area('en'))),
      t.edited ? h('p', { class: 'default-note' }, 'الأصل: ', h('s', null, t.default.ar), ' · ', h('s', { dir: 'ltr' }, t.default.en)) : null,
    ].filter(Boolean));
    return box;
  }

  function draw() {
    drawChips();
    let shown = texts;
    if (query) shown = shown.filter((t) => `${t.value.ar} ${t.value.en} ${t.default.ar} ${t.default.en}`.toLowerCase().includes(query));
    else shown = shown.filter((t) => groupOf(t) === group);
    if (onlyEdited) shown = shown.filter((t) => t.edited || edits.has(t.key));
    list.replaceChildren(...(shown.length ? shown.map(item) : [h('p', { class: 'empty' }, query ? 'لا نتائج لهذا البحث.' : 'لا نصوص هنا.')]));
    refreshBar();
  }

  const g = TEXT_GROUPS.find(([k]) => k === group);
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'TEXTS'),
      h('h1', null, 'النصوص'),
      h('p', null, 'كل نص على الموقع بلغتيه جنبًا إلى جنب. عدّل ما تريد ثم اضغط «حفظ التغييرات». النص المشترك (مثل روابط القائمة) يتغيّر في كل الصفحات معًا. اترك الحقل فارغًا ليعود إلى الأصل.')),
      h('a', { class: 'btn btn-ghost', href: g ? g[2] : '/', target: '_blank', rel: 'noopener' }, 'افتح الصفحة ↗')),
    h('div', { class: 'toolbar' }, search, chips),
    list,
  );
  draw();
}

/* =========================================================
   Projects
   ========================================================= */
let proj = null; // { data, saved, rev, partners } kept while moving between the list and the editor
async function loadProjects(force) {
  if (proj && !force) return proj;
  const [p, parts] = await Promise.all([api('GET', '/projects'), api('GET', '/partners')]);
  proj = { data: p.data, saved: clone(p.data), rev: p.rev, partners: parts.data };
  return proj;
}
function projectsPending() {
  setPending({
    label: 'المشاريع',
    count: () => {
      if (!proj) return 0;
      const { data, saved } = proj;
      const ids = new Set([...data.projects.map((p) => p.id), ...saved.projects.map((p) => p.id)]);
      let n = 0;
      for (const id of ids) if (!same(data.projects.find((p) => p.id === id), saved.projects.find((p) => p.id === id))) n++;
      if (!n && !same(data.projects.map((p) => p.id), saved.projects.map((p) => p.id))) n = 1; // only the order changed
      if (!same(data.sectors, saved.sectors)) n++;
      return n;
    },
    discard: () => { proj.data = clone(proj.saved); render(); },
    save: async () => {
      const r = await api('PUT', '/projects', { rev: proj.rev, data: proj.data });
      proj.data = r.data; proj.saved = clone(r.data); proj.rev = r.rev;
      render();
    },
  });
}
const sectorName = (k) => (proj.data.sectors[k] && proj.data.sectors[k].ar) || k;

async function viewProjects(view, arg) {
  await loadProjects();
  projectsPending();
  if (arg) return projectEditor(view, arg);
  const { data } = proj;
  const move = (i, d) => { const a = data.projects; [a[i], a[i + d]] = [a[i + d], a[i]]; render(); };

  const sectorsCard = h('div', { class: 'card grid' }, h('h2', { class: 'section-title', style: 'margin:0' }, 'أسماء القطاعات (أزرار التصفية في صفحة الأعمال)'),
    ...Object.keys(data.sectors).map((k) => h('div', { class: 'pair' },
      ['ar', 'en'].map((lang) => h('label', { class: 'field' }, h('span', null, `${lang === 'ar' ? 'بالعربية' : 'English'}`),
        h('input', { value: data.sectors[k][lang], dir: lang === 'ar' ? 'rtl' : 'ltr', oninput: (e) => { data.sectors[k][lang] = e.target.value; refreshBar(); } }))))));

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'WORK'),
      h('h1', null, 'المشاريع'),
      h('p', null, 'المشاريع بالترتيب الذي تظهر به في صفحة «أعمالنا». أضف مشروعًا جديدًا أو افتح أي مشروع لتعديل نصوصه وصوره.')),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-ghost', href: '/work', target: '_blank', rel: 'noopener' }, 'افتح صفحة الأعمال ↗'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: addProject }, '+ مشروع جديد'))),
    h('div', { class: 'proj-list' }, data.projects.map((p, i) => h('div', { class: 'proj-row' },
      p.cover ? h('div', { class: 'thumb' }, h('img', { src: asset(p.cover), alt: '' })) : h('div', { class: 'thumb logo' }, h('img', { src: asset(p.logo), alt: '' })),
      h('div', null,
        h('div', { class: 't' }, p.title.ar || '(بدون عنوان)'),
        h('div', { class: 'c' }, p.client.ar, ' · ', sectorName(p.sector), p.year ? ` · ${p.year}` : '', p.gallery.length ? ` · ${p.gallery.length} صور` : ' · صور مؤقتة')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === data.projects.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('a', { class: 'btn btn-small btn-primary', href: `#/projects/${encodeURIComponent(p.id)}` }, 'تعديل'))))),
    h('div', { style: 'margin-top:26px' }, sectorsCard),
  );
}

function addProject() {
  let n = 1;
  while (proj.data.projects.some((p) => p.id === `project-${n}`)) n++;
  const p = {
    id: `project-${n}`, sector: 'brand', year: new Date().getFullYear(),
    client: { ar: '', en: '' }, title: { ar: '', en: '' }, summary: { ar: '', en: '' }, services: { ar: [], en: [] },
    logo: proj.partners[0] ? proj.partners[0].src : 'assets/partners/p01.webp', colors: ['#1f8f63', '#0b3d2d'], cover: '', gallery: [], _new: true,
  };
  proj.data.projects.unshift(p);
  location.hash = `#/projects/${encodeURIComponent(p.id)}`;
}

function projectEditor(view, id) {
  const p = proj.data.projects.find((x) => x.id === id);
  if (!p) { view.replaceChildren(h('div', { class: 'empty' }, 'المشروع غير موجود. ', h('a', { href: '#/projects' }, 'العودة إلى المشاريع'))); return; }
  const changed = () => refreshBar();
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 50);

  const pairField = (label, key, multiline, required) => h('div', { class: 'pair' }, ['ar', 'en'].map((lang) => h('label', { class: 'field' },
    h('span', null, `${label} — ${lang === 'ar' ? 'بالعربية' : 'English'}`, required && lang === 'ar' ? h('b', null, ' *') : null),
    h(multiline ? 'textarea' : 'input', {
      value: p[key][lang], dir: lang === 'ar' ? 'rtl' : 'ltr', rows: multiline ? 5 : null,
      oninput: (e) => {
        p[key][lang] = e.target.value;
        if (p._new && !p._idTouched && lang === 'en' && (key === 'client' || key === 'title')) { idInput.value = p.id = slugify(`${p.client.en} ${p.title.en}`) || p.id; showId(); }
        changed();
      },
    }))));

  // the page address updates as the link name is typed
  const idHint = h('span', { class: 'hint ltr' });
  const showId = () => { idHint.textContent = `www.puzzlexmedia.com/project.html?id=${p.id}`; };
  showId();
  const idInput = h('input', { value: p.id, dir: 'ltr', oninput: (e) => { p.id = e.target.value.trim().toLowerCase(); p._idTouched = true; showId(); changed(); }, onchange: () => history.replaceState(null, '', `#/projects/${encodeURIComponent(p.id)}`) });

  const servicesField = h('div', { class: 'pair' }, ['ar', 'en'].map((lang) => h('label', { class: 'field' },
    h('span', null, `الخدمات المقدّمة — ${lang === 'ar' ? 'بالعربية' : 'English'}`),
    h('input', { value: p.services[lang].join(lang === 'ar' ? '، ' : ', '), dir: lang === 'ar' ? 'rtl' : 'ltr', oninput: (e) => { p.services[lang] = e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean); changed(); } }),
    h('span', { class: 'hint' }, 'افصل بين الخدمات بفاصلة')))) ;

  const logoBox = h('div', { class: 'logo-box' }, h('img', { src: asset(p.logo), alt: 'الشعار' }));
  const setLogo = (src) => { p.logo = src; logoBox.replaceChildren(h('img', { src: asset(src), alt: 'الشعار' })); changed(); };
  const pickLogo = () => {
    const dlg = h('dialog', null, h('h2', null, 'اختر شعار العميل من شعارات الشركاء'),
      h('div', { class: 'pick-grid' }, proj.partners.map((pt) => h('button', { type: 'button', title: pt.name || '', onclick: () => { setLogo(pt.src); dlg.close(); } }, h('img', { src: asset(pt.src), alt: pt.name || '', loading: 'lazy' })))),
      h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'إغلاق'));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  };

  const coverWrap = h('div', { class: 'images' });
  const drawCover = () => coverWrap.replaceChildren(p.cover
    ? h('div', { class: 'img-tile' }, h('img', { src: asset(p.cover), alt: 'صورة الغلاف' }), h('div', { class: 'acts' },
      h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => { p.cover = ''; drawCover(); changed(); } }, 'إزالة')))
    : dropZone('رفع صورة الغلاف', false, async ([f]) => {
      try { toast('جارٍ رفع الصورة…'); p.cover = await upload(f, 1600); drawCover(); changed(); } catch (err) { toast(err.message, 'err'); }
    }));
  drawCover();

  const gallery = h('div', { class: 'images' });
  const drawGallery = () => gallery.replaceChildren(
    ...p.gallery.map((src, i) => h('div', { class: 'img-tile' }, h('img', { src: asset(src), alt: `صورة ${i + 1}` }), h('div', { class: 'acts' },
      h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => { [p.gallery[i - 1], p.gallery[i]] = [p.gallery[i], p.gallery[i - 1]]; drawGallery(); changed(); } }, '→'),
      h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف', 'aria-label': 'حذف', onclick: () => { p.gallery.splice(i, 1); drawGallery(); changed(); } }, '✕'),
      h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === p.gallery.length - 1, onclick: () => { [p.gallery[i + 1], p.gallery[i]] = [p.gallery[i], p.gallery[i + 1]]; drawGallery(); changed(); } }, '←')))),
    dropZone('إضافة صور', true, async (files) => {
      for (const [k, f] of files.entries()) {
        try { toast(`جارٍ رفع الصورة ${k + 1} من ${files.length}…`); p.gallery.push(await upload(f, 2000)); drawGallery(); changed(); } catch (err) { toast(err.message, 'err'); }
      }
    }));
  drawGallery();

  const remove = () => {
    if (!confirm(`حذف مشروع «${p.title.ar || p.id}»؟ يمكنك التراجع قبل الحفظ.`)) return;
    proj.data.projects.splice(proj.data.projects.indexOf(p), 1);
    location.hash = '#/projects';
  };

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'PROJECT'),
      h('h1', null, p.title.ar || 'مشروع جديد'),
      h('p', null, h('a', { href: '#/projects' }, '→ كل المشاريع'))),
      h('div', { class: 'row' },
        p._new ? null : h('a', { class: 'btn btn-ghost', href: `/project.html?id=${encodeURIComponent(p.id)}`, target: '_blank', rel: 'noopener' }, 'عرض على الموقع ↗'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: remove }, 'حذف المشروع'))),
    h('div', { class: 'editor' },
      h('div', { class: 'card' }, h('h2', null, 'النصوص'),
        pairField('اسم العميل', 'client', false, true),
        pairField('عنوان المشروع', 'title', false, true),
        pairField('وصف المشروع', 'summary', true),
        servicesField),
      h('div', { class: 'card' }, h('h2', null, 'التصنيف'),
        h('div', { class: 'two' },
          h('label', { class: 'field' }, h('span', null, 'القطاع'),
            h('select', { onchange: (e) => { p.sector = e.target.value; changed(); } }, Object.keys(proj.data.sectors).map((k) => h('option', { value: k, selected: p.sector === k }, sectorName(k))))),
          h('label', { class: 'field' }, h('span', null, 'السنة (اختياري)'),
            h('input', { type: 'number', min: 1990, max: 2100, value: p.year, dir: 'ltr', oninput: (e) => { p.year = e.target.value; changed(); } }))),
        h('label', { class: 'field' }, h('span', null, 'اسم الرابط (بالإنجليزية)'), idInput,
          idHint,
          p._new ? null : h('span', { class: 'hint' }, 'تغييره يكسر الروابط القديمة التي شاركها أحد.'))),
      h('div', { class: 'card' }, h('h2', null, 'الشعار'),
        h('div', { class: 'logo-pick' }, logoBox, h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn', onclick: pickLogo }, 'اختيار من شعارات الشركاء'),
          h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => pickFiles(false, async ([f]) => { try { setLogo(await upload(f, 600)); } catch (err) { toast(err.message, 'err'); } }) }, 'رفع شعار جديد')))),
      h('div', { class: 'card' }, h('h2', null, 'صورة الغلاف'),
        h('p', { class: 'hint' }, 'تظهر في بطاقة المشروع في صفحة الأعمال. بدونها يظهر غلاف مؤقت بألوان المشروع والشعار.'), coverWrap),
      h('div', { class: 'card' }, h('h2', null, 'معرض الصور'),
        h('p', { class: 'hint' }, 'صور صفحة المشروع، بالترتيب: الأولى عريضة ثم صورتان متجاورتان، وهكذا. تُصغَّر الصور تلقائيًا قبل الرفع.'), gallery),
      h('div', { class: 'card' }, h('h2', null, 'ألوان الغلاف المؤقت'),
        h('div', { class: 'row' }, [0, 1].map((k) => h('label', { class: 'row' }, h('input', { type: 'color', value: p.colors[k], oninput: (e) => { p.colors[k] = e.target.value; changed(); } }), k ? 'اللون الثاني' : 'اللون الأول')))),
    ),
  );
}

/* =========================================================
   Partner logos
   ========================================================= */
async function viewPartners(view) {
  const r = await api('GET', '/partners');
  let saved = r.data, rev = r.rev, list = clone(r.data);
  setPending({
    label: 'الشعارات',
    count: () => (same(list, saved) ? 0 : Math.max(1, list.filter((x, i) => !same(x, saved[i])).length + Math.max(0, saved.length - list.length))),
    discard: () => { list = clone(saved); draw(); },
    save: async () => { const s = await api('PUT', '/partners', { rev, data: list }); saved = s.data; rev = s.rev; list = clone(saved); draw(); },
  });
  const grid = h('div', { class: 'logos' });
  const info = h('p', { class: 'hint' });
  const size = (n) => { let g = 3; while (g * g - 1 < n) g += 2; return g; };
  function draw() {
    const g = size(list.length);
    info.textContent = `${list.length} شعارًا → أحجية ${g}×${g}${g * g - 1 > list.length ? ` (${g * g - 1 - list.length} قطع بيضاء فارغة)` : ''}. الأحجية تكبر وتصغر تلقائيًا: حتى 24 شعارًا 5×5، حتى 48 → 7×7، حتى 80 → 9×9.`;
    grid.replaceChildren(...list.map((pt, i) => h('div', { class: 'logo-tile' },
      h('span', { class: 'n' }, `#${i + 1}`),
      h('div', { class: 'logo-box' }, h('img', { src: asset(pt.src), alt: pt.name || '', loading: 'lazy' })),
      h('input', { value: pt.name, placeholder: 'اسم الشريك (اختياري)', title: 'يظهر عند تمرير الماوس فوق الشعار في الأحجية', 'aria-label': 'اسم الشريك', oninput: (e) => { pt.name = e.target.value; refreshBar(); } }),
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } }, '→'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف', 'aria-label': 'حذف', onclick: () => { list.splice(i, 1); draw(); } }, '✕'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } }, '←')))),
    dropZone('إضافة شعارات', true, async (files) => {
      for (const [k, f] of files.entries()) {
        try { toast(`جارٍ رفع الشعار ${k + 1} من ${files.length}…`); list.push({ id: '', src: await upload(f, 600), name: f.name.replace(/\.\w+$/, '') }); draw(); } catch (err) { toast(err.message, 'err'); }
      }
    }));
    refreshBar();
  }
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'PARTNERS'),
      h('h1', null, 'شعارات الشركاء'),
      h('p', null, 'الشعارات التي تتجمّع في أحجية «شركاء النجاح» في الصفحة الرئيسية. الأفضل شعار بخلفية شفافة (PNG أو WebP)؛ يظهر على قطعة بيضاء.')),
      h('a', { class: 'btn btn-ghost', href: '/#partners', target: '_blank', rel: 'noopener' }, 'افتح الصفحة الرئيسية ↗')),
    info, h('div', { style: 'height:12px' }), grid);
  draw();
}

/* =========================================================
   Client feedback (testimonials)
   ========================================================= */
async function viewTestimonials(view) {
  const [r, parts] = await Promise.all([api('GET', '/testimonials'), api('GET', '/partners')]);
  let saved = r.data, rev = r.rev, list = clone(r.data);
  setPending({
    label: 'آراء العملاء',
    // compared by id, so adding one at the top counts as one change, not a shift of all the others
    count: () => {
      if (same(list, saved)) return 0;
      const before = new Map(saved.map((t) => [t.id, t]));
      const changed = list.filter((t) => !same(t, before.get(t.id))).length;
      const removed = saved.filter((s) => !list.some((t) => t.id === s.id)).length;
      return Math.max(1, changed + removed); // 1 when only the order changed
    },
    discard: () => { list = clone(saved); draw(); },
    save: async () => { const s = await api('PUT', '/testimonials', { rev, data: list }); saved = s.data; rev = s.rev; list = clone(saved); draw(); },
  });
  const box = h('div', { class: 'tm-admin' });
  const info = h('p', { class: 'hint' });
  const lang2 = (lang) => (lang === 'ar' ? 'بالعربية' : 'English');

  function card(t, i) {
    const face = h('div', { class: 'tm-face-box' });
    const drawFace = () => face.replaceChildren(t.photo
      ? h('img', { src: asset(t.photo), alt: '', class: /^assets\/partners\//.test(t.photo) ? 'logo' : null })
      : h('span', null, [...(t.name.ar || t.name.en || '؟')][0]));
    drawFace();
    const setPhoto = (src) => { t.photo = src; drawFace(); photoActs(); refreshBar(); };
    const pickPartner = () => {
      const dlg = h('dialog', null, h('h2', null, 'اختر شعار الشركة من شعارات الشركاء'),
        h('div', { class: 'pick-grid' }, parts.data.map((pt) => h('button', { type: 'button', title: pt.name || '', onclick: () => { setPhoto(pt.src); dlg.close(); } }, h('img', { src: asset(pt.src), alt: pt.name || '', loading: 'lazy' })))),
        h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'إغلاق'));
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
    };
    const acts = h('div', { class: 'row' });
    const photoActs = () => acts.replaceChildren(...[
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => pickFiles(false, async ([f]) => { try { toast('جارٍ رفع الصورة…'); setPhoto(await upload(f, 400)); } catch (err) { toast(err.message, 'err'); } }) }, 'رفع صورة'),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: pickPartner }, 'من شعارات الشركاء'),
      t.photo ? h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => setPhoto('') }, 'إزالة الصورة') : null,
    ].filter(Boolean));
    photoActs();

    const pairField = (label, key, multiline, required) => h('div', { class: 'pair' }, ['ar', 'en'].map((lang) => h('label', { class: 'field' },
      h('span', null, `${label} — ${lang2(lang)}`, required && lang === 'ar' ? h('b', null, ' *') : null),
      h(multiline ? 'textarea' : 'input', {
        value: t[key][lang], dir: lang === 'ar' ? 'rtl' : 'ltr', lang, rows: multiline ? 4 : null,
        oninput: (e) => { t[key][lang] = e.target.value; if (key === 'name' && !t.photo) drawFace(); refreshBar(); },
      }))));

    const el = h('div', { class: `card tm-item${t.visible ? '' : ' off'}` },
      h('div', { class: 'tm-item-head' },
        h('span', { class: 'tag' }, `#${i + 1}`),
        h('label', { class: 'tm-switch' },
          h('input', { type: 'checkbox', checked: t.visible, onchange: (e) => { t.visible = e.target.checked; el.classList.toggle('off', !t.visible); refreshBar(); } }),
          'ظاهر على الموقع'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } }, '↑'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } }, '↓'),
        h('button', {
          type: 'button', class: 'btn btn-small btn-danger',
          onclick: () => { if (confirm(`حذف رأي «${t.name.ar || t.name.en || 'بدون اسم'}»؟ يمكنك التراجع قبل الحفظ.`)) { list.splice(i, 1); draw(); } },
        }, 'حذف')),
      h('div', { class: 'tm-person' }, face, h('div', { class: 'grid', style: 'gap:8px' },
        h('span', { class: 'hint' }, 'صورة العميل أو شعار شركته (اختياري). بدونها يظهر أول حرف من الاسم.'), acts)),
      pairField('اسم العميل', 'name', false, true),
      pairField('المنصب والشركة (اختياري)', 'role'),
      pairField('نص الرأي', 'quote', true, true),
      h('label', { class: 'field', style: 'max-width:260px' }, h('span', null, 'التقييم'),
        h('select', { onchange: (e) => { t.rating = Number(e.target.value); refreshBar(); } },
          [5, 4, 3, 2, 1, 0].map((n) => h('option', { value: n, selected: t.rating === n }, n ? `${'★'.repeat(n)}  (${n} من 5)` : 'بدون نجوم')))));
    return el;
  }

  function draw() {
    const shown = list.filter((t) => t.visible).length;
    info.textContent = list.length
      ? `${list.length} ${noun(list.length, ['رأي', 'رأيان', 'آراء', 'رأيًا'])} · ${shown} ظاهر على الموقع. الاسم والنص مطلوبان بلغة واحدة على الأقل؛ إن تركت الإنجليزية فارغة تعرض الصفحة الإنجليزية النص العربي (والعكس).`
      : '';
    box.replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'empty' }, 'لا آراء بعد. أضف أول رأي — يظهر قسم «ماذا يقول عملاؤنا» في الصفحة الرئيسية تلقائيًا عندما يكون هناك رأي ظاهر واحد على الأقل.')]));
    refreshBar();
  }
  const add = () => {
    list.unshift({ id: '', name: { ar: '', en: '' }, role: { ar: '', en: '' }, quote: { ar: '', en: '' }, photo: '', rating: 5, visible: true });
    draw();
    box.querySelector('input:not([type])')?.focus();
  };
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'CLIENT FEEDBACK'),
      h('h1', null, 'آراء العملاء'),
      h('p', null, 'ما يقوله عملاؤكم عنكم، بالعربية والإنجليزية. تظهر بهذا الترتيب في قسم «ماذا يقول عملاؤنا» في الصفحة الرئيسية، بعد أحجية الشركاء. أخفِ الرأي بدل حذفه إن أردت إرجاعه لاحقًا.')),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-ghost', href: '/#testimonials-title', target: '_blank', rel: 'noopener' }, 'افتح الصفحة الرئيسية ↗'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, '+ رأي جديد'))),
    info, h('div', { style: 'height:12px' }), box);
  draw();
}

/* =========================================================
   Contact & links
   ========================================================= */
async function viewContact(view) {
  const r = await api('GET', '/settings');
  let saved = r.data, rev = r.rev, s = clone(r.data);
  const FIELDS = [
    ['معلومات التواصل', [
      ['phone', 'رقم الهاتف', 'tel', '+971 50 123 4567', 'يظهر في تذييل كل الصفحات وفي صفحة التواصل.'],
      ['whatsapp', 'رقم واتساب', 'tel', '+971 50 123 4567', 'زر «واتساب» في صفحة التواصل يفتح المحادثة مباشرة.'],
      ['email', 'البريد الإلكتروني', 'email', 'hello@puzzlexmedia.com', ''],
      ['website', 'الموقع', 'url', 'https://www.puzzlexmedia.com', ''],
    ]],
    ['حسابات التواصل الاجتماعي', [
      ['linkedin', 'LinkedIn', 'url', 'https://www.linkedin.com/company/…', ''],
      ['instagram', 'Instagram', 'url', 'https://www.instagram.com/…', ''],
      ['x', 'X (تويتر)', 'url', 'https://x.com/…', ''],
      ['facebook', 'Facebook', 'url', 'https://www.facebook.com/…', ''],
    ]],
  ];
  setPending({
    label: 'التواصل',
    count: () => Object.keys(s).filter((k) => s[k] !== saved[k]).length,
    discard: () => { s = clone(saved); draw(); },
    save: async () => { const x = await api('PUT', '/settings', { rev, data: s }); saved = x.data; rev = x.rev; s = clone(saved); draw(); },
  });
  const body = h('div', { class: 'grid' });
  function draw() {
    body.replaceChildren(...FIELDS.map(([title, fields]) => h('div', { class: 'card grid' }, h('h2', { class: 'section-title', style: 'margin:0' }, title),
      h('div', { class: 'grid two' }, fields.map(([k, label, type, ph, hint]) => h('label', { class: 'field' }, h('span', null, label),
        h('input', { type, value: s[k] || '', placeholder: ph, dir: 'ltr', oninput: (e) => { s[k] = e.target.value; refreshBar(); } }),
        h('span', { class: 'hint' }, hint || 'اتركه فارغًا ليختفي من الموقع (لا يظهر رابط أو أيقونة فارغة).')))))));
    refreshBar();
  }
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'CONTACT'),
      h('h1', null, 'التواصل والروابط'),
      h('p', null, 'أرقام التواصل والبريد وحسابات التواصل الاجتماعي. تظهر في تذييل كل صفحة وفي صفحة «تواصل معنا».')),
      h('a', { class: 'btn btn-ghost', href: '/contact', target: '_blank', rel: 'noopener' }, 'افتح صفحة التواصل ↗')),
    body, mailCard());
  draw();
}

// the contact form's automatic emails: what's on, and a button that sends every one of them to the team as a test
function mailCard() {
  const card = h('div', { class: 'card grid', style: 'margin-top:16px' }, h('h2', { class: 'section-title', style: 'margin:0' }, 'الرسائل التلقائية بالبريد'), h('p', { class: 'muted' }, 'جارٍ التحميل…'));
  api('GET', '/mail').then((m) => {
    const line = (on, text) => h('li', null, on ? '✅ ' : '⚪ ', text);
    const btn = h('button', { type: 'button', class: 'btn btn-primary', disabled: !m.enabled }, 'أرسل لي رسائل تجريبية');
    btn.onclick = async () => {
      try { const r = await busy(btn, () => api('POST', '/mail/test', {})); toast(`أُرسلت 4 رسائل تجريبية إلى ${r.to} — تفقّد البريد (والرسائل غير المرغوب فيها)`); } catch (err) { toast(err.message, 'err'); }
    };
    card.replaceChildren(card.firstChild,
      m.enabled
        ? h('ul', { style: 'margin:0;padding-inline-start:0;list-style:none;display:grid;gap:8px' },
          line(true, h('span', null, 'إشعار بكل طلب جديد يصل إلى ', h('b', { class: 'ltr' }, m.to))),
          line(m.autoreply, m.autoreply ? 'ردّ تلقائي للعميل: «سيتواصل معك فريقنا خلال 48 ساعة» بلغة الصفحة' : 'الردّ التلقائي للعميل متوقف (AUTOREPLY=0)'),
          line(m.reminderHours > 0, m.reminderHours > 0 ? `تذكير للفريق إن بقي طلب دون فتح ${m.reminderHours} ساعة (ما عدا يوم الجمعة)` : 'التذكير متوقف (REMINDER_HOURS=0)'))
        : h('p', null, '⚠️ البريد غير مفعّل: الطلبات تُحفظ هنا فقط. أضف إعدادات SMTP و CONTACT_TO في Hostinger ثم أعد النشر.'),
      h('div', { class: 'row' }, btn,
        h('span', { class: 'hint' }, 'تصلك 4 رسائل: ردّ العميل بالعربية والإنجليزية، وإشعار الفريق، ورسالة التذكير — لترى ما يصل للعملاء تمامًا.')));
  }).catch((err) => card.replaceChildren(card.firstChild, h('p', { class: 'muted' }, `تعذّر تحميل حالة البريد: ${err.message}`)));
  return card;
}

/* =========================================================
   Messages
   ========================================================= */
async function viewMessages(view) {
  setPending(null);
  const r = await api('GET', '/messages');
  let msgs = r.messages, onlyUnread = false;
  const labels = r.services || {};
  const list = h('div', { class: 'msgs' });
  const filter = h('div', { class: 'chips' });
  const setRead = async (m, read) => {
    await api('PATCH', `/messages/${m.id}`, { read });
    m.read = read;
    refreshMe().catch(() => {});
  };
  function draw() {
    const unread = msgs.filter((m) => !m.read).length;
    filter.replaceChildren(
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!onlyUnread), onclick: () => { onlyUnread = false; draw(); } }, 'الكل', h('i', null, msgs.length)),
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(onlyUnread), onclick: () => { onlyUnread = true; draw(); } }, 'غير المقروءة', h('i', null, unread)));
    const shown = onlyUnread ? msgs.filter((m) => !m.read) : msgs;
    list.replaceChildren(...(shown.length ? shown.map((m) => {
      const d = h('details', { class: `msg${m.read ? '' : ' unread'}` },
        h('summary', null, h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('span', { class: 'who' }, m.name, m.company ? h('small', null, ` — ${m.company}`) : null),
          h('span', { class: 'when' }, fmtDate(m.date))),
        h('div', { class: 'body' },
          h('dl', { class: 'kv' },
            h('dt', null, 'البريد'), h('dd', null, h('a', { href: `mailto:${m.email}`, class: 'ltr' }, m.email)),
            m.phone ? [h('dt', null, 'الهاتف'), h('dd', null, h('a', { href: `tel:${m.phone.replace(/[^\d+]/g, '')}`, class: 'ltr' }, m.phone))] : null,
            m.company ? [h('dt', null, 'الشركة'), h('dd', null, m.company)] : null,
            h('dt', null, 'القطع المطلوبة'), h('dd', null, h('div', { class: 'chips' }, m.services.map((s) => h('span', { class: 'tag' }, labels[s] || s)))),
            h('dt', null, 'لغة الصفحة'), h('dd', null, m.lang === 'en' ? 'الإنجليزية' : 'العربية')),
          h('div', { class: 'text', dir: 'auto' }, m.message),
          h('div', { class: 'row' },
            h('a', { class: 'btn btn-primary btn-small', href: `mailto:${m.email}?subject=${encodeURIComponent('PuzzleX Media — ردًا على رسالتك')}` }, 'رد بالبريد'),
            h('button', { type: 'button', class: 'btn btn-small', 'data-read-toggle': '', onclick: async () => { try { await setRead(m, !m.read); draw(); } catch (err) { toast(err.message, 'err'); } } }, m.read ? 'تعليم كغير مقروءة' : 'تعليم كمقروءة'),
            h('span', { class: 'spacer' }),
            h('button', {
              type: 'button', class: 'btn btn-small btn-danger',
              onclick: async () => {
                if (!confirm(`حذف رسالة ${m.name} نهائيًا؟`)) return;
                try { await api('DELETE', `/messages/${m.id}`); msgs = msgs.filter((x) => x !== m); refreshMe().catch(() => {}); draw(); toast('تم حذف الرسالة'); } catch (err) { toast(err.message, 'err'); }
              },
            }, 'حذف'))));
      // opening an unread message marks it read
      d.addEventListener('toggle', () => {
        if (!d.open || m.read) return;
        setRead(m, true).then(() => {
          d.classList.remove('unread');
          d.querySelector('[data-read-toggle]').textContent = 'تعليم كغير مقروءة';
        }).catch(() => {});
      });
      return d;
    }) : [h('p', { class: 'empty' }, onlyUnread ? 'لا رسائل غير مقروءة 🎉' : 'لا رسائل بعد. الرسائل التي تصل من نموذج «تواصل معنا» تظهر هنا.')]));
  }
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'INBOX'),
      h('h1', null, 'الرسائل'),
      h('p', null, 'كل ما يُرسل من نموذج «تواصل معنا»، الأحدث أولًا. افتح الرسالة لتعلَّم كمقروءة.'))),
    filter, h('div', { style: 'height:14px' }), list);
  draw();
}

/* =========================================================
   Account
   ========================================================= */
async function viewAccount(view) {
  setPending(null);
  const form = h('form', { class: 'card grid', style: 'max-width:520px' },
    h('h2', { class: 'section-title', style: 'margin:0' }, 'تغيير كلمة المرور'),
    h('label', { class: 'field' }, h('span', null, 'كلمة المرور الحالية'), h('input', { type: 'password', name: 'current', autocomplete: 'current-password', dir: 'ltr', required: true })),
    h('label', { class: 'field' }, h('span', null, 'كلمة المرور الجديدة'), h('input', { type: 'password', name: 'next', autocomplete: 'new-password', dir: 'ltr', minlength: 10, required: true }),
      h('span', { class: 'hint' }, '10 أحرف على الأقل. جملة طويلة تتذكرها أفضل من كلمة قصيرة معقدة.')),
    h('label', { class: 'field' }, h('span', null, 'تأكيد كلمة المرور الجديدة'), h('input', { type: 'password', name: 'again', autocomplete: 'new-password', dir: 'ltr', required: true })),
    h('p', { class: 'form-error', role: 'alert' }),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'تغيير كلمة المرور'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    err.textContent = '';
    if (form.next.value !== form.again.value) { err.textContent = 'كلمتا المرور الجديدتان غير متطابقتين'; return; }
    try {
      await busy(form.querySelector('button'), () => api('POST', '/password', { current: form.current.value, next: form.next.value }));
      form.reset();
      toast('تم تغيير كلمة المرور. خرجت جلساتك الأخرى من اللوحة.');
    } catch (x) { err.textContent = x.message; }
  });
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'ACCOUNT'),
      h('h1', null, 'حسابي'),
      h('p', null, `${me.name} · اسم المستخدم: `, h('span', { class: 'ltr' }, me.username)))),
    form,
    h('div', { style: 'margin-top:24px' }, h('button', {
      type: 'button', class: 'btn btn-danger',
      onclick: async () => { if (dirty() && !confirm('لديك تغييرات غير محفوظة. الخروج بدون حفظ؟')) return; await api('POST', '/logout', {}).catch(() => {}); setPending(null); showLogin(); },
    }, 'تسجيل الخروج')));
}

/* ---------- go ---------- */
(async () => {
  try { await start(); } catch { showLogin(); }
})();
