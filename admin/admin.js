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
const VIEWS = { home: viewHome, texts: viewTexts, projects: viewProjects, partners: viewPartners, testimonials: viewTestimonials, contact: viewContact, messages: viewMessages, stats: viewStats, account: viewAccount };
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
      h('p', null, 'من هنا تعدّل كل ما يظهر على الموقع: النصوص بالعربية والإنجليزية، المشاريع وصورها، شعارات الشركاء، آراء العملاء، ومعلومات التواصل. كل تغيير تحفظه يظهر على الموقع فوراً.'))),
    h('div', { class: 'stats' },
      stat(stats.unread, noun(stats.unread, ['رسالة جديدة', 'رسالتان جديدتان', 'رسائل جديدة', 'رسالة جديدة']), '#/messages', stats.unread > 0),
      stats.today ? stat(stats.today.visitors, `${noun(stats.today.visitors, ['زائر', 'زائران', 'زوار', 'زائراً'])} اليوم · ${stats.today.views} ${noun(stats.today.views, ['مشاهدة', 'مشاهدتان', 'مشاهدات', 'مشاهدة'])}`, '#/stats') : null,
      stat(stats.projects, noun(stats.projects, ['مشروع', 'مشروعان', 'مشاريع', 'مشروعاً']), '#/projects'),
      stat(stats.partners, noun(stats.partners, ['شعار شريك', 'شعارا شريكين', 'شعارات شركاء', 'شعار شريك']), '#/partners'),
      stat(stats.testimonials, noun(stats.testimonials, ['رأي عميل', 'رأيا عميلين', 'آراء عملاء', 'رأي عميل']), '#/testimonials'),
      stat(stats.editedTexts, noun(stats.editedTexts, ['نص معدّل', 'نصان معدّلان', 'نصوص معدّلة', 'نصاً معدّلاً']), '#/texts')),
    h('h2', { class: 'section-title' }, 'ماذا تريد أن تعدّل؟'),
    h('div', { class: 'stats' },
      short('النصوص', 'العناوين والفقرات والأزرار في كل الصفحات', '#/texts'),
      short('المشاريع', 'أضف مشروعاً، ارفع صوره، رتّب الأعمال', '#/projects'),
      short('شعارات الشركاء', 'الشعارات في أحجية «شركاء النجاح»', '#/partners'),
      short('آراء العملاء', 'الآراء والنجوم والصور، واستيراد من Excel', '#/testimonials'),
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
      h('p', null, 'كل نص على الموقع بلغتيه جنباً إلى جنب. عدّل ما تريد ثم اضغط «حفظ التغييرات». النص المشترك (مثل روابط القائمة) يتغيّر في كل الصفحات معاً. اترك الحقل فارغاً ليعود إلى الأصل.')),
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
      h('p', null, 'المشاريع بالترتيب الذي تظهر به في صفحة «أعمالنا». أضف مشروعاً جديداً أو افتح أي مشروع لتعديل نصوصه وصوره.')),
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
        h('p', { class: 'hint' }, 'صور صفحة المشروع، بالترتيب: الأولى عريضة ثم صورتان متجاورتان، وهكذا. تُصغَّر الصور تلقائياً قبل الرفع.'), gallery),
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
    info.textContent = `${list.length} شعاراً → أحجية ${g}×${g}${g * g - 1 > list.length ? ` (${g * g - 1 - list.length} قطع بيضاء فارغة)` : ''}. الأحجية تكبر وتصغر تلقائياً: حتى 24 شعاراً 5×5، حتى 48 → 7×7، حتى 80 → 9×9.`;
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
   Client feedback (testimonials): the feedback page, and the ones marked for it on the home page
   ========================================================= */
const HOME_FEEDBACK = 6; // lib/content.js shows this many on the home page
const blankFeedback = () => ({
  id: '', name: { ar: '', en: '' }, role: { ar: '', en: '' }, quote: { ar: '', en: '' },
  photo: '', images: [], rating: 5, date: '', visible: true, featured: true,
});
const withDefaults = (t) => ({ ...blankFeedback(), ...t }); // entries saved before images / date / featured existed

async function viewTestimonials(view) {
  const [r, parts] = await Promise.all([api('GET', '/testimonials'), api('GET', '/partners')]);
  let saved = r.data.map(withDefaults), rev = r.rev, list = clone(saved);
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
    save: async () => { const s = await api('PUT', '/testimonials', { rev, data: list }); saved = s.data.map(withDefaults); rev = s.rev; list = clone(saved); draw(); },
  });
  const box = h('div', { class: 'tm-admin' });
  const info = h('p', { class: 'hint' });
  const lang2 = (lang) => (lang === 'ar' ? 'بالعربية' : 'English');
  let cards = []; // [element, entry], for the search box
  const search = h('input', { type: 'search', class: 'tm-search', placeholder: 'ابحث باسم العميل أو نص الرأي…', oninput: () => applySearch() });
  const applySearch = () => {
    const q = search.value.trim().toLowerCase();
    cards.forEach(([el, t]) => { el.hidden = Boolean(q) && ![t.name.ar, t.name.en, t.role.ar, t.role.en, t.quote.ar, t.quote.en].join(' ').toLowerCase().includes(q); });
  };

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

    // images attached to the review (a chat screenshot, the finished work…): up to 6, in order
    const images = h('div', { class: 'images' });
    const drawImages = () => images.replaceChildren(
      ...t.images.map((src, k) => h('div', { class: 'img-tile' }, h('img', { src: asset(src), alt: `صورة مرفقة ${k + 1}` }), h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تقديم', 'aria-label': 'تقديم', disabled: k === 0, onclick: () => { [t.images[k - 1], t.images[k]] = [t.images[k], t.images[k - 1]]; drawImages(); refreshBar(); } }, '→'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small btn-danger', title: 'حذف', 'aria-label': 'حذف', onclick: () => { t.images.splice(k, 1); drawImages(); refreshBar(); } }, '✕'),
        h('button', { type: 'button', class: 'btn btn-icon btn-small', title: 'تأخير', 'aria-label': 'تأخير', disabled: k === t.images.length - 1, onclick: () => { [t.images[k + 1], t.images[k]] = [t.images[k], t.images[k + 1]]; drawImages(); refreshBar(); } }, '←')))),
      t.images.length < 6 ? dropZone('أضف صوراً', true, async (files) => {
        const room = files.slice(0, 6 - t.images.length);
        if (room.length < files.length) toast('الحد الأقصى 6 صور لكل رأي — أُضيفت أول الصور فقط', 'err');
        for (const [k, f] of room.entries()) {
          try { toast(`جارٍ رفع الصورة ${k + 1} من ${room.length}…`); t.images.push(await upload(f, 1800)); drawImages(); refreshBar(); } catch (err) { toast(err.message, 'err'); }
        }
      }) : null);
    drawImages();

    const pairField = (label, key, multiline, required) => h('div', { class: 'pair' }, ['ar', 'en'].map((lang) => h('label', { class: 'field' },
      h('span', null, `${label} — ${lang2(lang)}`, required && lang === 'ar' ? h('b', null, ' *') : null),
      h(multiline ? 'textarea' : 'input', {
        value: t[key][lang], dir: lang === 'ar' ? 'rtl' : 'ltr', lang, rows: multiline ? 4 : null,
        oninput: (e) => { t[key][lang] = e.target.value; if (key === 'name' && !t.photo) drawFace(); refreshBar(); },
      }))));
    const toggle = (key, label) => h('label', { class: 'tm-switch' },
      h('input', { type: 'checkbox', checked: t[key], onchange: (e) => { t[key] = e.target.checked; el.classList.toggle('off', !t.visible); drawInfo(); refreshBar(); } }), label);

    const el = h('div', { class: `card tm-item${t.visible ? '' : ' off'}` },
      h('div', { class: 'tm-item-head' },
        h('span', { class: 'tag' }, `#${i + 1}`),
        toggle('visible', 'ظاهر على الموقع'),
        toggle('featured', 'في الصفحة الرئيسية'),
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
      h('div', { class: 'grid two' },
        h('label', { class: 'field' }, h('span', null, 'التقييم'),
          h('select', { onchange: (e) => { t.rating = Number(e.target.value); refreshBar(); } },
            [5, 4, 3, 2, 1, 0].map((n) => h('option', { value: n, selected: t.rating === n }, n ? `${'★'.repeat(n)}  (${n} من 5)` : 'بدون نجوم')))),
        h('label', { class: 'field' }, h('span', null, 'التاريخ (اختياري)'),
          h('input', { value: t.date, dir: 'ltr', placeholder: '2026-05-14 أو 2026-05', inputmode: 'numeric', oninput: (e) => { t.date = e.target.value.trim(); refreshBar(); } }))),
      h('div', { class: 'field' }, h('span', null, 'صور مرفقة (اختياري)'),
        h('span', { class: 'hint' }, 'لقطة من محادثة العميل، صورة من العمل المسلَّم… حتى 6 صور. تظهر مصغّرة تحت الرأي، وتُفتح بحجم كامل عند الضغط عليها.'), images));
    return el;
  }

  function drawInfo() {
    const shown = list.filter((t) => t.visible), home = shown.filter((t) => t.featured).length;
    info.textContent = list.length
      ? `${list.length} ${noun(list.length, ['رأي', 'رأيان', 'آراء', 'رأياً'])} · ${shown.length} ظاهر على الموقع · ${home} في الصفحة الرئيسية${home > HOME_FEEDBACK ? ` (يظهر أول ${HOME_FEEDBACK} منها فقط)` : ''}. الاسم والنص مطلوبان بلغة واحدة على الأقل؛ إن تركت الإنجليزية فارغة تعرض الصفحة الإنجليزية النص العربي (والعكس).`
      : '';
  }
  function draw() {
    cards = list.map((t, i) => [card(t, i), t]);
    box.replaceChildren(...(list.length ? cards.map(([el]) => el) : [h('p', { class: 'empty' }, 'لا آراء بعد. أضف أول رأي، أو استوردها كلها مرة واحدة من ملف Excel — تظهر صفحة «آراء العملاء» وقسمها في الصفحة الرئيسية تلقائياً عندما يكون هناك رأي ظاهر واحد على الأقل.')]));
    drawInfo();
    applySearch();
    refreshBar();
  }
  const add = () => {
    list.unshift(blankFeedback());
    search.value = '';
    draw();
    box.querySelector('input:not([type])')?.focus();
  };
  const importNow = () => importFeedback({
    existing: list, partners: parts.data,
    onDone: (items, mode) => {
      if (mode === 'replace') list.splice(0, list.length, ...items);
      else if (mode === 'top') list.unshift(...items);
      else list.push(...items);
      search.value = '';
      draw();
      toast(`${items.length === 1 ? 'أُضيف رأي واحد' : items.length === 2 ? 'أُضيف رأيان' : `أُضيف ${items.length} ${noun(items.length, ['', '', 'آراء', 'رأياً'])}`} — راجعها ثم اضغط «حفظ التغييرات»`);
    },
  });
  const exportNow = () => {
    if (!list.length) { toast('لا آراء لتصديرها بعد', 'err'); return; }
    XLSX.download(feedbackWorkbook(list), `puzzlex-feedback-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'CLIENT FEEDBACK'),
      h('h1', null, 'آراء العملاء'),
      h('p', null, `ما يقوله عملاؤكم عنكم، بالعربية والإنجليزية، مع النجوم والصور. تظهر كلها بهذا الترتيب في صفحة «آراء العملاء»، والمعلَّمة «في الصفحة الرئيسية» (أول ${HOME_FEEDBACK}) في قسم «ماذا يقول عملاؤنا». أخفِ الرأي بدل حذفه إن أردت إرجاعه لاحقاً.`)),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-ghost', href: '/feedback.html', target: '_blank', rel: 'noopener' }, 'افتح صفحة الآراء ↗'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, '+ رأي جديد'))),
    h('div', { class: 'tm-tools' },
      h('button', { type: 'button', class: 'btn', onclick: importNow }, 'استيراد من Excel'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: exportNow }, 'تصدير إلى Excel'),
      h('span', { class: 'spacer' }), search),
    info, h('div', { style: 'height:12px' }), box);
  draw();
}

/* ---------- client feedback ⇄ Excel: the columns, the template, reading a filled-in sheet ---------- */
// key: where the value goes; head: the template's header; alias: other headers that mean the same column
const FEEDBACK_COLUMNS = [
  { key: 'name.ar', head: 'اسم العميل (عربي)', alias: ['name_ar', 'الاسم', 'اسم العميل', 'العميل', 'name'], width: 24,
    help: 'اسم العميل كما يظهر على الموقع. مطلوب بالعربية أو بالإنجليزية.', example: 'م. خالد العتيبي' },
  { key: 'name.en', head: 'Client name (English)', alias: ['name_en', 'name english', 'english name', 'الاسم بالانجليزية', 'client name'], width: 24,
    help: 'الاسم للصفحة الإنجليزية (اختياري — إن تُرك فارغاً يظهر الاسم العربي).', example: 'Eng. Khalid Al-Otaibi' },
  { key: 'role.ar', head: 'المنصب والشركة (عربي)', alias: ['role_ar', 'المنصب', 'الشركة', 'المنصب والشركة', 'role'], width: 26,
    help: 'المنصب والشركة (اختياري).', example: 'مدير التسويق — شركة الأفق' },
  { key: 'role.en', head: 'Role & company (English)', alias: ['role_en', 'role english', 'company', 'title'], width: 26,
    help: 'المنصب والشركة بالإنجليزية (اختياري).', example: 'Marketing Manager — Al Ofuq Co.' },
  { key: 'quote.ar', head: 'نص الرأي (عربي)', alias: ['quote_ar', 'الرأي', 'نص الرأي', 'النص', 'التعليق', 'quote', 'review', 'feedback', 'comment'], width: 60,
    help: 'نص الرأي، حتى 1200 حرف. مطلوب بالعربية أو بالإنجليزية. لسطر جديد داخل الخلية: Alt+Enter.', example: 'فريق محترف فهم فكرتنا من أول اجتماع، وسلّم الهوية قبل الموعد.' },
  { key: 'quote.en', head: 'Review (English)', alias: ['quote_en', 'review_en', 'review english', 'english review'], width: 60,
    help: 'نص الرأي بالإنجليزية (اختياري).', example: 'A professional team that got our idea from the first meeting and delivered early.' },
  { key: 'rating', head: 'التقييم (0–5)', alias: ['rating', 'stars', 'التقييم', 'النجوم', 'نجوم', 'عدد النجوم'], width: 13,
    help: 'عدد النجوم من 1 إلى 5. اكتب 0 أو اتركه فارغاً لرأي بدون نجوم.', example: '5' },
  { key: 'date', head: 'التاريخ', alias: ['date', 'تاريخ', 'تاريخ الرأي'], width: 14,
    help: 'تاريخ الرأي (اختياري): 2026-05-14 أو 2026-05 أو 2026، أو تاريخ Excel عادي.', example: '2026-05-14' },
  { key: 'photo', head: 'صورة العميل (اسم الملف)', alias: ['photo', 'logo', 'image', 'الصورة', 'الشعار', 'صورة العميل', 'صورة'], width: 22,
    help: 'اسم ملف صورة العميل أو شعار شركته — اختر الصور نفسها في نافذة الاستيراد. أو اسم شريك من «شعارات الشركاء» (مثل p07 أو اسمه).', example: 'khalid.jpg' },
  { key: 'images', head: 'صور مرفقة (أسماء الملفات)', alias: ['images', 'attachments', 'gallery', 'الصور', 'صور مرفقة', 'المرفقات', 'صور'], width: 30,
    help: 'صور مع الرأي (لقطة محادثة، صورة من العمل…): أسماء الملفات مفصولة بفاصلة، حتى 6.', example: 'chat-1.png, chat-2.png' },
  { key: 'featured', head: 'في الصفحة الرئيسية؟', alias: ['featured', 'home', 'الرئيسية', 'في الرئيسية'], width: 16,
    help: `نعم = يظهر أيضاً في قسم «ماذا يقول عملاؤنا» في الصفحة الرئيسية (أول ${HOME_FEEDBACK}). فارغ = لا.`, example: 'لا' },
  { key: 'visible', head: 'ظاهر على الموقع؟', alias: ['visible', 'show', 'ظاهر', 'اظهار', 'منشور'], width: 15,
    help: 'لا = يُحفظ مخفياً ولا يظهر على الموقع. فارغ = ظاهر.', example: 'نعم' },
];
const YES_NO = ['نعم', 'لا'];
const colOf = (key) => FEEDBACK_COLUMNS.findIndex((c) => c.key === key);
const sheetLists = () => ({ [colOf('rating')]: ['5', '4', '3', '2', '1', '0'], [colOf('featured')]: YES_NO, [colOf('visible')]: YES_NO });

// list → workbook (export); with no list, the empty template plus a sheet explaining each column
function feedbackWorkbook(list) {
  const value = (t, key) => {
    const [k, lang] = key.split('.');
    if (lang) return t[k][lang];
    if (k === 'images') return t.images.join(', ');
    if (k === 'featured' || k === 'visible') return t[k] ? 'نعم' : 'لا';
    if (k === 'rating') return t.rating || '';
    return t[k];
  };
  const widths = FEEDBACK_COLUMNS.map((c) => c.width);
  const head = FEEDBACK_COLUMNS.map((c) => c.head);
  if (list) return XLSX.write([{ name: 'آراء العملاء', rtl: true, widths, lists: sheetLists(), rows: [head, ...list.map((t) => FEEDBACK_COLUMNS.map((c) => value(t, c.key)))] }]);
  return XLSX.write([
    { name: 'آراء العملاء', rtl: true, widths, lists: sheetLists(), rows: [head] },
    { name: 'شرح الأعمدة', rtl: true, widths: [28, 80, 50], rows: [['العمود', 'ماذا تكتب فيه', 'مثال'], ...FEEDBACK_COLUMNS.map((c) => [c.head, c.help, c.example])] },
  ]);
}

const latinDigits = (s) => String(s).replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
const plain = (s) => latinDigits(s).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const yesNo = (v, empty) => {
  const s = latinDigits(v).trim().toLowerCase();
  if (!s) return empty;
  if (/^(نعم|اي|ايوه|أيوه|yes|y|true|1|x|✓|✔)$/.test(s)) return true;
  if (/^(لا|no|n|false|0)$/.test(s)) return false;
  return null;
};
const parseRating = (v) => {
  const s = latinDigits(v).trim();
  if (!s) return 0;
  const stars = (s.match(/[★⭐]/gu) || []).length;
  const n = stars || Math.round(Number(s.replace(',', '.')));
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
};
const ymd = (y, m, d) => {
  const yy = Number(y), mm = Number(m), dd = Number(d || 1);
  if (yy < 1900 || yy > 2099 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return [y, String(mm).padStart(2, '0'), d ? String(dd).padStart(2, '0') : null].filter(Boolean).join('-');
};
// '' when empty, null when it can't be understood
function parseDate(v) {
  const s = latinDigits(v).trim();
  if (!s) return '';
  let m;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1900 && n <= 2099) return s; // just a year
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10); // Excel's day number
    return null;
  }
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T\s].*)?$/))) return ymd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return ymd(m[3], m[2], m[1]); // day/month/year, as written in the region
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return ymd(m[2], m[1]);
  return null;
}
const UPLOADED = /^\/uploads\/[a-f0-9]{24}\.(webp|png|jpg)$/;
const PARTNER_LOGO = /^assets\/partners\/p\d{2}\.webp$/;
// a cell naming an image: something already on the site, a partner's logo, or one of the files picked for the import
function imageRef(raw, files, partners) {
  const s = raw.trim();
  if (!s) return null;
  if (UPLOADED.test(s) || PARTNER_LOGO.test(s)) return { src: s };
  const name = s.split(/[\\/]/).pop().toLowerCase();
  const file = files.get(name) || files.get(name.replace(/\.[a-z0-9]+$/, ''));
  if (file) return { file };
  const id = s.match(/^p(\d{1,2})$/i);
  const partner = partners.find((p) => (id && p.id === `p${id[1].padStart(2, '0')}`) || (p.name && plain(p.name) === plain(s)));
  return partner ? { src: partner.src } : { missing: s };
}
const dupKey = (t) => plain(`${t.name.ar} ${t.name.en} ${(t.quote.ar || t.quote.en).slice(0, 80)}`);

function readFeedbackSheet(rows, files, partners, existing) {
  const start = rows.findIndex((r) => r.some((c) => String(c).trim()));
  if (start < 0) throw new Error('الملف فارغ.');
  const cols = {}, unknown = [];
  rows[start].forEach((cell, i) => {
    const n = plain(cell);
    if (!n) return;
    const col = FEEDBACK_COLUMNS.find((c) => plain(c.head) === n || c.alias.some((a) => plain(a) === n));
    if (col && !(col.key in cols)) cols[col.key] = i; else unknown.push(String(cell).trim());
  });
  if (!('name.ar' in cols || 'name.en' in cols) || !('quote.ar' in cols || 'quote.en' in cols)) {
    throw new Error('لم أجد عمودَي «اسم العميل» و«نص الرأي» في أول صف من الملف. حمّل القالب واستخدم عناوين أعمدته.');
  }
  const seen = new Set(existing.map(dupKey));
  const out = [];
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const get = (key) => (key in cols ? String(row[cols[key]] ?? '').replace(/\r\n?/g, '\n').trim() : '');
    if (FEEDBACK_COLUMNS.every((c) => !get(c.key))) continue; // an empty line
    const errors = [], warnings = [];
    const t = blankFeedback();
    for (const k of ['name', 'role', 'quote']) for (const lang of ['ar', 'en']) t[k][lang] = get(`${k}.${lang}`);
    if (!t.name.ar && !t.name.en) errors.push('بدون اسم عميل');
    if (!t.quote.ar && !t.quote.en) errors.push('بدون نص رأي');
    if ([t.name.ar, t.name.en, t.role.ar, t.role.en].some((s) => s.length > 200)) errors.push('الاسم أو المنصب أطول من 200 حرف');
    if ([t.quote.ar, t.quote.en].some((s) => s.length > 1200)) errors.push('نص الرأي أطول من 1200 حرف');
    const rating = parseRating(get('rating'));
    if (rating === null) errors.push(`التقييم «${get('rating')}» غير مفهوم — رقم من 0 إلى 5`); else t.rating = rating;
    const date = parseDate(get('date'));
    if (date === null) warnings.push(`التاريخ «${get('date')}» غير مفهوم — سيُترك فارغاً`); else t.date = date;
    // a long import shouldn't fill the home page: only the rows marked "نعم" go there
    for (const [key, empty, label] of [['featured', false, 'في الصفحة الرئيسية'], ['visible', true, 'ظاهر']]) {
      const yes = yesNo(get(key), empty);
      if (yes === null) warnings.push(`«${label}»: اكتب نعم أو لا (اعتُبر ${empty ? 'نعم' : 'لا'})`);
      t[key] = yes ?? empty;
    }
    const photo = imageRef(get('photo'), files, partners);
    if (photo && photo.missing) warnings.push(`صورة العميل «${photo.missing}» غير مختارة — سيُستورد بدونها`);
    let images = get('images').split(/[,،;\n|]+/).map((s) => imageRef(s, files, partners)).filter(Boolean);
    images.filter((x) => x.missing).forEach((x) => warnings.push(`الصورة «${x.missing}» غير مختارة`));
    images = images.filter((x) => !x.missing);
    if (images.length > 6) { warnings.push('أكثر من 6 صور — أُخذت أول 6'); images = images.slice(0, 6); }
    const key = dupKey(t);
    const dup = !errors.length && seen.has(key);
    seen.add(key);
    out.push({ line: i + 1, t, photo: photo && !photo.missing ? photo : null, images, errors, warnings, dup });
  }
  return { rows: out, unknown };
}

// the import window: template → file → images (optional) → check → add to the list (saved with "حفظ")
function importFeedback({ existing, partners, onDone }) {
  let sheet = null, result = null, mode = 'append';
  const files = new Map(); // lower-case file name (with and without extension) → File
  const picked = () => new Set(files.values()).size;

  const fileInfo = h('span', { class: 'hint' }, '.xlsx أو .csv');
  const imgInfo = h('span', { class: 'hint' }, 'اختياري');
  const preview = h('div', { class: 'import-preview' });
  const go = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => run() }, 'استيراد');
  const progress = h('span', { class: 'hint', 'aria-live': 'polite' });

  const loadSheet = async (file) => {
    try {
      sheet = await XLSX.read(file);
      fileInfo.textContent = `✓ ${file.name}`;
    } catch (err) { sheet = null; fileInfo.textContent = ''; toast(err.message, 'err'); }
    check();
  };
  const sheetDrop = h('button', { type: 'button', class: 'drop' }, h('b', null, '+'), 'اختر ملف Excel', h('span', { class: 'small' }, 'أو اسحبه هنا'));
  sheetDrop.addEventListener('click', () => {
    const input = h('input', { type: 'file', accept: '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv' });
    input.addEventListener('change', () => input.files[0] && loadSheet(input.files[0]));
    input.click();
  });
  sheetDrop.addEventListener('dragover', (e) => { e.preventDefault(); sheetDrop.classList.add('over'); });
  sheetDrop.addEventListener('dragleave', () => sheetDrop.classList.remove('over'));
  sheetDrop.addEventListener('drop', (e) => { e.preventDefault(); sheetDrop.classList.remove('over'); if (e.dataTransfer.files[0]) loadSheet(e.dataTransfer.files[0]); });
  const imageDrop = dropZone('اختر الصور', true, (list) => {
    for (const f of list) { const n = f.name.toLowerCase(); files.set(n, f); files.set(n.replace(/\.[a-z0-9]+$/, ''), f); }
    imgInfo.textContent = `✓ ${picked()} ${noun(picked(), ['صورة', 'صورتان', 'صور', 'صورة'])}`;
    check();
  });

  function check() {
    go.disabled = true;
    if (!sheet) { preview.replaceChildren(); return; }
    try {
      result = readFeedbackSheet(sheet, files, partners, mode === 'replace' ? [] : existing);
    } catch (err) {
      preview.replaceChildren(h('p', { class: 'import-error' }, err.message));
      return;
    }
    const ok = result.rows.filter((r) => !r.errors.length && !r.dup);
    const warned = ok.filter((r) => r.warnings.length).length;
    const bad = result.rows.filter((r) => r.errors.length).length, dups = result.rows.filter((r) => r.dup).length;
    const total = (mode === 'replace' ? 0 : existing.length) + ok.length;
    const tooMany = total > 500;
    const status = (r) => (r.errors.length ? h('span', { class: 'st-err' }, `✕ ${r.errors.join(' · ')}`)
      : r.dup ? h('span', { class: 'st-dup' }, '↺ موجود من قبل — سيُتخطّى')
        : r.warnings.length ? h('span', { class: 'st-warn' }, `! ${r.warnings.join(' · ')}`) : h('span', { class: 'st-ok' }, '✓ جاهز'));
    const shown = result.rows.slice(0, 300);
    preview.replaceChildren(...[
      h('div', { class: 'import-summary' },
        h('span', { class: 'tag lime' }, `✓ ${ok.length} جاهز للاستيراد`),
        warned ? h('span', { class: 'tag' }, `! ${warned} مع تنبيه`) : null,
        bad ? h('span', { class: 'tag err' }, `✕ ${bad} فيه خطأ — لن يُستورد`) : null,
        dups ? h('span', { class: 'tag' }, `↺ ${dups} مكرر`) : null),
      result.unknown.length ? h('p', { class: 'hint' }, `أعمدة لم أتعرّف عليها وتجاهلتها: ${result.unknown.join('، ')}`) : null,
      tooMany ? h('p', { class: 'import-error' }, `المجموع سيصبح ${total} رأياً — الحد الأقصى 500. احذف بعض الصفوف أو اختر «استبدال كل الآراء الحالية».`) : null,
      result.rows.length ? h('div', { class: 'import-table-wrap' }, h('table', { class: 'import-table' },
        h('thead', null, h('tr', null, ['الصف', 'العميل', 'التقييم', 'الصور', 'الحالة'].map((x) => h('th', null, x)))),
        h('tbody', null, shown.map((r) => h('tr', { class: r.errors.length ? 'err' : r.dup ? 'dup' : null },
          h('td', { class: 'ltr' }, r.line),
          h('td', null, h('b', null, r.t.name.ar || r.t.name.en || '—'), h('div', { class: 'muted small' }, (r.t.quote.ar || r.t.quote.en).slice(0, 90))),
          h('td', { class: 'ltr' }, r.t.rating ? '★'.repeat(r.t.rating) : '—'),
          h('td', null, (r.photo ? 1 : 0) + r.images.length || '—'),
          h('td', null, status(r))))))) : h('p', { class: 'empty' }, 'لا صفوف في الملف تحت العناوين.'),
      result.rows.length > shown.length ? h('p', { class: 'hint' }, `يعرض أول ${shown.length} صفاً من ${result.rows.length}.`) : null,
    ].filter(Boolean));
    go.textContent = `استيراد ${ok.length === 1 ? 'رأي واحد' : ok.length === 2 ? 'رأيين' : `${ok.length} ${noun(ok.length, ['', '', 'آراء', 'رأياً'])}`}`;
    go.disabled = !ok.length || tooMany;
  }

  async function run() {
    const ok = result.rows.filter((r) => !r.errors.length && !r.dup);
    if (mode === 'replace' && existing.length && !confirm(`ستحلّ آراء الملف (${ok.length}) محلّ كل الآراء الحالية (${existing.length}). يمكنك التراجع قبل الحفظ. متابعة؟`)) return;
    await busy(go, async () => {
      // each picked image is uploaded once, even when several rows use it; attachments big enough for the viewer
      const attached = new Set(ok.flatMap((r) => r.images).filter((x) => x.file).map((x) => x.file));
      const needed = [...new Set(ok.flatMap((r) => [r.photo, ...r.images]).filter((x) => x && x.file).map((x) => x.file))];
      const uploaded = new Map();
      let failed = 0;
      for (const [k, f] of needed.entries()) {
        progress.textContent = `رفع الصور: ${k + 1} من ${needed.length}…`;
        try { uploaded.set(f, await upload(f, attached.has(f) ? 1800 : 400)); } catch (err) { failed++; toast(err.message, 'err'); }
      }
      const src = (ref) => (ref ? ref.src || uploaded.get(ref.file) || '' : '');
      const items = ok.map((r) => ({ ...r.t, photo: src(r.photo), images: r.images.map(src).filter(Boolean) }));
      progress.textContent = '';
      dlg.close();
      onDone(items, mode);
      if (failed) toast(`تعذّر رفع ${failed} ${noun(failed, ['صورة', 'صورتين', 'صور', 'صورة'])} — أُضيفت الآراء بدونها`, 'err');
    });
  }

  const modeChoice = (value, label) => h('label', { class: 'tm-switch' },
    h('input', { type: 'radio', name: 'import-mode', value, checked: value === mode, onchange: () => { mode = value; check(); } }), label);
  const step = (n, title, text, ...body) => h('div', { class: 'import-step' },
    h('div', { class: 'row' }, h('b', { class: 'n' }, n), h('strong', null, title)), h('p', { class: 'hint' }, text), ...body);
  const dlg = h('dialog', { class: 'import-dlg' },
    h('h2', null, 'استيراد آراء العملاء من Excel'),
    h('div', { class: 'import-steps' },
      step(1, 'القالب', 'صف لكل رأي، والورقة الثانية تشرح كل عمود. أو صدّر الآراء الحالية، عدّلها، ثم استوردها.',
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => XLSX.download(feedbackWorkbook(), 'puzzlex-feedback-template.xlsx') }, 'تحميل القالب (.xlsx)')),
      step(2, 'ملف الآراء', 'الملف بعد ملئه، من Excel أو Google Sheets.', sheetDrop, fileInfo),
      step(3, 'الصور', 'صور العملاء والصور المرفقة. اكتب اسم كل ملف (مثل khalid.jpg) في عمود الصورة.', imageDrop, imgInfo)),
    preview,
    h('div', { class: 'import-modes' },
      h('strong', null, 'أين تُضاف؟'),
      modeChoice('append', 'بعد الآراء الحالية'), modeChoice('top', 'قبل الآراء الحالية'), modeChoice('replace', 'استبدال كل الآراء الحالية')),
    h('div', { class: 'row' }, go, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close() }, 'إلغاء'), progress,
      h('span', { class: 'spacer' }), h('span', { class: 'hint' }, 'لا يُحفظ شيء قبل «حفظ التغييرات».')));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
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
        h('span', { class: 'hint' }, hint || 'اتركه فارغاً ليختفي من الموقع (لا يظهر رابط أو أيقونة فارغة).')))))));
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
        h('span', { class: 'hint' }, 'تصلك 4 رسائل: ردّ العميل بالعربية والإنجليزية، وإشعار الفريق، ورسالة التذكير — لترى ما يصل للعملاء تماماً.')));
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
            h('a', { class: 'btn btn-primary btn-small', href: `mailto:${m.email}?subject=${encodeURIComponent('PuzzleX Media — رداً على رسالتك')}` }, 'رد بالبريد'),
            h('button', { type: 'button', class: 'btn btn-small', 'data-read-toggle': '', onclick: async () => { try { await setRead(m, !m.read); draw(); } catch (err) { toast(err.message, 'err'); } } }, m.read ? 'تعليم كغير مقروءة' : 'تعليم كمقروءة'),
            h('span', { class: 'spacer' }),
            h('button', {
              type: 'button', class: 'btn btn-small btn-danger',
              onclick: async () => {
                if (!confirm(`حذف رسالة ${m.name} نهائياً؟`)) return;
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
      h('p', null, 'كل ما يُرسل من نموذج «تواصل معنا»، الأحدث أولاً. افتح الرسالة لتعلَّم كمقروءة.'))),
    filter, h('div', { style: 'height:14px' }), list);
  draw();
}

/* =========================================================
   Statistics (lib/analytics.js): visits, clicks, the clients' projects, where visitors come from, their journeys
   ========================================================= */
const STAT_PAGES = {
  '/': 'الرئيسية', '/about.html': 'من نحن', '/services.html': 'الخدمات', '/work.html': 'أعمالنا', '/feedback.html': 'آراء العملاء',
  '/project.html': 'صفحة مشروع', '/contact.html': 'تواصل معنا', '/privacy.html': 'الخصوصية', '/404.html': 'صفحة غير موجودة',
};
const CLICK_KINDS = {
  whatsapp: 'واتساب', phone: 'اتصال هاتفي', email: 'بريد إلكتروني', social: 'حسابات التواصل', project: 'فتح مشروع',
  form: 'إرسال نموذج التواصل', cta: 'زر «تواصل معنا»', link: 'رابط داخلي', out: 'رابط لموقع آخر', button: 'زر', lang: 'تبديل اللغة',
  tap: 'نقرة على شيء ليس رابطاً',
};
const DEVICES = { mobile: 'جوال', tablet: 'جهاز لوحي', desktop: 'كمبيوتر' };
const LANGS = { ar: 'العربية', en: 'الإنجليزية' };
const CONTACT_KINDS = ['whatsapp', 'phone', 'email', 'form'];
const pageName = (p) => STAT_PAGES[p] || p;
const fmtDur = (sec) => {
  if (!sec) return '—';
  if (sec < 60) return `${sec} ث`;
  return `${Math.floor(sec / 60)} د${sec % 60 ? ` ${sec % 60} ث` : ''}`;
};
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ar', { hour: 'numeric', minute: '2-digit' });
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const countryName = (code) => { try { return new Intl.DisplayNames(['ar'], { type: 'region' }).of(code); } catch { return code; } };
let statDays = 30, statMetric = 'views'; // kept while moving around the panel

async function viewStats(view, arg) {
  if (arg && arg.startsWith('map')) return viewClickMap(view, arg.replace(/^map\??/, ''));
  setPending(null);
  const r = await api('GET', `/analytics?days=${statDays}`);
  const t = r.totals;
  const tile = (n, label, hint) => h('div', { class: 'stat stat-static' }, h('b', null, n), h('span', null, label), hint ? h('small', { class: 'muted' }, hint) : null);
  const ranges = [[1, 'اليوم'], [7, '7 أيام'], [30, '30 يوماً'], [90, '3 أشهر'], [365, 'سنة']];
  const known = (list) => list.map((p) => ({ ...p, name: p.known ? `${p.client} — ${p.title}` : p.id }));
  const projects = known(r.projects);

  view.replaceChildren(...[
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker' }, 'ANALYTICS'),
        h('h1', null, 'الإحصائيات'),
        h('p', null, 'من يزور الموقع، أي الصفحات يفتح، على ماذا يضغط، وأي مشاريع العملاء تجذب الانتباه. زياراتك أنت وأنت مسجّل في اللوحة لا تُحسب.')),
      h('div', { class: 'row' },
        h('span', { class: `live${t.live ? ' on' : ''}` }, h('i', { 'aria-hidden': 'true' }), `${t.live} الآن على الموقع`),
        h('button', { type: 'button', class: 'btn btn-small', onclick: render }, 'تحديث'))),
    h('div', { class: 'chips' }, ranges.map(([d, name]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(statDays === d), onclick: () => { statDays = d; render(); },
    }, name))),
    h('div', { class: 'stats stats-tight', style: 'margin-top:16px' },
      tile(t.visitors, 'الزوار', 'الزائر يُحسب مرة واحدة في اليوم'),
      tile(t.views, 'مشاهدات الصفحات'),
      tile(t.clicks, 'النقرات', 'على الأزرار والروابط'),
      tile(fmtDur(t.avgTime), 'متوسط الوقت في الصفحة'),
      tile(t.sessions, 'زيارات بمسار كامل', 'كل زيارة صفحةً بصفحة')),
    t.views || t.clicks ? null : h('p', { class: 'empty', style: 'margin-top:16px' }, 'لا زيارات مسجّلة في هذه الفترة بعد. تبدأ الأرقام بالظهور بعد نشر التحديث على الموقع.'),
    statChart(r.daily),
    h('div', { class: 'stat-grid' },
      statCard('الصفحات', 'أكثر الصفحات مشاهدة', statTable(['الصفحة', 'مشاهدات', 'زوار', 'متوسط الوقت'],
        r.pages.map((p) => [pageName(p.path), p.views, p.visitors, fmtDur(p.avgTime)]), 1)),
      statCard('النقرات حسب النوع', 'كل ضغطة على زر أو رابط', barList(r.kinds.map((k) => ({ name: CLICK_KINDS[k.name] || k.name, count: k.count }))))),
    statCard('مشاريع العملاء', 'كم مرة فُتحت صفحة كل مشروع، كم ضغطة وصلت إليه من بطاقته، وكم زائر ضغط واتساب أو اتصال أو بريد وهو يشاهده',
      statTable(['العميل', 'المشروع', 'مشاهدات', 'زوار', 'ضغطات على بطاقته', 'تواصل من صفحته', 'متوسط الوقت'],
        projects.map((p) => [p.client || p.id,
          p.known ? h('a', { href: `/project.html?id=${encodeURIComponent(p.id)}`, target: '_blank', rel: 'noopener', class: 'link' }, p.title) : h('span', { class: 'muted' }, `${p.id} (محذوف)`),
          p.views, p.visitors, p.cardClicks, p.contacts, fmtDur(p.avgTime)]), 2, 50)),
    statCard('تفاصيل النقرات', 'على ماذا ضغط الزوار بالضبط، ومن أي صفحة',
      statTable(['النوع', 'الزر أو الرابط', 'نقرات', 'من صفحة'],
        r.clicks.map((c) => [CLICK_KINDS[c.kind] || c.kind, clickLabel(c.kind, c.label, projects), c.count, c.pages.map((p) => pageName(p.name)).join('، ')]), 2)),
    h('div', { class: 'stat-grid' },
      statCard('من أين يأتي الزوار', 'أول صفحة يفتحها الزائر: من بحث Google، من Instagram، أو مباشرة', barList(r.sources)),
      statCard('الأجهزة', null, barList(r.devices.map((d) => ({ name: DEVICES[d.name] || d.name, count: d.count })))),
      statCard('لغة الصفحة', null, barList(r.langs.map((d) => ({ name: LANGS[d.name] || d.name, count: d.count })))),
      statCard('المتصفحات', null, barList(r.browsers)),
      r.countries.length ? statCard('الدول', 'من عنوان IP لحظة الزيارة — IP Geolocation by DB-IP (db-ip.com)', barList(r.countries.map((c) => ({ name: countryName(c.name), count: c.count })))) : null),
    statCard('خريطة النقرات', 'افتح أي صفحة لترى عليها أين يضغط الزوار، على الجوال أو الكمبيوتر. ولتسجيلات فيديو كاملة للزيارات افتح Microsoft Clarity.',
      h('div', { class: 'row' },
        Object.entries(STAT_PAGES).filter(([p]) => p !== '/404.html').map(([p, name]) => h('a', { class: 'btn btn-small', href: mapHash({ p, l: 'ar', dev: 'mobile' }) }, `📍 ${name}`)),
        h('a', { class: 'btn btn-small', href: 'https://clarity.microsoft.com/projects', target: '_blank', rel: 'noopener' }, '🎥 تسجيلات Clarity ↗'))),
    statSessions(r.sessions, projects),
  ].filter(Boolean));
}

function clickLabel(kind, label, projects) {
  if (kind === 'project') { const p = projects.find((x) => x.id === label); return p ? p.name : label; }
  if (kind === 'link') { const [path, query] = label.split('?'); return pageName(path) + (query ? ` (${query})` : ''); }
  if (kind === 'lang') return label === 'en' ? 'إلى الإنجليزية' : 'إلى العربية';
  if (kind === 'form') return label === 'whatsapp' ? 'عبر واتساب' : 'عبر البريد';
  if (kind === 'whatsapp') return `من ${pageName(label)}`;
  return label || '—';
}

function statCard(title, hint, body) {
  return h('section', { class: 'card stat-card' }, h('h2', { class: 'section-title', style: 'margin:0' }, title), hint ? h('p', { class: 'muted small' }, hint) : null, body);
}
// rows of [cell, …]; the number at barCol also gets a bar, scaled to the largest one. Long tables show the first `limit` rows.
function statTable(head, rows, barCol, limit = 15) {
  if (!rows.length) return h('p', { class: 'muted small' }, 'لا بيانات بعد.');
  const max = Math.max(1, ...rows.map((r) => Number(r[barCol]) || 0));
  const tr = (r) => h('tr', null, r.map((c, i) => (i === barCol
    ? h('td', { class: 'num barcell' }, h('span', { class: 'bar', style: `width:${Math.max(2, (c / max) * 100)}%` }), h('b', null, c))
    : h('td', { class: typeof c === 'number' ? 'num' : null }, c))));
  const body = h('tbody', null, rows.slice(0, limit).map(tr));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'stat-table' },
    h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, c)))), body),
  showAll(rows.length - limit, () => body.append(...rows.slice(limit).map(tr))));
}
// a "show the rest" button that removes itself
function showAll(more, onShow) {
  if (more <= 0) return null;
  const btn = h('button', { type: 'button', class: 'btn btn-small', style: 'margin-top:10px', onclick: () => { onShow(); btn.remove(); } }, `عرض الكل (${more} أخرى)`);
  return btn;
}
function barList(items) {
  if (!items.length) return h('p', { class: 'muted small' }, 'لا بيانات بعد.');
  const total = items.reduce((a, b) => a + b.count, 0), max = Math.max(...items.map((i) => i.count));
  return h('ul', { class: 'barlist' }, items.map((i) => h('li', null,
    h('span', { class: 'name' }, i.name),
    h('span', { class: 'track' }, h('span', { class: 'bar', style: `width:${Math.max(2, (i.count / max) * 100)}%` })),
    h('b', null, i.count), h('small', { class: 'muted' }, `${pct(i.count, total)}%`))));
}

// one measure per day as bars, on one scale: the chips switch the measure
function statChart(daily) {
  const metrics = [['views', 'مشاهدات'], ['visitors', 'زوار'], ['clicks', 'نقرات']];
  const card = h('section', { class: 'card stat-card', style: 'margin-top:16px' });
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  const draw = () => {
    const W = 800, H = 220, top = 14, bottom = 28, left = 34, right = 6;
    const max = Math.max(3, ...daily.map((d) => d[statMetric]));
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const nice = Math.ceil(max / step) * step;
    const n = daily.length, slot = (W - left - right) / n, bw = Math.max(2, Math.min(28, slot - 2));
    const y = (v) => top + (H - top - bottom) * (1 - v / nice);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${metrics.find((m) => m[0] === statMetric)[1]} يومياً` });
    for (let i = 0; i <= 3; i++) {
      const v = Math.round((nice / 3) * i), yy = y(v);
      svg.append(el('line', { x1: left, x2: W - right, y1: yy, y2: yy, class: i ? 'grid' : 'base' }), el('text', { x: left - 6, y: yy + 4, class: 'axis', 'text-anchor': 'end' }, v));
    }
    const tip = h('div', { class: 'chart-tip', hidden: true });
    const labelEvery = Math.ceil(n / 8);
    daily.forEach((d, i) => {
      const x = left + slot * i + (slot - bw) / 2, v = d[statMetric], yy = y(v), r = Math.min(4, bw / 2, H - bottom - yy);
      if (v > 0) svg.append(el('path', { class: 'barmark', d: `M${x},${H - bottom} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${H - bottom} Z` }));
      if (i % labelEvery === 0) svg.append(el('text', { x: x + bw / 2, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, fmtDay(d.day)));
      const hit = el('rect', { x: left + slot * i, y: top, width: slot, height: H - top - bottom, class: 'hit' });
      hit.addEventListener('mouseenter', () => {
        tip.hidden = false;
        tip.replaceChildren(h('strong', null, fmtDay(d.day)), h('span', null, `مشاهدات: ${d.views}`), h('span', null, `زوار: ${d.visitors}`), h('span', null, `نقرات: ${d.clicks}`));
        tip.style.left = `${((left + slot * (i + 0.5)) / W) * 100}%`;
        hit.classList.add('on');
      });
      hit.addEventListener('mouseleave', () => { tip.hidden = true; hit.classList.remove('on'); });
      svg.append(hit);
    });
    card.replaceChildren(
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h2', { class: 'section-title', style: 'margin:0' }, 'يوماً بيوم'),
        h('div', { class: 'chips' }, metrics.map(([k, name]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(statMetric === k), onclick: () => { statMetric = k; draw(); } }, name)))),
      h('div', { class: 'chart-wrap' }, svg, tip),
      h('details', { class: 'small' }, h('summary', { class: 'muted' }, 'عرض كجدول'),
        statTable(['اليوم', 'مشاهدات', 'زوار', 'نقرات'], daily.slice().reverse().map((d) => [fmtDay(d.day), d.views, d.visitors, d.clicks]), 1, 366)));
  };
  draw();
  return card;
}

// each visit, page by page
function statSessions(sessions, projects) {
  const card = statCard('مسارات الزوار', 'آخر الزيارات بالتفصيل: الصفحات بالترتيب، الوقت في كل صفحة، وما ضغطوا عليه. تظهر فقط لمن وافق في شريط الخصوصية على الموقع.', null);
  if (!sessions.length) { card.append(h('p', { class: 'muted small' }, 'لا زيارات بمسار كامل بعد.')); return card; }
  const projectName = (id) => { const p = projects.find((x) => x.id === id); return p ? p.name : id; };
  const one = (s) => {
    const views = s.steps.filter((x) => x.t === 'view').length, clicks = s.steps.filter((x) => x.t === 'click');
    const contacted = clicks.some((c) => CONTACT_KINDS.includes(c.k));
    return h('details', { class: 'msg journey' },
      h('summary', null, h('span', { class: `dot${contacted ? '' : ' off'}`, 'aria-hidden': 'true' }),
        h('span', { class: 'who' }, `${views} ${noun(views, ['صفحة', 'صفحتان', 'صفحات', 'صفحة'])} · ${clicks.length} ${noun(clicks.length, ['نقرة', 'نقرتان', 'نقرات', 'نقرة'])}`,
          h('small', null, ` · ${DEVICES[s.dev] || ''}${s.c ? ` · ${countryName(s.c)}` : ''} · ${s.src} · ${fmtDur(s.duration)}`),
          s.returning ? h('span', { class: 'tag lime', style: 'margin-inline-start:8px' }, 'زائر عائد') : null,
          contacted ? h('span', { class: 'tag', style: 'margin-inline-start:8px' }, 'حاول التواصل') : null),
        h('span', { class: 'when' }, fmtDate(s.start))),
      h('ol', { class: 'steps' }, s.steps.map((x) => h('li', { class: x.t },
        h('time', null, fmtTime(x.at)),
        x.t === 'view'
          ? h('span', null, '📄 ', x.pr ? `مشروع: ${projectName(x.pr)}` : pageName(x.p), x.d ? h('small', { class: 'muted' }, ` — ${fmtDur(x.d)}`) : null)
          : h('span', null, '👆 ', CLICK_KINDS[x.k] || x.k, ': ', clickLabel(x.k, x.x, projects),
            x.pos ? h('a', { class: 'map-link', href: mapHash({ s: s.id, at: x.at }) }, '📍 أين ضغط') : null)))));
  };
  const list = h('div', { class: 'msgs' }, sessions.slice(0, 20).map(one));
  card.append(list, showAll(sessions.length - 20, () => list.append(...sessions.slice(20).map(one))));
  return card;
}

/* ---------- the click map: the real page in a frame, with a dot wherever visitors clicked ----------
   #/stats/map?p=/work.html&l=ar&dev=mobile          everyone's clicks on a page (a heatmap)
   #/stats/map?s=<visit id>&at=<time>                one visitor's clicks, numbered in order, that click highlighted */
const MAP_WIDTH = { mobile: 390, desktop: 1280 };
const mapHash = (q) => `#/stats/map?${new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString()}`;

async function viewClickMap(view, query) {
  setPending(null);
  const q = Object.fromEntries(new URLSearchParams(query));
  const visit = q.s || '';
  const params = visit ? { s: visit, days: statDays } : { p: q.p || '/', l: q.l || 'ar', pr: q.pr || '', dev: q.dev || 'mobile', days: statDays };
  const r = await api('GET', `/analytics/clicks?${new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()}`);
  let clicks = r.clicks.slice().reverse(); // oldest first: the numbers follow the visit's order
  let projects = [];
  try { projects = (await api('GET', '/projects')).data.projects; } catch { /* the page still works without names */ }
  const projectTitle = (id) => { const p = projects.find((x) => x.id === id); return p ? `${p.client.ar || p.client.en} — ${p.title.ar || p.title.en}` : id; };

  // one visit: show the page of the chosen click (or the first), with tabs for its other pages
  let page = { p: params.p, l: params.l, pr: params.pr, dev: params.dev };
  if (visit) {
    const chosen = clicks.find((c) => c.ts === q.at) || clicks[0];
    if (!chosen) {
      view.replaceChildren(h('a', { class: 'btn btn-small', href: '#/stats' }, '→ الإحصائيات'), h('p', { class: 'empty', style: 'margin-top:16px' }, 'لا نقرات محفوظة لهذه الزيارة.'));
      return;
    }
    page = { p: q.p || chosen.p, l: q.l || chosen.l, pr: q.pr || chosen.pr || '', dev: chosen.mobile ? 'mobile' : 'desktop' };
  }
  const key = (c) => `${c.p}|${c.l}|${c.pr || ''}`;
  const pagesOfVisit = visit ? [...new Map(clicks.map((c) => [key(c), c])).values()] : [];
  const onPage = clicks.filter((c) => key(c) === `${page.p}|${page.l}|${page.pr || ''}`);
  const pageLabel = (c) => `${c.pr ? `مشروع: ${projectTitle(c.pr)}` : pageName(c.p)}${c.l === 'en' ? ' (EN)' : ''}`;

  const chip = (label, on, href) => h('a', { class: 'chip', href, 'aria-pressed': String(on) }, label);
  const controls = visit
    ? h('div', { class: 'chips' }, pagesOfVisit.map((c) => chip(pageLabel(c), key(c) === `${page.p}|${page.l}|${page.pr || ''}`, mapHash({ s: visit, at: q.at, p: c.p, l: c.l, pr: c.pr }))))
    : h('div', { class: 'grid', style: 'gap:10px' },
      h('div', { class: 'chips' }, Object.entries(STAT_PAGES).filter(([p]) => p !== '/404.html').map(([p, name]) => chip(name, p === page.p, mapHash({ ...page, p, pr: '' })))),
      page.p === '/project.html' ? h('div', { class: 'chips' }, projects.map((p) => chip(projectTitle(p.id), p.id === page.pr, mapHash({ ...page, pr: p.id })))) : null,
      h('div', { class: 'chips' },
        chip('جوال', page.dev === 'mobile', mapHash({ ...page, dev: 'mobile' })), chip('كمبيوتر', page.dev === 'desktop', mapHash({ ...page, dev: 'desktop' })),
        h('span', { style: 'width:12px' }),
        chip('العربية', page.l === 'ar', mapHash({ ...page, l: 'ar' })), chip('الإنجليزية', page.l === 'en', mapHash({ ...page, l: 'en' }))));

  const width = MAP_WIDTH[page.dev] || 390;
  const src = `${page.l === 'en' ? '/en' : ''}${page.p}${page.p === '/project.html' && page.pr ? `?id=${encodeURIComponent(page.pr)}` : ''}`;
  const frame = h('iframe', { class: 'map-frame', src, title: 'الصفحة مع أماكن النقرات', width });
  const box = h('div', { class: 'map-box' }, frame);
  const status = h('p', { class: 'muted small' }, 'جارٍ تحميل الصفحة…');
  const list = visit ? h('ol', { class: 'steps map-list' }) : null;

  view.replaceChildren(...[
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'CLICK MAP'),
      h('h1', null, visit ? 'أين ضغط هذا الزائر' : 'خريطة النقرات'),
      h('p', null, visit
        ? 'الصفحة كما يراها الزائر، والأرقام بترتيب نقراته. النقرة التي اخترتها بالأحمر.'
        : 'الصفحة الحقيقية، وكل نقطة مكان ضغط فيه زائر. كلما تجمّعت النقاط وتوهّجت، كثرت النقرات هناك.')),
      h('a', { class: 'btn btn-small', href: '#/stats' }, '→ الإحصائيات')),
    controls,
    h('div', { class: 'row', style: 'margin:14px 0 10px;justify-content:space-between' }, status,
      h('a', { class: 'btn btn-small', href: src, target: '_blank', rel: 'noopener' }, 'فتح الصفحة ↗')),
    box,
    list,
  ].filter(Boolean));

  // fit the page's real width into the panel
  const fit = () => {
    const avail = Math.max(280, view.clientWidth - 2);
    const scale = Math.min(1, avail / width);
    const height = Math.round(Math.max(420, window.innerHeight - 220) / scale);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    box.style.width = `${width * scale}px`;
    box.style.height = `${height * scale}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  const stop = () => { window.removeEventListener('resize', fit); window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);

  frame.addEventListener('load', () => {
    let win, doc;
    try { win = frame.contentWindow; doc = frame.contentDocument; } catch { status.textContent = 'تعذّر فتح الصفحة'; return; }
    doc.documentElement.classList.remove('is-loading');
    // a stylesheet file, not a <style> tag: the site's Content-Security-Policy only allows its own stylesheets
    const css = doc.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/admin/clickmap.css?v=1';
    doc.head.append(css);
    // the page shouldn't navigate away from under the dots
    doc.addEventListener('click', (e) => { if (e.target.closest('a, button, form')) e.preventDefault(); }, true);
    const layer = doc.createElement('div');
    layer.className = 'pxm-layer';
    doc.documentElement.append(layer);
    const dots = onPage.map((c, i) => {
      const d = doc.createElement('div');
      d.className = visit ? `pxm-num${c.ts === q.at ? ' on' : ''}` : 'pxm-heat';
      if (visit) d.textContent = clicks.indexOf(c) + 1;
      layer.append(d);
      return { c, d, i };
    });
    let missing = 0;
    const place = () => {
      missing = 0;
      for (const { c, d } of dots) {
        let x = null, y = null, el = null;
        try { el = c.sel ? doc.querySelector(c.sel) : null; } catch { el = null; }
        const rect = el && el.getClientRects().length ? el.getBoundingClientRect() : null;
        if (rect && rect.width) { x = rect.left + c.ox * rect.width + win.scrollX; y = rect.top + c.oy * rect.height + win.scrollY; }
        else if (c.px !== undefined && c.px !== null) { x = c.px * doc.documentElement.scrollWidth; y = c.py; }
        d.style.display = x === null ? 'none' : '';
        if (x === null) { missing++; continue; }
        d.style.left = `${x}px`;
        d.style.top = `${y}px`;
      }
      status.textContent = onPage.length
        ? `${onPage.length} ${noun(onPage.length, ['نقرة', 'نقرتان', 'نقرات', 'نقرة'])} على هذه الصفحة${missing ? ` · ${missing} لم يعد مكانها موجوداً (تغيّرت الصفحة)` : ''}`
        : 'لا نقرات على هذه الصفحة في هذه الفترة.';
    };
    let queued = false;
    const later = () => { if (!queued) { queued = true; win.requestAnimationFrame(() => { queued = false; place(); }); } };
    win.addEventListener('scroll', later, { passive: true });
    win.addEventListener('resize', later);
    // the page animates in: place the dots again while it settles
    [0, 400, 1200, 2500, 4500].forEach((t) => setTimeout(place, t));
    const chosen = dots.find(({ c }) => c.ts === q.at);
    if (chosen) setTimeout(() => { const y = parseFloat(chosen.d.style.top) || 0; win.scrollTo(0, Math.max(0, y - 260)); setTimeout(place, 300); }, 1300);
  });

  if (list) {
    list.replaceChildren(...clicks.map((c, i) => h('li', { class: `click${c.ts === q.at ? ' on' : ''}` },
      h('time', null, `${i + 1} · ${fmtTime(c.ts)}`),
      h('a', { href: mapHash({ s: visit, at: c.ts }) }, CLICK_KINDS[c.k] || c.k, ': ', clickLabel(c.k, c.x, projects.map((p) => ({ id: p.id, name: projectTitle(p.id) }))), h('small', { class: 'muted' }, ` — ${pageLabel(c)}`)))));
  }
}

/* =========================================================
   Account
   ========================================================= */
async function viewAccount(view) {
  setPending(null);
  const form = h('form', { class: 'card grid', style: 'max-width:520px' },
    h('h2', { class: 'section-title', style: 'margin:0' }, 'تغيير كلمة المرور'),
    h('label', { class: 'field' }, h('span', null, 'كلمة المرور الحالية'), h('input', { type: 'password', name: 'current', autocomplete: 'current-password', dir: 'ltr', required: true })),
    h('label', { class: 'field' }, h('span', null, 'كلمة المرور الجديدة'), h('input', { type: 'password', name: 'next', autocomplete: 'new-password', dir: 'ltr', minlength: 12, required: true }),
      h('span', { class: 'hint' }, '12 حرفاً على الأقل، ولا تحتوي اسم المستخدم. جملة طويلة تتذكرها (16 حرفاً فأكثر) أفضل من كلمة قصيرة معقدة.')),
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
