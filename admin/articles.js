/* PuzzleX admin — the blog (articles.json via /api/admin/articles; the site draws them with lib/articles.js).
   Loaded after admin.js and uses its helpers (h, api, toast, setPending, refreshBar, upload, pickFiles, dropZone,
   clone, same, asset, noun, render). An article shows in a language once it has a title and a text in it. */
'use strict';

let blog = null; // { list, saved, rev } kept while moving between the list and the editor

async function loadArticles(force) {
  if (blog && !force) return blog;
  const r = await api('GET', '/articles');
  blog = { list: r.data, saved: clone(r.data), rev: r.rev };
  return blog;
}
function articlesPending() {
  setPending({
    label: 'المدونة',
    count: () => {
      if (!blog) return 0;
      const ids = new Set([...blog.list.map((a) => a.id), ...blog.saved.map((a) => a.id)]);
      let n = 0;
      for (const id of ids) if (!same(blog.list.find((a) => a.id === id), blog.saved.find((a) => a.id === id))) n++;
      return n;
    },
    discard: () => { blog.list = clone(blog.saved); render(); },
    save: async () => {
      const r = await api('PUT', '/articles', { rev: blog.rev, data: blog.list.map(({ _new, _idTouched, ...a }) => a) });
      blog.list = r.data; blog.saved = clone(r.data); blog.rev = r.rev;
      render();
    },
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const hasLang = (a, lang) => Boolean(a.title[lang].trim() && a.body[lang].trim());
const articleDay = (iso) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; } };

async function viewArticles(view, arg) {
  await loadArticles();
  articlesPending();
  if (arg) return articleEditor(view, arg);
  const list = blog.list.slice().sort((a, b) => b.date.localeCompare(a.date));
  const add = () => {
    let n = 1;
    while (blog.list.some((a) => a.id === `article-${n}`)) n++;
    const a = { id: `article-${n}`, date: today(), published: false, cover: '', title: { ar: '', en: '' }, excerpt: { ar: '', en: '' }, body: { ar: '', en: '' }, _new: true };
    blog.list.unshift(a);
    location.hash = `#/articles/${encodeURIComponent(a.id)}`;
  };
  const langTag = (a, lang) => h('span', { class: `tag${hasLang(a, lang) ? ' lime' : ''}`, title: hasLang(a, lang) ? 'منشور بهذه اللغة' : 'لا يظهر بهذه اللغة: ينقصه العنوان أو النص' }, lang === 'ar' ? 'عربي' : 'EN');
  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'BLOG'),
      h('h1', null, 'المدونة'),
      h('p', null, 'مقالات تساعد الموقع على الظهور في Google وتعرّف الزوار بخبرتكم. الأحدث يظهر أولاً في صفحة «المدونة»، وآخر 3 في الصفحة الرئيسية. المقال يظهر بلغة ما متى كان له عنوان ونص بها.')),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-ghost', href: '/blog.html', target: '_blank', rel: 'noopener' }, 'افتح المدونة ↗'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, '+ مقال جديد'))),
    list.length
      ? h('div', { class: 'proj-list' }, list.map((a) => h('div', { class: `proj-row${a.published ? '' : ' draft'}` },
        a.cover ? h('div', { class: 'thumb' }, h('img', { src: asset(a.cover), alt: '' })) : h('div', { class: 'thumb art-thumb' }, h('b', null, [...(a.title.ar || a.title.en || '؟')][0])),
        h('div', null,
          h('div', { class: 't' }, a.title.ar || a.title.en || '(بدون عنوان)'),
          h('div', { class: 'c row', style: 'gap:6px;margin-top:4px' }, articleDay(a.date), ' · ', a.published ? h('span', { class: 'tag lime' }, 'منشور') : h('span', { class: 'tag' }, 'مسودة'), langTag(a, 'ar'), langTag(a, 'en'))),
        h('div', { class: 'row' },
          a.published && !a._new ? h('a', { class: 'btn btn-small btn-ghost', href: `/article.html?id=${encodeURIComponent(a.id)}`, target: '_blank', rel: 'noopener' }, 'عرض ↗') : null,
          h('a', { class: 'btn btn-small btn-primary', href: `#/articles/${encodeURIComponent(a.id)}` }, 'تعديل')))))
      : h('p', { class: 'empty' }, 'لا مقالات بعد. اكتب أول مقال: يظهر قسم «من المدونة» في الصفحة الرئيسية تلقائياً مع أول مقال منشور.'),
  );
}

/* ---------- the body's little markdown, drawn as the site draws it (lib/articles.js renderBody) ---------- */
function previewBody(md) {
  const out = document.createDocumentFragment();
  const inline = (text, el) => {
    // **bold** and [text](https://…); everything else stays text
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^\s)"]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      el.append(text.slice(last, m.index));
      el.append(m[1] !== undefined ? h('strong', null, m[1]) : h('a', { href: m[3], target: '_blank', rel: 'noopener' }, m[2]));
      last = re.lastIndex;
    }
    el.append(text.slice(last));
    return el;
  };
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.append(inline(para.join(' '), h('p'))); para = []; } };
  const flushList = () => { list = null; };
  for (const raw of String(md).split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) { flushPara(); flushList(); out.append(inline(m[2], h(`h${m[1].length}`))); continue; }
    if ((m = /^[-•*]\s+(.+)$/.exec(line)) || (m = /^\d+[.)]\s+(.+)$/.exec(line))) {
      flushPara();
      const tag = /^\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = h(tag); out.append(list); }
      list.append(inline(m[1], h('li')));
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  return out;
}

function articleEditor(view, id) {
  const a = blog.list.find((x) => x.id === id);
  if (!a) { view.replaceChildren(h('div', { class: 'empty' }, 'المقال غير موجود. ', h('a', { href: '#/articles' }, 'العودة إلى المدونة'))); return; }
  const changed = () => refreshBar();
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70);

  // the link name follows the English title while the article is new, unless someone typed one
  const idHint = h('span', { class: 'hint ltr' });
  const showId = () => { idHint.textContent = `www.puzzlexmedia.com/article.html?id=${a.id}`; };
  showId();
  const idInput = h('input', { value: a.id, dir: 'ltr', oninput: (e) => { a.id = e.target.value.trim().toLowerCase(); a._idTouched = true; showId(); changed(); }, onchange: () => history.replaceState(null, '', `#/articles/${encodeURIComponent(a.id)}`) });

  const cover = h('div', { class: 'images' });
  const drawCover = () => cover.replaceChildren(a.cover
    ? h('div', { class: 'img-tile' }, h('img', { src: asset(a.cover), alt: 'صورة الغلاف' }), h('div', { class: 'acts' },
      h('button', { type: 'button', class: 'btn btn-small btn-danger', onclick: () => { a.cover = ''; drawCover(); changed(); } }, 'إزالة')))
    : dropZone('رفع صورة الغلاف', false, async ([f]) => {
      try { toast('جارٍ رفع الصورة…'); a.cover = await upload(f, 1600); drawCover(); changed(); } catch (err) { toast(err.message, 'err'); }
    }));
  drawCover();

  // one card per language: title, the short description (Google's snippet), the text with its toolbar and preview
  const langCard = (lang) => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const label = lang === 'ar' ? 'بالعربية' : 'English';
    const snippet = h('div', { class: 'serp', dir });
    const drawSnippet = () => snippet.replaceChildren(
      h('span', { class: 'serp-url', dir: 'ltr' }, `puzzlexmedia.com › ${lang === 'en' ? 'en › ' : ''}article`),
      h('span', { class: 'serp-title' }, `${a.title[lang] || (lang === 'ar' ? 'عنوان المقال' : 'Article title')} | PuzzleX Media`),
      h('span', { class: 'serp-desc' }, a.excerpt[lang] || (lang === 'ar' ? 'الوصف المختصر يظهر هنا في نتائج البحث.' : 'The short description shows here in search results.')));
    const count = (el, min, max) => {
      const c = h('span', { class: 'hint count' });
      const upd = () => {
        const n = el.value.length;
        c.textContent = `${n} حرفاً${n && (n < min || n > max) ? ` · الأفضل بين ${min} و${max}` : ''}`;
        c.classList.toggle('warn', Boolean(n) && (n < min || n > max));
      };
      el.addEventListener('input', upd);
      upd();
      return c;
    };
    const title = h('input', { value: a.title[lang], dir, lang, oninput: (e) => { a.title[lang] = e.target.value; if (a._new && !a._idTouched && lang === 'en') { idInput.value = a.id = slugify(e.target.value) || a.id; showId(); } drawSnippet(); changed(); } });
    const excerpt = h('textarea', { value: a.excerpt[lang], dir, lang, rows: 3, oninput: (e) => { a.excerpt[lang] = e.target.value; drawSnippet(); changed(); } });
    const body = h('textarea', { class: 'article-src', value: a.body[lang], dir, lang, rows: 22, spellcheck: true, oninput: (e) => { a.body[lang] = e.target.value; if (!preview.hidden) drawPreview(); changed(); } });
    const preview = h('div', { class: 'article-preview', dir, lang, hidden: true });
    const drawPreview = () => preview.replaceChildren(previewBody(a.body[lang]));
    // the toolbar wraps the selection (or starts a new line) with the marks the site understands
    const wrap = (before, after = before, placeholder = '') => {
      const { selectionStart: s0, selectionEnd: s1, value } = body;
      const sel = value.slice(s0, s1) || placeholder;
      body.setRangeText(before + sel + after, s0, s1, 'end');
      body.focus();
      body.dispatchEvent(new Event('input'));
    };
    const line = (prefix) => {
      const { selectionStart: s0, value } = body;
      const start = value.lastIndexOf('\n', s0 - 1) + 1;
      body.setRangeText(prefix, start, start, 'end');
      body.focus();
      body.dispatchEvent(new Event('input'));
    };
    const tool = (txt, title2, fn) => h('button', { type: 'button', class: 'btn btn-small btn-ghost', title: title2, onclick: fn }, txt);
    const toggle = h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
      preview.hidden = !preview.hidden; body.hidden = !preview.hidden;
      toggle.textContent = preview.hidden ? 'معاينة' : 'تحرير';
      if (!preview.hidden) drawPreview();
    } }, 'معاينة');
    drawSnippet();
    return h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h2', null, label), hasLang(a, lang) ? h('span', { class: 'tag lime' }, 'يظهر بهذه اللغة') : h('span', { class: 'tag' }, 'لا يظهر بهذه اللغة بعد')),
      h('label', { class: 'field' }, h('span', null, 'العنوان', h('b', null, ' *')), title, count(title, 30, 65)),
      h('label', { class: 'field' }, h('span', null, 'الوصف المختصر (يظهر في Google وفي بطاقة المقال)'), excerpt, count(excerpt, 110, 160)),
      h('div', { class: 'field' }, h('span', null, 'كيف يبدو في نتائج Google'), snippet),
      h('div', { class: 'field' }, h('span', null, 'نص المقال', h('b', null, ' *')),
        h('div', { class: 'row md-tools' },
          tool('عنوان', 'عنوان قسم (##)', () => line('## ')),
          tool('عنوان فرعي', 'عنوان فرعي (###)', () => line('### ')),
          tool('غامق', 'نص غامق (**…**)', () => wrap('**', '**', lang === 'ar' ? 'نص' : 'text')),
          tool('• قائمة', 'قائمة نقطية (- )', () => line('- ')),
          tool('1. قائمة', 'قائمة مرقّمة (1. )', () => line('1. ')),
          tool('رابط', 'رابط [النص](https://…)', () => wrap('[', '](https://)', lang === 'ar' ? 'النص' : 'text')),
          h('span', { class: 'spacer' }), toggle),
        body, preview,
        h('span', { class: 'hint' }, 'سطر فارغ بين الفقرات. ## عنوان قسم، ### عنوان فرعي، - نقطة، 1. رقم، **غامق**، [نص](https://رابط).')));
  };

  const remove = () => {
    if (!confirm(`حذف مقال «${a.title.ar || a.title.en || a.id}»؟ يمكنك التراجع قبل الحفظ.`)) return;
    blog.list.splice(blog.list.indexOf(a), 1);
    location.hash = '#/articles';
  };

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', null,
      h('p', { class: 'kicker' }, 'ARTICLE'),
      h('h1', null, a.title.ar || a.title.en || 'مقال جديد'),
      h('p', null, h('a', { href: '#/articles' }, '→ كل المقالات'))),
      h('div', { class: 'row' },
        a._new ? null : h('a', { class: 'btn btn-ghost', href: `/article.html?id=${encodeURIComponent(a.id)}`, target: '_blank', rel: 'noopener' }, 'عرض على الموقع ↗'),
        h('button', { type: 'button', class: 'btn btn-danger', onclick: remove }, 'حذف المقال'))),
    h('div', { class: 'editor' },
      h('div', { class: 'card' }, h('h2', null, 'النشر'),
        h('label', { class: 'tm-switch' }, h('input', { type: 'checkbox', checked: a.published, onchange: (e) => { a.published = e.target.checked; changed(); } }), 'منشور على الموقع (بدونها يبقى مسودة لا يراها أحد)'),
        h('div', { class: 'two' },
          h('label', { class: 'field' }, h('span', null, 'تاريخ النشر'), h('input', { type: 'date', value: a.date, dir: 'ltr', oninput: (e) => { a.date = e.target.value; changed(); } })),
          h('label', { class: 'field' }, h('span', null, 'اسم الرابط (بالإنجليزية)'), idInput, idHint,
            a._new ? null : h('span', { class: 'hint' }, 'تغييره بعد النشر يكسر الروابط التي شاركها أحد أو فهرسها Google.')))),
      h('div', { class: 'card' }, h('h2', null, 'صورة الغلاف (اختيارية)'),
        h('p', { class: 'hint' }, 'تظهر أعلى المقال وفي بطاقته وعند مشاركة الرابط. الأفضل عريضة 1200×630. بدونها تظهر بطاقة بأول حرف من العنوان.'), cover),
      langCard('ar'),
      langCard('en')),
  );
}

VIEWS.articles = viewArticles;
// leaving the blog (after the panel's "leave without saving?" question) drops its unsaved edits, as with the projects
window.addEventListener('hashchange', () => { if (!/^#\/articles(\/|$)/.test(location.hash)) blog = null; });
