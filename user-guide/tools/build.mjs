// Build a print-quality user-guide PDF from a guide JSON — a Node port of the client-user-guide skill's build_guide.py
// (same data preparation, same markup as assets/template.html.j2, same guide.css / fonts / Paged.js), for machines
// without Python.
//   node user-guide/tools/build.mjs user-guide/guide.ar.json --shots user-guide/shots --out "out/X (AR).pdf" [--preview dir]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKILL = 'C:/Users/user/.claude/skills/synced/680ff0db-b022-4516-be4d-172da3d97e90_1c356a5c-04ce-4f6c-977c-588e83f64ba0/client-user-guide';
const ASSETS = path.join(SKILL, 'assets');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const LABELS = {
  en: {
    user_guide: 'User Guide', system: 'System', version: 'Version', date: 'Date',
    start_here: 'Start here', how_to_use: 'How to use this guide', who_reads_what: 'Who should read what',
    reader: 'If you are…', read_these: 'Read these sections', symbols: 'Symbols used in this guide',
    sample_button: 'Save', legend_ui: 'A button, menu or field exactly as it appears on screen.',
    legend_marker: 'A marker on a screenshot. The list under the picture explains each one.',
    legend_tip: 'A tip that saves you time.', legend_warning: 'Something to be careful about.',
    legend_note: 'Extra information that is good to know.', legend_result: 'What you should see when the task is done.',
    contents: 'Contents', reference: 'Reference', part: 'Part', chapter: 'Chapter',
    before_you_start: 'Before you start', result: 'Done! You should now see', tip: 'Tip',
    warning: 'Important', danger: 'Warning', note: 'Good to know',
    quick_reference: 'Quick reference', quick_reference_lead: 'The most common tasks on one page. Keep it near your desk.',
    i_want_to: 'I want to…', do_this: 'Do this',
    faq: 'Frequently asked questions', q_mark: 'Q', troubleshooting: 'Troubleshooting',
    troubleshooting_lead: 'Find what you see in the first column, then follow the fix.',
    problem: 'What you see', likely_cause: 'Why it happens', fix: 'What to do',
    glossary: 'Glossary', need_help: 'Need help?',
    need_help_lead: "If something in this guide doesn't match what you see, or you're stuck, contact us.",
    page: 'Page', of: 'of',
    role_staff: 'Staff', role_manager: 'Managers & admins', role_owner: 'Business owner', role_all: 'Everyone',
  },
  ar: {
    user_guide: 'دليل المستخدم', system: 'النظام', version: 'الإصدار', date: 'التاريخ',
    start_here: 'ابدأ من هنا', how_to_use: 'كيف تستخدم هذا الدليل', who_reads_what: 'ماذا يقرأ كل شخص',
    reader: 'إذا كنت…', read_these: 'اقرأ هذه الأقسام', symbols: 'الرموز المستخدمة في الدليل',
    sample_button: 'حفظ', legend_ui: 'زر أو قائمة أو حقل كما يظهر تماماً على الشاشة.',
    legend_marker: 'علامة على الصورة، وتشرح القائمة أسفل الصورة كل علامة.',
    legend_tip: 'نصيحة توفّر عليك الوقت.', legend_warning: 'أمر يجب الانتباه إليه.',
    legend_note: 'معلومة إضافية مفيدة.', legend_result: 'ما يجب أن تراه بعد إتمام المهمة.',
    contents: 'المحتويات', reference: 'مرجع', part: 'الجزء', chapter: 'الفصل',
    before_you_start: 'قبل أن تبدأ', result: 'تمّ! يجب أن ترى الآن', tip: 'نصيحة',
    warning: 'مهم', danger: 'تحذير', note: 'معلومة مفيدة',
    quick_reference: 'مرجع سريع', quick_reference_lead: 'أكثر المهام استخداماً في صفحة واحدة. احتفظ بها قرب مكتبك.',
    i_want_to: 'أريد أن…', do_this: 'اتبع الخطوات',
    faq: 'الأسئلة الشائعة', q_mark: 'س', troubleshooting: 'حل المشكلات',
    troubleshooting_lead: 'ابحث عمّا تراه في العمود الأول، ثم اتبع الحل.',
    problem: 'ما تراه', likely_cause: 'السبب', fix: 'الحل',
    glossary: 'المصطلحات', need_help: 'تحتاج مساعدة؟',
    need_help_lead: 'إذا كان ما في الدليل لا يطابق ما تراه، أو واجهتك مشكلة، تواصل معنا.',
    page: 'صفحة', of: 'من',
    role_staff: 'الموظفون', role_manager: 'المدراء والمشرفون', role_owner: 'صاحب العمل', role_all: 'الجميع',
  },
};
const LETTERS = {
  en: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ar: ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر'],
};
const ROLES = ['staff', 'manager', 'owner', 'all'];
const WARN = [];
const warn = (m) => WARN.push(m);

/* ---------- text ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// tiny inline markup: **UI label**, `key`, [[callout-key]], *emphasis*, blank line = new paragraph
function md(text, markers) {
  if (text == null) return '';
  if (Array.isArray(text)) text = text.join('\n\n');
  return String(text).trim().split(/\n\s*\n/).map((para) => {
    let s = esc(para);
    s = s.replace(/\*\*(.+?)\*\*/g, '<span class="ui">$1</span>');
    s = s.replace(/`(.+?)`/g, '<kbd>$1</kbd>');
    s = s.replace(/(?<![\p{L}\p{N}_*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}_*])/gu, '<em>$1</em>');
    s = s.replace(/\[\[(.+?)\]\]/g, (m, k) => {
      const key = unesc(k).trim();
      if (markers && key in markers) return `<span class="m-inline">${markers[key]}</span>`;
      warn(`[[${key}]] used in text but no callout with that key in this step`);
      return '';
    });
    return `<p>${s.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
const mdInline = (text) => { const h = md(text); return (h.match(/<p>/g) || []).length === 1 ? h.replace(/^<p>|<\/p>$/g, '') : h; };

/* ---------- colour ---------- */
function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function inkFor(bg) {
  const lb = lum(bg);
  const white = 1.05 / (lb + 0.05), dark = (lb + 0.05) / (lum('#14181f') + 0.05);
  return white >= dark || white >= 3.0 ? '#ffffff' : '#14181f';
}
const pngSize = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

/* ---------- build ---------- */
class Builder {
  constructor(guidePath, shotsDir, buildDir) {
    this.guidePath = path.resolve(guidePath);
    this.base = path.dirname(this.guidePath);
    this.g = JSON.parse(fs.readFileSync(this.guidePath, 'utf8'));
    this.lang = this.g.meta?.language || 'en';
    this.rtl = (this.g.meta?.direction || (['ar', 'fa', 'he', 'ur'].includes(this.lang) ? 'rtl' : 'ltr')) === 'rtl';
    this.L = { ...(LABELS[this.lang] || LABELS.en), ...(this.g.labels || {}) };
    this.letters = LETTERS[this.lang] || LETTERS.en;
    this.shotsDir = shotsDir ? path.resolve(shotsDir) : null;
    this.build = path.resolve(buildDir);
    this.imgDir = path.join(this.build, 'img');
    this.imgCount = 0;
  }

  copyImg(src) {
    const abs = path.isAbsolute(src) ? src : path.resolve(this.base, src);
    if (!fs.existsSync(abs)) { warn(`image not found: ${abs}`); return null; }
    fs.mkdirSync(this.imgDir, { recursive: true });
    this.imgCount++;
    const name = `${String(this.imgCount).padStart(3, '0')}-${path.basename(abs)}`;
    fs.copyFileSync(abs, path.join(this.imgDir, name));
    return `img/${name}`;
  }

  findShot(id) {
    if (!this.shotsDir) { warn(`shot '${id}' referenced but no --shots folder given`); return [null, null]; }
    for (const d of [path.join(this.shotsDir, this.lang), this.shotsDir]) {
      const j = path.join(d, `${id}.json`);
      if (fs.existsSync(j)) return [JSON.parse(fs.readFileSync(j, 'utf8')), d];
    }
    warn(`shot '${id}' not found in ${this.shotsDir}/${this.lang} or ${this.shotsDir}`);
    return [null, null];
  }

  figure(spec) {
    if (!spec) return [null, {}];
    if (typeof spec === 'string') spec = { id: spec };
    let meta = {}, imgPath;
    if (spec.id) {
      const [m, folder] = this.findShot(spec.id);
      if (!m) return [null, {}];
      meta = m; imgPath = path.join(folder, m.image);
    } else if (spec.image) imgPath = spec.image;
    else { warn(`figure without id or image: ${JSON.stringify(spec)}`); return [null, {}]; }
    const src = this.copyImg(imgPath);
    if (!src) return [null, {}];
    const [pxW, pxH] = pngSize(path.join(this.build, src));
    const w = meta.width || pxW, h = meta.height || pxH;
    const boxes = meta.boxes || {};
    const markers = [], legend = [], keymap = {};
    (spec.callouts || []).forEach((c, i) => {
      const letter = this.letters[i % this.letters.length];
      let box = null;
      if (c.key && boxes[c.key]) { const [bx, by, bw, bh] = boxes[c.key]; box = [bx / w * 100, by / h * 100, bw / w * 100, bh / h * 100]; }
      else if (c.box_pct) box = c.box_pct;
      else if (c.point_pct) box = [...c.point_pct, 0, 0];
      else { warn(`callout '${c.key}' has no matching box in shot '${spec.id}' — capture it or use box_pct`); return; }
      const [l, t, bw, bh] = box;
      let x = this.rtl ? l + bw : l, y = t; // marker on the reading-start top corner of the element
      if (bw === 0 && bh === 0) { x = l; y = t; }
      const r2 = (v) => Math.round(v * 100) / 100;
      const m = { letter, x: r2(Math.min(Math.max(x, 2.5), 97.5)), y: r2(Math.min(Math.max(y, 3.5), 96.5)) };
      if (c.highlight !== false && bw > 0 && bh > 0) {
        const px = 0.6, py = 0.6 * w / h;
        m.hl = { l: r2(Math.max(l - px, 0)), t: r2(Math.max(t - py, 0)), w: r2(Math.min(bw + 2 * px, 100)), h: r2(Math.min(bh + 2 * py, 100)) };
      }
      markers.push(m);
      if (c.label) legend.push({ letter, html: mdInline(c.label) });
      if (c.key) keymap[c.key] = letter;
    });
    // how big will 14px UI text print? content width 174mm, image max height 112mm (150 tall, 70 small)
    const maxH = { tall: 150, small: 70 }[spec.size || ''] || 112;
    const mmPerPx = Math.min(174 / w, maxH / h);
    const uiPt = 14 * mmPerPx / 0.3528;
    if (uiPt < 6.5 && !spec.overview) warn(`shot '${spec.id || spec.image}' prints small (screen text ≈ ${uiPt.toFixed(1)}pt): clip it to the area the step is about, or use it as a task overview_shot`);
    let frame = spec.frame || (spec.id && !meta.clipped ? 'browser' : 'plain'); // full screens get the browser bar
    if (meta.device === 'phone' && !spec.frame) frame = 'phone';
    return [{
      src, frame, url: spec.url || meta.display_url || meta.url || '', markers, legend, caption: spec.caption, size: spec.size || '',
      long_labels: (spec.callouts || []).some((c) => (c.label || '').length > 70),
    }, keymap];
  }

  boxesOf(obj) {
    const out = [];
    for (const kind of ['tip', 'warning', 'danger', 'note']) {
      const v = obj[kind] || obj[kind + 's'];
      if (!v) continue;
      for (const item of Array.isArray(v) ? v : [v]) {
        if (item && typeof item === 'object') out.push({ kind, title: item.title, html: md(item.text) });
        else out.push({ kind, title: null, html: md(item) });
      }
    }
    return out;
  }

  prepare() {
    const g = this.g;
    const meta = { ...(g.meta || {}) };
    meta.date ??= new Date().toISOString().slice(0, 10);
    meta.client_name ??= meta.product_name || '';
    meta.product_name ??= meta.client_name || '';
    meta.title ??= this.L.user_guide;
    const brand = { ...(g.brand || {}) };
    brand.primary ||= '#2f5bea';
    brand.ink = brand.ink || inkFor(brand.primary);
    if (brand.logo) brand.logo = this.copyImg(brand.logo);

    const parts = [], rolesPresent = [], roleReading = Object.fromEntries(ROLES.map((r) => [r, []]));
    let chCounter = 0;
    const rawParts = g.parts || [{ title: '', chapters: g.chapters || [] }];
    rawParts.forEach((p, pi0) => {
      const pi = pi0 + 1;
      const pAud = (p.audience || []).filter((r) => ROLES.includes(r));
      const part = { num: String(pi).padStart(2, '0'), title: p.title || '', intro: p.intro ? mdInline(p.intro) : '', audience: pAud, anchor: `part-${pi}`, chapters: [], show_divider: p.divider ?? rawParts.length > 1 };
      for (const c of p.chapters || []) {
        chCounter++;
        const cid = c.id || `c${chCounter}`;
        const ch = { num: chCounter, title: c.title, anchor: `ch-${cid}`, intro: c.intro ? mdInline(c.intro) : '', tasks: [], blocks: this.boxesOf(c) };
        (c.tasks || []).forEach((t, ti0) => {
          const tid = t.id || `${cid}-t${ti0 + 1}`;
          const roles = (t.roles || c.roles || (pAud.length ? pAud : null) || ['staff']).filter((r) => ROLES.includes(r));
          for (const r of roles) if (!rolesPresent.includes(r)) rolesPresent.push(r);
          const task = {
            title: t.title, anchor: `task-${tid}`, roles, goal: t.goal ? mdInline(t.goal) : '', time: t.time,
            before: (t.before || []).map(mdInline), result: t.result ? md(t.result) : '', boxes: this.boxesOf(t), new_page: t.new_page || false, steps: [],
          };
          let ov = t.overview_shot;
          if (typeof ov === 'string') ov = { id: ov };
          if (ov) ov = { ...ov, overview: true };
          task.overview = ov ? this.figure(ov)[0] : null;
          for (let s of t.steps || []) {
            if (typeof s === 'string') s = { text: s };
            const [fig, keymap] = s.shot ? this.figure(s.shot) : [null, {}];
            task.steps.push({ html: md(s.text, keymap), figure: fig, sub: (s.sub || []).map(mdInline), boxes: this.boxesOf(s) });
          }
          if (!task.steps.length) warn(`task '${t.title}' has no steps`);
          ch.tasks.push(task);
        });
        part.chapters.push(ch);
        for (const r of ROLES) {
          if (ch.tasks.some((tk) => tk.roles.includes(r))) {
            const label = rawParts.length > 1 ? part.title : ch.title;
            if (label && !roleReading[r].includes(label)) roleReading[r].push(label);
          }
        }
      }
      parts.push(part);
    });
    rolesPresent.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));

    const rows = (key, fields) => (g[key] || []).map((r) => (r.group ? { group: r.group } : Object.fromEntries(fields.map((f) => [f, mdInline(r[f] || '')]))));
    const quick = rows('quick_reference', ['action', 'how']);
    const faq = (g.faq || []).map((q) => ({ q: q.q, a: md(q.a) }));
    const trouble = rows('troubleshooting', ['problem', 'cause', 'fix']);
    const glossary = (g.glossary || []).map((x) => ({ term: x.term, definition: mdInline(x.definition) }));
    const extras = [];
    if (quick.length) extras.push({ anchor: 'ref-quick', title: this.L.quick_reference });
    if (faq.length) extras.push({ anchor: 'ref-faq', title: this.L.faq });
    if (trouble.length) extras.push({ anchor: 'ref-trouble', title: this.L.troubleshooting });
    if (glossary.length) extras.push({ anchor: 'ref-glossary', title: this.L.glossary });
    for (const r of rolesPresent) roleReading[r].push(...extras.filter((x) => ['ref-quick', 'ref-faq', 'ref-trouble'].includes(x.anchor)).map((x) => x.title).slice(0, 2));

    let intro = g.intro || {};
    if (typeof intro === 'string') intro = { text: intro };
    const support = { ...(g.support || {}) };
    if (support.text) support.html = mdInline(support.text);
    const nTasks = parts.reduce((n, p) => n + p.chapters.reduce((m, c) => m + c.tasks.length, 0), 0);
    return {
      lang: this.lang, rtl: this.rtl, L: this.L, letters: this.letters, meta, brand,
      intro: { html: intro.text ? mdInline(intro.text) : '', cards: (intro.cards || []).map((c) => ({ title: c.title, html: mdInline(c.text) })) },
      parts, roles_present: rolesPresent.length ? rolesPresent : ['staff'], role_reading: roleReading,
      quick_reference: quick, faq, troubleshooting: trouble, glossary, extras, support,
      toc_tasks: g.toc_tasks ?? nTasks <= 60, compact: g.layout === 'compact',
    };
  }

  renderHtml() {
    fs.rmSync(this.build, { recursive: true, force: true });
    fs.mkdirSync(this.build, { recursive: true });
    fs.cpSync(path.join(ASSETS, 'fonts'), path.join(this.build, 'fonts'), { recursive: true });
    // Paged.js re-inserts every stylesheet into the page and Chrome then never loads fonts.css's file:// fonts:
    // embed the font files in the stylesheet itself
    const fontsCss = path.join(this.build, 'fonts', 'fonts.css');
    fs.writeFileSync(fontsCss, fs.readFileSync(fontsCss, 'utf8').replace(/url\((['"]?)(?![a-z]+:)([^'")]+)\1\)/g,
      (m, q, f) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(this.build, 'fonts', f)).toString('base64')}")`));
    fs.copyFileSync(path.join(ASSETS, 'guide.css'), path.join(this.build, 'guide.css'));
    fs.copyFileSync(path.join(ASSETS, 'paged.polyfill.min.js'), path.join(this.build, 'paged.polyfill.min.js'));
    const extra = this.g.brand?.extra_css;
    if (extra) fs.appendFileSync(path.join(this.build, 'guide.css'), `\n/* guide-specific */\n${extra}\n`);
    const d = this.prepare();
    // plain-text fields are escaped here; *html fields are already safe
    for (const p of d.parts) { p.title = esc(p.title); for (const c of p.chapters) { c.title = esc(c.title); for (const t of c.tasks) t.title = esc(t.title); } }
    d.css_product = String(d.meta.product_name || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    for (const k of ['title', 'subtitle', 'client_name', 'product_name', 'version', 'date', 'confidential']) if (d.meta[k]) d.meta[k] = esc(d.meta[k]);
    for (const q of d.faq) q.q = esc(q.q);
    for (const x of d.glossary) x.term = esc(x.term);
    for (const c of d.support.contacts || []) { c.label = esc(c.label); c.value = esc(c.value); }
    const out = template(d);
    const file = path.join(this.build, `guide.${this.lang}.html`);
    fs.writeFileSync(file, out);
    return [file, d];
  }
}

/* ---------- the template (assets/template.html.j2, same markup) ---------- */
function icon(name) {
  const svg = (inner, extra = 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"', style = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ${extra}${style ? ` style="${style}"` : ''}>${inner}</svg>`;
  switch (name) {
    case 'tip': return svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>', undefined, 'color:var(--tip)');
    case 'warning': return svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>', undefined, 'color:var(--warn)');
    case 'danger': return svg('<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/><path d="M15 9l-6 6M9 9l6 6"/>', undefined, 'color:var(--danger)');
    case 'note': return svg('<circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/>', undefined, 'color:var(--note)');
    case 'result': return svg('<circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 2.7 2.7L16.2 9.5"/>', 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"', 'color:var(--tip)');
    case 'staff': return svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', 'stroke-width="2.2" stroke-linecap="round"');
    case 'manager': return svg('<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>', 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"');
    case 'owner': return svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"');
    case 'all': return svg('<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M2.5 20c1-3.4 3.6-5.2 6.5-5.2s5.5 1.8 6.5 5.2M15.5 14.6c2.6-.3 5 1.1 6 4.4"/>', 'stroke-width="2.2" stroke-linecap="round"');
    case 'clock': return svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 'stroke-width="2.2" stroke-linecap="round"');
    default: return '';
  }
}

function template(d) {
  const { L, rtl, brand, meta, intro } = d;
  const pattern = () => {
    let c = '';
    for (let r = 14; r < 330; r += 16) c += `<circle cx="${rtl ? -4 : 214}" cy="-6" r="${r}"/>`;
    return `<svg class="pattern" viewBox="0 0 210 297" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="0.45">${c}</g></svg>`;
  };
  const chip = (role) => `<span class="chip ${role}">${icon(role)}${L['role_' + role]}</span>`;
  const box = (kind, html, title) => `<div class="box ${kind}"><div class="ico">${icon(kind)}</div><div class="body"><b class="t">${title || L[kind]}</b>${html}</div></div>`;
  const figure = (f) => `
<figure class="shot ${f.size} ${f.frame === 'phone' ? 'phone' : ''}">
  <div class="frame ${f.frame !== 'browser' ? 'plain' : ''}">${f.frame === 'browser' ? `<div class="chrome"><i></i><i></i><i></i><span class="url">${esc(f.url)}</span></div>` : ''}
    <div class="canvas">
      <img src="${f.src}" alt="">${f.markers.map((m) => (m.hl ? `<div class="hl" style="left:${m.hl.l}%;top:${m.hl.t}%;width:${m.hl.w}%;height:${m.hl.h}%"></div>` : '')).join('')}${f.markers.map((m) => `<div class="mk" style="left:${m.x}%;top:${m.y}%">${m.letter}</div>`).join('')}
    </div>
  </div>${f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : ''}${f.legend.length ? `
  <ul class="callout-legend ${f.legend.length < 3 || f.long_labels ? 'single' : ''}">${f.legend.map((l) => `<li><span class="m-inline">${l.letter}</span><span>${l.html}</span></li>`).join('')}</ul>` : ''}
</figure>`;
  const logo = brand.logo ? `<img src="${brand.logo}" alt="">` : `<span class="wordmark">${meta.client_name}</span>`;
  const s = [];
  s.push(`<!doctype html>
<html lang="${d.lang}" dir="${rtl ? 'rtl' : 'ltr'}" class="${d.compact ? 'compact' : ''}" style="--brand: ${brand.primary}; --brand-ink: ${brand.ink};">
<head>
<meta charset="utf-8">
<title>${meta.title}</title>
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="guide.css">
<style>
  @page {
    @top-${rtl ? 'right' : 'left'} { content: "${d.css_product}"; font-size: 8pt; color: #8a91a0; font-weight: 600; vertical-align: bottom; padding-bottom: 4mm; }
    @top-${rtl ? 'left' : 'right'} { content: string(chapter); font-size: 8pt; color: #8a91a0; vertical-align: bottom; padding-bottom: 4mm; }
    @bottom-center { content: "${L.page} " counter(page) " ${L.of} " counter(pages); font-size: 8pt; color: #8a91a0; vertical-align: top; padding-top: 4mm; }
  }
</style>
<script>
  window.PagedConfig = { auto: true, after: () => { window.__pagedDone = true; } };
</script>
<script src="paged.polyfill.min.js"></script>
</head>
<body>
<section class="cover">
  <div class="band">
    ${pattern()}
    <div class="logo-card">${logo}</div>
    <div class="titles">
      <div class="kicker">${L.user_guide}</div>
      <h1>${meta.title}</h1>${meta.subtitle ? `<div class="subtitle">${meta.subtitle}</div>` : ''}
    </div>
  </div>
  <div class="lower">
    <div class="audience">${d.roles_present.map(chip).join('')}</div>
    <div class="meta">
      <div>${L.system}<b>${meta.product_name}</b></div>
      <div>${L.version}<b>${meta.version || '1.0'}</b></div>
      <div>${L.date}<b>${meta.date}</b></div>
    </div>
  </div>
  <div class="foot"><span>${meta.client_name}</span><span>${meta.confidential || ''}</span></div>
</section>`);

  if (!d.compact) {
    s.push(`
<section class="howto front">
  <div class="section-head">
    <div class="kicker">${L.start_here}</div>
    <h2>${L.how_to_use}</h2>${intro.html ? `<div class="lead">${intro.html}</div>` : ''}
  </div>${intro.cards.length ? `
  <div class="cards">${intro.cards.map((c) => `<div class="card"><h4>${esc(c.title)}</h4><p>${c.html}</p></div>`).join('')}</div>` : ''}
  <h4 style="font-size:11pt;margin:2mm 0 1mm">${L.who_reads_what}</h4>
  <table class="roles">
    <thead><tr><th>${L.reader}</th><th>${L.read_these}</th></tr></thead>
    <tbody>${d.roles_present.map((r) => `<tr><td style="width:34%">${chip(r)}</td><td>${d.role_reading[r].map(esc).join(' · ')}</td></tr>`).join('')}</tbody>
  </table>
  <h4 style="font-size:11pt;margin:9mm 0 1mm">${L.symbols}</h4>
  <div class="legend">
    <div class="row"><span class="sample"><span class="ui">${L.sample_button}</span></span><span>${L.legend_ui}</span></div>
    <div class="row"><span class="sample"><span class="m-inline">${d.letters[0]}</span></span><span>${L.legend_marker}</span></div>
    <div class="row"><span class="sample" style="width:5mm">${icon('tip')}</span><span>${L.legend_tip}</span></div>
    <div class="row"><span class="sample" style="width:5mm">${icon('warning')}</span><span>${L.legend_warning}</span></div>
    <div class="row"><span class="sample" style="width:5mm">${icon('note')}</span><span>${L.legend_note}</span></div>
    <div class="row"><span class="sample" style="width:5mm">${icon('result')}</span><span>${L.legend_result}</span></div>
  </div>
</section>`);
  }

  s.push(`
<nav class="toc front">
  <div class="section-head"><h2>${L.contents}</h2></div>${d.parts.map((part) => `
  <div class="toc-part">${d.parts.length > 1 ? `<div class="part-row"><span class="num">${part.num}</span><span>${part.title}</span></div>` : ''}
    <ol>${part.chapters.map((ch) => `
      <li class="toc-chapter"><a href="#${ch.anchor}"><span class="t">${ch.title}</span><span class="dots"></span></a>${d.toc_tasks ? `
        <ol>${ch.tasks.map((t) => `<li class="toc-task"><a href="#${t.anchor}"><span class="t">${t.title}</span><span class="dots"></span></a></li>`).join('')}</ol>` : ''}
      </li>`).join('')}
    </ol>
  </div>`).join('')}${d.extras.length ? `
  <div class="toc-part toc-extra">
    <div class="part-row"><span class="num">+</span><span>${L.reference}</span></div>
    <ol>${d.extras.map((x) => `<li class="toc-chapter"><a href="#${x.anchor}"><span class="t">${x.title}</span><span class="dots"></span></a></li>`).join('')}</ol>
  </div>` : ''}
</nav>`);

  for (const part of d.parts) {
    if (part.show_divider && !d.compact) {
      s.push(`
<section class="divider" id="${part.anchor}">
  ${pattern()}
  <div class="inner">
    <div class="big">${part.num}</div>
    <div class="label">${L.part}</div>
    <h2>${part.title}</h2>${part.intro ? `<div class="intro">${part.intro}</div>` : ''}
    <div class="audience">${part.audience.map(chip).join('')}</div>
  </div>
  <div class="contents">${part.chapters.map((ch, i) => `<div>${i + 1}. ${ch.title}</div>`).join('')}</div>
</section>`);
    }
    part.chapters.forEach((ch, ci) => {
      const brk = !d.compact || (ci === 0 && part.num === '01');
      s.push(`
<section class="chapter ${brk ? 'brk' : ''}" id="${ch.anchor}">
  <header>
    <div class="kicker">${L.chapter} ${ch.num}</div>
    <h2 class="chapter-title">${ch.title}</h2>${ch.intro ? `<div class="intro">${ch.intro}</div>` : ''}${ch.tasks.length > 1 ? `
    <div class="in-this">${ch.tasks.map((t) => `<a href="#${t.anchor}">${t.title}</a>`).join('')}</div>` : ''}
  </header>
  ${ch.blocks.map((b) => box(b.kind, b.html, b.title)).join('')}${ch.tasks.map((t) => `
  <article class="task ${t.new_page ? 'newpage' : ''}" id="${t.anchor}">
    <div class="task-head">
      <h3>${t.title}</h3>
      <div class="meta-row">${t.roles.map(chip).join('')}${t.time ? `<span class="chip time">${icon('clock')}${esc(t.time)}</span>` : ''}</div>${t.goal ? `
      <p class="goal">${t.goal}</p>` : ''}
    </div>${t.before.length ? `
    <div class="prereq"><div class="h">${L.before_you_start}</div><ul>${t.before.map((x) => `<li><span>${x}</span></li>`).join('')}</ul></div>` : ''}${t.overview ? figure(t.overview) : ''}
    <ol class="steps">${t.steps.map((st) => `
      <li>
        <div class="text">${st.html}</div>${st.sub.length ? `<ul class="sub">${st.sub.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}${st.boxes.map((b) => box(b.kind, b.html, b.title)).join('')}${st.figure ? figure(st.figure) : ''}
      </li>`).join('')}
    </ol>${t.result ? box('result', t.result, L.result) : ''}${t.boxes.map((b) => box(b.kind, b.html, b.title)).join('')}
  </article>`).join('')}
</section>`);
    });
  }

  if (d.quick_reference.length) {
    s.push(`
<section class="refpage brk" id="ref-quick">
  <div class="section-head"><div class="kicker">${L.reference}</div><h2 class="chapter-title">${L.quick_reference}</h2><div class="lead">${L.quick_reference_lead}</div></div>
  <table class="ref">
    <thead><tr><th>${L.i_want_to}</th><th>${L.do_this}</th></tr></thead>
    <tbody>${d.quick_reference.map((row) => (row.group ? `<tr class="group"><td colspan="2">${esc(row.group)}</td></tr>` : `<tr><td>${row.action}</td><td>${row.how}</td></tr>`)).join('')}</tbody>
  </table>
</section>`);
  }
  if (d.faq.length) {
    s.push(`
<section class="refpage faq ${!d.compact ? 'brk' : ''}" id="ref-faq">
  <div class="section-head"><div class="kicker">${L.reference}</div><h2 class="chapter-title">${L.faq}</h2></div>${d.faq.map((q) => `
  <div class="q"><h4><span class="qmark">${L.q_mark}</span><span>${q.q}</span></h4><div class="a">${q.a}</div></div>`).join('')}
</section>`);
  }
  if (d.troubleshooting.length) {
    s.push(`
<section class="refpage ${!d.compact ? 'brk' : ''}" id="ref-trouble">
  <div class="section-head"><div class="kicker">${L.reference}</div><h2 class="chapter-title">${L.troubleshooting}</h2><div class="lead">${L.troubleshooting_lead}</div></div>
  <table class="ref trouble">
    <thead><tr><th>${L.problem}</th><th>${L.likely_cause}</th><th>${L.fix}</th></tr></thead>
    <tbody>${d.troubleshooting.map((r) => (r.group ? '' : `<tr><td>${r.problem}</td><td>${r.cause}</td><td>${r.fix}</td></tr>`)).join('')}</tbody>
  </table>
</section>`);
  }
  if (d.glossary.length) {
    s.push(`
<section class="refpage ${!d.compact ? 'brk' : ''}" id="ref-glossary">
  <div class="section-head"><div class="kicker">${L.reference}</div><h2 class="chapter-title">${L.glossary}</h2></div>
  <dl class="glossary">${d.glossary.map((g) => `<div><dt>${g.term}</dt><dd>${g.definition}</dd></div>`).join('')}</dl>
</section>`);
  }
  const sup = d.support;
  const contacts = sup.contacts && sup.contacts.length ? `<div class="contacts">${sup.contacts.map((c) => `<div class="contact"><div class="k">${c.label}</div><div class="v">${c.value}</div></div>`).join('')}</div>` : '';
  if (d.compact) {
    s.push(`
<section class="support-inline">
  <h2>${esc(sup.title || L.need_help)}</h2>
  <p>${sup.html || L.need_help_lead}</p>
  ${contacts}
</section>`);
  } else {
    s.push(`
<section class="back">
  ${pattern()}
  <div class="inner">
    <h2>${esc(sup.title || L.need_help)}</h2>
    <div class="lead">${sup.html || L.need_help_lead}</div>
    ${contacts}
  </div>
  <div class="logo-card">${logo}</div>
  <div class="ver">${meta.product_name} · ${L.version} ${meta.version || '1.0'} · ${meta.date}</div>
</section>`);
  }
  s.push('\n</body>\n</html>\n');
  return s.join('');
}

/* ---------- PDF + previews (Chrome over CDP) ---------- */
async function renderPdf(htmlPath, pdfPath, previewDir) {
  const PORT = 9341;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-pdf-'));
  // Paged.js re-reads the stylesheets with XHR, which Chrome blocks on file:// unless allowed
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let t;
  for (let i = 0; i < 50 && !t; i++) { try { t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.binaryType = 'arraybuffer';
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const wait = new Map(); const msgs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { wait.get(m.id)?.(m); wait.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') msgs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) msgs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1400, deviceScaleFactor: previewDir ? 2 : 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(htmlPath).href });
  const t0 = Date.now();
  while (!(await run('window.__pagedDone === true'))) {
    if (Date.now() - t0 > 180000) { chrome.kill(); throw new Error(`Paged.js did not finish. Browser messages:\n  ${msgs.slice(0, 15).join('\n  ')}`); }
    await sleep(300);
  }
  await run('document.fonts.ready.then(() => 1)');
  const report = await run(`(() => {
    const pages = document.querySelectorAll('.pagedjs_page').length;
    const broken = [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src'));
    const overflow = [];
    document.querySelectorAll('.pagedjs_area').forEach((a, i) => {
      a.querySelectorAll('figure, table, .box, h2, h3, pre, .callout-legend').forEach(el => {
        const r = el.getBoundingClientRect(), ar = a.getBoundingClientRect();
        if (r.right > ar.right + 2 || r.left < ar.left - 2) overflow.push({ page: i + 1, el: el.className || el.tagName });
      });
    });
    const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight);
    return { pages, broken, overflow, fonts_loaded: fonts.length };
  })()`);
  report.console = msgs.filter((m) => m && !m.includes('favicon')).slice(0, 10);
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, generateTaggedPDF: true, generateDocumentOutline: true, transferMode: 'ReturnAsBase64' });
  if (!pdf.result) throw new Error(`printToPDF failed: ${JSON.stringify(pdf.error)}`);
  fs.writeFileSync(pdfPath, Buffer.from(pdf.result.data, 'base64'));

  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    for (const f of fs.readdirSync(previewDir)) if (/^page-\d+\.png$/.test(f)) fs.rmSync(path.join(previewDir, f));
    const rects = await run(`[...document.querySelectorAll('.pagedjs_page')].map(p => { const r = p.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.width, r.height]; })`);
    const files = [];
    for (const [i, [x, y, w, h]] of rects.entries()) {
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 1 } });
      const f = path.join(previewDir, `page-${String(i + 1).padStart(3, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(s.result.data, 'base64'));
      files.push(f);
    }
    contactSheet(files, path.join(previewDir, 'overview.png'));
  }
  ws.close(); chrome.kill();
  return report;
}

function contactSheet(files, out, cols = 6, thumb = 300) {
  if (!files.length) return;
  const rows = Math.ceil(files.length / cols);
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e2e5ec;display:grid;grid-template-columns:repeat(${cols},${thumb}px);gap:16px;padding:16px;font:12px sans-serif;color:#3c4250}
img{width:${thumb}px;display:block;box-shadow:0 1px 4px rgba(0,0,0,.2)}div span{display:block;padding-top:3px}</style>
${files.map((f, i) => `<div><img src="${pathToFileURL(f).href}"><span>${i + 1}</span></div>`).join('')}`;
  const tmp = `${out}.html`;
  fs.writeFileSync(tmp, html);
  execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', `--screenshot=${out}`,
    `--window-size=${cols * (thumb + 16) + 16},${rows * (Math.round(thumb * 1.414) + 40) + 16}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  fs.rmSync(tmp);
}

/* ---------- main ---------- */
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const guide = argv[0];
const out = path.resolve(opt('--out'));
fs.mkdirSync(path.dirname(out), { recursive: true });
const buildDir = opt('--build-dir') || path.join(path.dirname(out), `.build-${path.basename(out, '.pdf')}`);
const b = new Builder(guide, opt('--shots'), buildDir);
const [htmlPath] = b.renderHtml();
console.log(`HTML: ${htmlPath}`);
if (!argv.includes('--html-only')) {
  const preview = opt('--preview') && path.resolve(opt('--preview'));
  const rep = await renderPdf(htmlPath, out, preview);
  console.log(`PDF:  ${out}  (${rep.pages} pages, ${Math.round(fs.statSync(out).size / 1024)} KB, ${rep.fonts_loaded} font faces loaded)`);
  if (preview) console.log(`Previews: ${preview}/page-NNN.png and ${preview}/overview.png`);
  for (const x of rep.broken) warn(`image failed to load: ${x}`);
  for (const x of rep.overflow.slice(0, 15)) warn(`element wider than the page on page ${x.page}: ${x.el}`);
  for (const x of rep.console) warn(`browser: ${x}`);
}
if (WARN.length) { console.log(`\n${WARN.length} warning(s):`); for (const w of WARN) console.log('  - ' + w); }
if (argv.includes('--strict') && WARN.length) process.exit(1);
