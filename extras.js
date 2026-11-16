/* PuzzleX — the small things every page shares, plus a few home-page sections:
     the back-to-top piece (bottom right): its outline draws itself as you read, it turns lime at the end,
       and a press sends it flying up while the page follows
     Shater, the assistant in the corner (it takes the WhatsApp button's place; the server still adds that button)
     the home page's service request picker and partner logos strip, and the rivers of client reviews (home and feedback page)
   Uses T(), SITE, ROOT, REDUCED, EN, piecePath() and playClick() from main.js, jigsawD() and TAB_DEPTH from pages.js / main.js. */

/* ---------- back to top: a jigsaw piece with its knob pointing up ---------- */
(function initToTop() {
  const PAD = Math.ceil(100 * TAB_DEPTH + 4);
  const d = jigsawD({ t: 1, b: 0, l: 0, r: 0 }, 100, 100);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'to-top';
  btn.setAttribute('aria-label', T('العودة إلى أعلى الصفحة', 'Back to top'));
  btn.title = T('إلى الأعلى', 'Back to top');
  btn.innerHTML = `<svg viewBox="${-6 - PAD / 2} ${-PAD - 6} ${112 + PAD} ${112 + PAD}" aria-hidden="true">
    <path class="tt-base" d="${d}"/><path class="tt-fill" d="${d}"/><path class="tt-ring" d="${d}" pathLength="100"/>
    <path class="tt-arrow" d="M50 70V32M34 47l16-16 16 16"/></svg><span class="tt-pct" aria-hidden="true"></span>`;
  document.body.append(btn);
  const ring = btn.querySelector('.tt-ring');
  const pct = btn.querySelector('.tt-pct');

  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    ring.style.strokeDashoffset = String(100 - p * 100);
    pct.textContent = `${Math.round(p * 100)}%`;
    btn.classList.toggle('is-shown', scrollY > Math.min(700, innerHeight * 0.9));
    btn.classList.toggle('is-done', p > 0.985);
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();

  btn.addEventListener('click', () => {
    if (btn.classList.contains('is-flying')) return;
    const go = () => {
      if (typeof lenis !== 'undefined' && lenis) lenis.scrollTo(0, { duration: REDUCED ? 0 : 1.4, force: true });
      else scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    };
    if (REDUCED) { go(); return; }
    // the piece lifts off and the page follows it up; it drops back into its corner once we're there
    btn.classList.add('is-flying');
    setTimeout(go, 120);
    setTimeout(() => btn.classList.remove('is-flying'), 1500);
  });
})();

/* ---------- Shater (شاطر): the site's assistant, in the corner the WhatsApp button had ----------
   A tilted lime puzzle piece; after a few seconds a small "Got a question?" pops out of it like a notification.
   A click opens the chat out of the piece itself (it grows from the piece, the way an app opens from the Dock) and
   Shater types his greeting. Questions: a few a visit (the number comes from the server, which counts every one sent),
   answers from /api/assistant (lib/assistant.js → OpenRouter). While it waits three pieces lock together; the answer
   pops in and types itself out. WhatsApp is the green round button in the header. The chat lives in sessionStorage,
   so it follows the visitor between pages. Without scripts the plain WhatsApp button stays (the server adds it). */
// the server adds the WhatsApp button after the page's scripts, so wait for the whole document
document.addEventListener('DOMContentLoaded', function initShater() {
  const body = document.body;
  if (!body.dataset.shater) return; // pages drawn without the server's settings
  const ON = body.dataset.shater === 'on';
  const LIMIT = Math.max(1, Number(body.dataset.shaterQ) || 3);
  const wa = document.querySelector('.wa-fab');
  const waHref = wa ? wa.href : '';
  document.documentElement.classList.add('has-shater');

  const KEY = 'puzzlex-shater-3'; // a new name for a new shape: older saved chats are left behind
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const st = Object.assign({ msgs: [], history: [], left: LIMIT, open: false, pinged: false, seen: false }, load() || {});
  st.left = Math.min(st.left, LIMIT);
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode: this page only */ } };

  // the mark: a lime puzzle piece with the brand's four-point star
  const STAR = '<path d="M50 18c3 18 14 29 32 32-18 3-29 14-32 32-3-18-14-29-32-32 18-3 29-14 32-32z"/>';
  const PIECE = jigsawD({ t: 1, r: 1, b: 0, l: 0 }, 100, 100);
  const PAD = Math.ceil(100 * TAB_DEPTH + 4);
  const VB = `-6 ${-PAD - 6} ${112 + PAD} ${112 + PAD}`;
  const logo = (cls) => `<svg class="${cls}" viewBox="${VB}" aria-hidden="true"><path class="sh-piece" d="${PIECE}"/><g class="sh-star">${STAR}</g></svg>`;
  const WA_SVG = wa && wa.querySelector('svg') ? wa.querySelector('svg').outerHTML : '';
  const STATUS = {
    idle: ON ? T('متصل الآن', 'Online') : T('قيد التجهيز', 'Getting ready'),
    thinking: T('عم يفكّر…', 'Thinking…'),
    typing: T('عم يكتب…', 'Typing…'),
  };

  // the launcher: only the piece, tilted, with a "?" badge until the chat is first opened
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'sh-fab';
  fab.setAttribute('aria-controls', 'sh-panel');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', T('عندك سؤال؟ اسأل شاطر، مساعد بزل إكس', 'Got a question? Ask Shater, the PuzzleX assistant'));
  fab.innerHTML = `${logo('sh-fab-logo')}<span class="sh-badge" aria-hidden="true">?</span>`;
  // the notification that pops out of the piece
  const ping = document.createElement('button');
  ping.type = 'button';
  ping.className = 'sh-ping';
  ping.setAttribute('aria-hidden', 'true');
  ping.tabIndex = -1;
  ping.innerHTML = `<span class="sh-ping-q">?</span><span>${T('عندك سؤال؟', 'Got a question?')}</span>`;

  // the chat
  const panel = document.createElement('section');
  panel.className = 'sh-panel';
  panel.id = 'sh-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', T('شاطر، مساعد بزل إكس ميديا', 'Shater, the PuzzleX Media assistant'));
  panel.innerHTML = `
    <header class="sh-head">
      <span class="sh-avatar-wrap">${logo('sh-avatar')}</span>
      <p class="sh-who"><b>${T('شاطر', 'Shater')}</b><small class="sh-status"><i></i><span>${STATUS.idle}</span></small></p>
      ${waHref ? `<a class="sh-wa" href="${waHref}" target="_blank" rel="noopener" data-contact="whatsapp" aria-label="${T('كلّم فريقنا على واتساب', 'Message our team on WhatsApp')}" title="${T('كلّم فريقنا على واتساب', 'Message our team on WhatsApp')}">${WA_SVG}</a>` : ''}
      <button type="button" class="sh-close" aria-label="${T('إغلاق', 'Close')}" title="${T('إغلاق', 'Close')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="sh-log" role="log" aria-live="polite"></div>
    <footer class="sh-foot">
      <form class="sh-form" novalidate>
        <label class="sr-only" for="sh-q">${T('سؤالك لشاطر', 'Your question for Shater')}</label>
        <textarea id="sh-q" rows="1" maxlength="500" placeholder="${T('اكتب سؤالك…', 'Type your question…')}" enterkeyhint="send"></textarea>
        <button type="submit" class="sh-send" aria-label="${T('إرسال', 'Send')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
      </form>
      <p class="sh-left"><span class="sh-dots" aria-hidden="true"></span><span class="sh-left-text"></span></p>
    </footer>`;
  body.append(ping, fab, panel);

  const log = panel.querySelector('.sh-log');
  const form = panel.querySelector('.sh-form');
  const input = panel.querySelector('textarea');
  const send = panel.querySelector('.sh-send');
  const statusText = panel.querySelector('.sh-status span');
  const dots = panel.querySelector('.sh-dots');
  const leftText = panel.querySelector('.sh-left-text');
  const setStatus = (k) => { statusText.textContent = STATUS[k]; panel.dataset.state = k; };
  const toEnd = () => { log.scrollTop = log.scrollHeight; };

  // an answer is plain text: links to this site or to WhatsApp become links, nothing else is ever markup.
  // It comes back as a list of pieces, so the typing can show it word by word and still end with real links.
  const pieces = (text) => {
    const out = [];
    // with or without https:// (models often write a bare "wa.me/…" or "puzzlexmedia.com/…")
    const re = /(?:https?:\/\/)?(?:www\.)?(?:puzzlexmedia\.com|wa\.me)(?:\/[^\s<>()"'،]*)?/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      const raw = m[0].replace(/[.,؛:!?]+$/, '');
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      out.push({ url: /^https?:/.test(raw) ? raw : `https://${raw.startsWith('wa.me') ? '' : 'www.'}${raw.replace(/^www\./, '')}` });
      last = m.index + raw.length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  };
  // a link in an answer is a small button: WhatsApp with its own icon and colour, a page of the site with its name
  const PAGE_NAMES = {
    '': ['الصفحة الرئيسية', 'Home'], 'about.html': ['من نحن', 'About us'], 'services.html': ['خدماتنا', 'Our services'],
    'work.html': ['أعمالنا', 'Our work'], 'project.html': ['المشروع', 'The project'], 'feedback.html': ['آراء العملاء', 'Client feedback'],
    'contact.html': ['تواصل معنا', 'Contact us'], 'blog.html': ['المدونة', 'Blog'], 'article.html': ['المقال', 'The article'],
    'careers.html': ['انضم لفريقنا', 'Join our team'], 'team.html': ['فريقنا', 'Our team'], 'profile.html': ['الملف التعريفي', 'Company profile'],
    'privacy.html': ['سياسة الخصوصية', 'Privacy policy'],
  };
  const LINK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>';
  const linkOf = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.className = 'sh-link';
    if (/wa\.me/.test(url)) {
      a.classList.add('is-wa');
      a.target = '_blank';
      a.rel = 'noopener';
      a.dataset.contact = 'whatsapp';
      a.innerHTML = `${WA_SVG || LINK_SVG}<span>${T('راسلنا على واتساب', 'Message us on WhatsApp')}</span>`;
      return a;
    }
    let page = '';
    try { page = new URL(url).pathname.replace(/^\/(en\/)?/, '').replace(/\/$/, ''); } catch (e) { /* shown as is */ }
    // the visitor stays in their language: an English page's link to an Arabic page goes to its English twin, and back
    try { const u = new URL(url); u.pathname = `/${EN ? 'en/' : ''}${page}`; a.href = u.href; } catch (e) { /* keep it */ }
    const name = PAGE_NAMES[page] ? PAGE_NAMES[page][EN ? 1 : 0] : T('افتح الصفحة', 'Open the page');
    a.innerHTML = `${LINK_SVG}<span>${name}</span>`;
    return a;
  };

  const row = (who, extra) => {
    const el = document.createElement('div');
    el.className = `sh-msg sh-${who}${extra ? ` ${extra}` : ''}`;
    el.setAttribute('dir', 'auto');
    log.append(el);
    return el;
  };
  // at once (a restored conversation, the visitor's own words)
  const put = (who, text, extra) => {
    const el = row(who, extra);
    pieces(text).forEach((p) => el.append(p.url ? linkOf(p.url) : p.text));
    toEnd();
    return el;
  };
  // typed out: the bubble pops in, then the words arrive one after another with a caret at the end
  const type = (text, extra, speed = 1) => new Promise((resolve) => {
    const el = row('bot', `${extra || ''} is-new`.trim());
    if (REDUCED) { pieces(text).forEach((p) => el.append(p.url ? linkOf(p.url) : p.text)); toEnd(); resolve(el); return; }
    el.classList.add('is-typing-out');
    setStatus('typing');
    const caret = document.createElement('i');
    caret.className = 'sh-caret';
    el.append(caret);
    // one step a word (the spaces between come with no pause); links arrive whole
    const steps = [];
    pieces(text).forEach((p) => {
      if (p.url) steps.push({ run: () => caret.before(linkOf(p.url)), pause: true });
      else p.text.split(/(\s+)/).filter(Boolean).forEach((w) => steps.push({ run: () => caret.before(w), pause: !/^\s+$/.test(w) }));
    });
    const words = steps.filter((s) => s.pause).length;
    const each = Math.max(18, Math.min(70, 2200 / Math.max(1, words))) * speed; // a long answer types faster
    let k = 0;
    const tick = () => {
      if (k < steps.length) { const s = steps[k++]; s.run(); toEnd(); setTimeout(tick, s.pause ? each : 0); return; }
      caret.remove();
      el.classList.remove('is-typing-out');
      setStatus('idle');
      resolve(el);
    };
    setTimeout(tick, 160);
  });
  const remember = (who, text, extra) => { st.msgs.push({ who, text, extra: extra || '' }); save(); };

  const HELLO = T('أهلين، أنا شاطر. بشو بقدر ساعدك اليوم؟', 'Hi, I\'m Shater. How can I help you today?');
  const HELLO_2 = T('احكيلي شو بتشتغل وشو هدفك، وأنا بقلّك كيف منقدر نكبّر شغلك: هوية، سوشال ميديا، فيديو، تسويق، لينكدإن أو موقع.', 'Tell me what you do and what you\'re aiming for, and I\'ll show you how we can grow it: branding, social media, video, marketing, LinkedIn or a website.');
  const SUGGEST = EN
    ? ['What services do you offer?', 'I want more sales. What do you suggest?', 'Can you run my brand\'s social media?']
    : ['شو الخدمات اللي بتقدموها؟', 'بدي زيد مبيعاتي، شو بتنصحني؟', 'فيكم تمسكوا السوشال ميديا لعلامتي؟'];

  // the suggestions: under the greeting, until the first question is asked
  let sugg = null;
  const drawSuggestions = () => {
    sugg?.remove();
    sugg = null;
    if (st.msgs.some((m) => m.who === 'me') || st.left <= 0) return;
    sugg = document.createElement('div');
    sugg.className = 'sh-sugg';
    sugg.innerHTML = `<small>${T('جرّب تسأل', 'Try asking')}</small>`;
    SUGGEST.forEach((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sh-chip';
      b.textContent = q;
      b.addEventListener('click', () => ask(q));
      sugg.append(b);
    });
    log.append(sugg);
    toEnd();
  };

  let busy = false;
  // questions left: a puzzle piece for each, lit while it's still there
  const drawLeft = () => {
    const done = st.left <= 0;
    dots.innerHTML = Array.from({ length: LIMIT }, (_, i) => `<svg class="${i < st.left ? 'on' : ''}" viewBox="${VB}"><path d="${PIECE}"/></svg>`).join('');
    leftText.textContent = done ? T('خلصت أسئلة هالزيارة', 'No questions left this visit')
      : st.left === 1 ? T('سؤال واحد متبقٍّ', '1 question left')
        : st.left === 2 ? T('سؤالان متبقيان', '2 questions left')
          : T(`${st.left} أسئلة متبقية`, `${st.left} questions left`);
    input.disabled = done;
    send.disabled = done || busy;
    input.placeholder = done ? T('كمّل مع فريقنا على واتساب ↑', 'Carry on with our team on WhatsApp ↑') : T('اكتب سؤالك…', 'Type your question…');
    panel.classList.toggle('is-done', done);
  };

  // thinking: three little pieces slide in and lock together, again and again, until the answer comes
  const thinking = () => {
    const el = row('bot', 'is-thinking');
    el.innerHTML = `<span class="sh-think" aria-hidden="true">${[0, 1, 2].map((i) => `<svg style="--i:${i}" viewBox="${VB}"><path d="${PIECE}"/></svg>`).join('')}</span><span class="sh-think-text">${T('شاطر عم يفكّر', 'Shater is thinking')}</span>`;
    setStatus('thinking');
    toEnd();
    return el;
  };

  async function ask(raw) {
    const question = String(raw || '').trim().slice(0, 500);
    if (!question || busy || st.left <= 0) return;
    busy = true;
    sugg?.remove();
    sugg = null;
    put('me', question, 'is-new');
    remember('me', question);
    // it counts the moment it's sent (the server counts it too, and has the last word)
    st.left = Math.max(0, st.left - 1);
    save();
    drawLeft();
    input.value = '';
    form.classList.remove('has-text');
    fit();
    const wait = thinking();
    const started = Date.now();
    let data = {};
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: EN ? 'en' : 'ar', question, history: st.history }),
      });
      data = await res.json().catch(() => ({}));
    } catch (e) { /* offline: shown below */ }
    // the thinking shows for a moment even when the answer is instant, so it reads as an answer and not a glitch
    const minWait = REDUCED ? 0 : 900 - (Date.now() - started);
    if (minWait > 0) await new Promise((r) => setTimeout(r, minWait));
    wait.remove();
    if (typeof data.left === 'number') st.left = data.left;
    let reply = null, extra = '';
    if (data.ok) {
      reply = data.answer;
      st.history.push({ q: question, a: data.answer });
    } else if (data.reason === 'not-ready') {
      reply = T('أنا لسا عم اتجهّز لجاوب، بس فريقنا موجود هلق: اضغط زر واتساب الأخضر فوق وبيردّوا عليك.', 'I\'m still getting ready to answer, but our team is here right now: tap the green WhatsApp button above.');
      extra = 'is-note';
    } else if (data.reason === 'limit') {
      st.left = 0;
    } else if (data.reason === 'busy') {
      reply = T('وصلني أسئلة كتير من نفس الشبكة بهالساعة. جرّب بعد شوي، أو كلّم فريقنا على واتساب.', 'Lots of questions from this network this hour. Try again later, or message our team on WhatsApp.');
      extra = 'is-note';
    } else {
      if (data.code) console.warn('[shater] OpenRouter answered', data.code);
      reply = T('ما قدرت جاوب هلق، صار خلل بالاتصال. فريقنا جاهز يجاوبك على واتساب من الزر الأخضر فوق.', 'I couldn\'t answer just now. Our team can answer you on WhatsApp: the green button above.');
      extra = 'is-note';
    }
    save();
    drawLeft();
    if (reply) { remember('bot', reply, extra); await type(reply, extra); }
    if (st.left <= 0 && !st.msgs.some((m) => m.extra === 'is-end')) {
      const end = T('خلصت أسئلتك لهالزيارة. إذا حابب نبلّش بمشروعك، فريقنا بانتظارك على واتساب وبيعطيك عرض سعر بسرعة.', 'That\'s all the questions for this visit. If you\'d like to get your project started, our team is waiting on WhatsApp with a quick quote.');
      remember('bot', end, 'is-end');
      await type(end, 'is-end');
    }
    setStatus('idle');
    busy = false;
    drawLeft();
    if (st.left > 0 && matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
  }

  // the box grows with the question, up to four lines; Enter sends, Shift+Enter starts a new line
  const fit = () => {
    input.style.height = '';
    if (!input.value) return; // empty: one line, as the stylesheet draws it
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 110)}px`;
  };
  input.addEventListener('input', () => { fit(); form.classList.toggle('has-text', Boolean(input.value.trim())); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); ask(input.value); });

  // open / close: the chat grows out of the piece (and goes back into it), like an app from the Dock.
  // From the piece's centre it starts as a small rounded square, stretches up and out, then settles.
  let anim = null;
  const fromPiece = () => {
    const f = fab.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const dx = f.left + f.width / 2 - (p.left + p.width / 2), dy = f.top + f.height / 2 - (p.top + p.height / 2);
    return { dx, dy, sx: Math.max(0.06, f.width / p.width), sy: Math.max(0.06, f.height / p.height) };
  };
  const genie = (opening) => {
    anim?.cancel();
    if (REDUCED || !panel.animate) return null;
    const { dx, dy, sx, sy } = fromPiece();
    const small = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    // half way: still narrow and leaning towards the piece, but already tall, the way a window pours out of the Dock
    const mid = `translate(${dx * 0.45}px, ${dy * 0.3}px) scale(${Math.min(0.55, Math.max(sx * 2.2, 0.32))}, 0.72)`;
    const frames = [
      { transform: small, borderRadius: '40%', opacity: 0.3, filter: 'brightness(1.6)' },
      { transform: mid, borderRadius: '30px', opacity: 1, filter: 'brightness(1.15)', offset: 0.45 },
      { transform: 'none', borderRadius: '26px', opacity: 1, filter: 'none' },
    ];
    const duration = opening ? 520 : 380;
    const a = anim = panel.animate(opening ? frames : frames.slice().reverse(), {
      duration, easing: opening ? 'cubic-bezier(.2, .9, .25, 1.05)' : 'cubic-bezier(.55, 0, .75, .3)', fill: 'both',
    });
    // safety net: a tab in the background draws no frames, so the animation could wait; it ends on time regardless
    setTimeout(() => { if (a.playState !== 'finished' && a.playState !== 'idle') a.finish(); }, duration + 250);
    return a;
  };

  const open = async (restoring = false) => {
    panel.hidden = false;
    panel.classList.add('is-open');
    fab.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('sh-open');
    st.open = true;
    st.seen = true;
    hidePing();
    save();
    if (!restoring) {
      fab.classList.remove('is-tapped');
      void fab.offsetWidth;
      fab.classList.add('is-tapped');
      genie(true);
    }
    toEnd();
    if (!restoring && st.left > 0 && matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
    // the first time the chat opens, Shater types his greeting then and there
    if (!st.msgs.length) {
      remember('bot', HELLO);
      remember('bot', HELLO_2);
      if (!restoring) await new Promise((r) => setTimeout(r, REDUCED ? 0 : 420));
      await type(HELLO, '', 1.4);
      await type(HELLO_2);
      drawSuggestions();
    }
  };
  const close = () => {
    fab.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('sh-open');
    st.open = false;
    save();
    const a = genie(false);
    const done = () => { if (!st.open) { panel.classList.remove('is-open'); panel.hidden = true; anim?.cancel(); } };
    if (a) a.onfinish = done; else done();
  };
  fab.addEventListener('click', () => (st.open ? close() : open()));
  ping.addEventListener('click', () => open());
  panel.querySelector('.sh-close').addEventListener('click', () => { close(); fab.focus({ preventScroll: true }); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.open) { close(); fab.focus({ preventScroll: true }); } });

  // the notification: "Got a question?" pops out of the piece a few seconds in, until the chat is opened
  function hidePing() { ping.classList.remove('is-in'); fab.classList.add('is-seen'); }
  if (st.seen) fab.classList.add('is-seen');
  else {
    setTimeout(() => { if (!st.open && !st.seen) ping.classList.add('is-in'); }, st.pinged ? 1500 : 5000);
    st.pinged = true;
    save();
  }

  // on another page: the same conversation, at once, and open if it was open
  st.msgs.forEach((m) => put(m.who, m.text, m.extra));
  drawSuggestions();
  setStatus('idle');
  drawLeft();
  if (st.open) open(true);
});

/* ---------- home · service request: pick the pieces, the button opens the form with them chosen ---------- */
(function initRequest() {
  const box = document.querySelector('[data-request]');
  if (!box) return;
  const section = box.closest('.request');
  const go = section.querySelector('.rq-go');
  const count = section.querySelector('.rq-count');
  const empty = count.textContent;
  const KEY = 'puzzlex-services'; // shared with the services page and the contact form (pages.js)
  const buttons = [...box.querySelectorAll('.rq-opt')];
  const remembered = () => {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((id) => typeof id === 'string'); } catch (e) { return []; }
  };
  const picked = new Set(remembered());
  // the noun after a number in Arabic: 1 and 2 have their own forms, 3–10 plural, 11+ singular
  const pieces = (n) => (EN ? `${n} ${n === 1 ? 'service' : 'services'} picked`
    : n === 1 ? 'اخترت خدمة واحدة' : n === 2 ? 'اخترت خدمتين' : `اخترت ${n} ${n <= 10 ? 'خدمات' : 'خدمة'}`);
  const draw = () => {
    const ids = [...picked];
    go.href = ids.length ? `contact.html?services=${ids.map(encodeURIComponent).join(',')}` : 'contact.html';
    count.textContent = ids.length ? pieces(ids.length) : empty;
    section.classList.toggle('has-picks', ids.length > 0);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.id))));
    box.querySelectorAll('.rq-card').forEach((c) => c.classList.toggle('is-on', !!c.querySelector('[aria-pressed="true"]')));
    // saved on every change, so the picks reach the contact form however the visitor gets there (button, menu, footer)
    try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { /* the button's link still carries them */ }
    go.querySelector('.rq-n')?.remove();
    if (ids.length) {
      const n = document.createElement('span');
      n.className = 'rq-n';
      n.textContent = ids.length;
      go.append(n);
    }
  };
  box.addEventListener('click', (ev) => {
    const opt = ev.target.closest('.rq-opt');
    if (!opt) return;
    if (opt.getAttribute('aria-pressed') !== 'true') picked.add(opt.dataset.id); else picked.delete(opt.dataset.id);
    if (typeof playClick === 'function') { try { playClick(); } catch (e) { /* sound is a bonus */ } }
    draw();
  });
  draw();
  // back from the contact form with the page restored as it was: show what was changed there
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return;
    picked.clear();
    remembered().forEach((id) => picked.add(id));
    draw();
  });
  // on phones the WhatsApp and back-to-top buttons would sit on the request bar: they step aside meanwhile
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => document.documentElement.classList.toggle('rq-in-view', e.isIntersecting), { rootMargin: '-35% 0px -10% 0px' })
      .observe(section);
  }
  if (!REDUCED && window.gsap && window.ScrollTrigger) {
    gsap.from(section.querySelectorAll('.rq-card'), {
      y: 40, autoAlpha: 0, rotate: (i) => (i % 2 ? 2 : -2), duration: 0.8, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: box, start: 'top 85%', toggleActions: 'play none none none' }, // see scroll.js: not `once`
    });
  }
})();

/* ---------- home · every partner logo on a strip that keeps moving (two rows, opposite ways) ---------- */
(function initLogoStrip() {
  const strip = document.querySelector('[data-logo-strip]');
  const logos = (SITE.partners || []).filter((p) => p && p.src);
  if (!strip) return;
  if (logos.length < 6) { strip.closest('.logo-strip')?.remove(); return; }
  const src = (s) => (/^(\/|https?:)/.test(s) ? s : ROOT + s);
  const half = Math.ceil(logos.length / 2);
  const rows = [logos.slice(0, half), logos.slice(half)];
  strip.innerHTML = rows.map((row, r) => {
    // each row twice, so the loop is seamless; the copy is hidden from screen readers
    const items = (copy) => row.map((p) => `<li${copy ? ' aria-hidden="true"' : ''}><img src="${src(p.src)}" alt="${copy ? '' : (p.name || '').replace(/[<>"&]/g, '')}" loading="lazy" decoding="async" width="132" height="70"></li>`).join('');
    return `<div class="ls-row${r ? ' rev' : ''}" style="--dur:${Math.max(28, row.length * 3.2)}s"><ul class="ls-track">${items(false)}${items(true)}</ul></div>`;
  }).join('');
})();

/* ---------- feedback page · rivers of reviews: rows of interlocking puzzle pieces sliding past, each row its own
   way and speed. Hover a row and it stops; click a piece and it opens large. A showcase (hidden from screen readers):
   every review is also in the wall below, with its search. Only transform moves, in CSS, one layer per row. ---------- */
(function initFeedbackRivers() {
  const box = document.querySelector('[data-feedback-rivers]');
  const list = box && box.querySelector('.fbr-list');
  if (!list) return;
  const all = [...list.children];

  // two shapes do the whole river: a piece with both sides cut in, then one with both tabs out, and so on
  const pathOf = (e, w, h, tab) => {
    let d = '';
    const n = (v) => +v.toFixed(1);
    piecePath({
      moveTo: (x, y) => { d += `M${n(x)} ${n(y)}`; },
      lineTo: (x, y) => { d += `L${n(x)} ${n(y)}`; },
      bezierCurveTo: (a, b, c, dd, x, y) => { d += `C${n(a)} ${n(b)} ${n(c)} ${n(dd)} ${n(x)} ${n(y)}`; },
      closePath: () => { d += 'Z'; },
    }, 0, 0, w, h, e, tab);
    return d;
  };

  const rowsEl = document.createElement('div');
  rowsEl.className = 'fbr-rows';
  const view = document.createElement('dialog');
  view.className = 'fbr-view';
  view.setAttribute('aria-label', T('رأي العميل', 'Client review'));
  box.after(view);

  let lastW = 0;
  function build() {
    const vw = box.clientWidth || window.innerWidth;
    if (vw === lastW) return;
    lastW = vw;
    const small = vw < 700;
    const W = small ? 256 : 320, H = small ? 198 : 196, tab = H * 0.44, pad = Math.ceil(tab * TAB_DEPTH + 4);
    const cut = Math.ceil(tab * TAB_DEPTH + 12), plain = 18;
    box.style.setProperty('--w', `${W}px`);
    box.style.setProperty('--h', `${H}px`);
    box.style.setProperty('--pad', `${pad}px`);
    box.style.setProperty('--cut', `${cut}px`);
    box.style.setProperty('--plain', `${plain}px`);
    const shapes = [{ t: 0, b: 0, l: -1, r: -1 }, { t: 0, b: 0, l: 1, r: 1 }].map((e) => pathOf(e, W, H, tab));

    // fewer rows when there are few reviews; each row an even number of pieces, so the loop locks in at its seam
    const nRows = Math.min(Number(box.dataset.rows) || 3, all.length >= 18 ? 3 : all.length >= 10 ? 2 : 1);
    const rows = Array.from({ length: nRows }, () => []);
    all.forEach((li, i) => rows[i % nRows].push(li));
    const speeds = [34, 26, 40]; // px a second
    rowsEl.replaceChildren(...rows.map((row, r) => {
      if (row.length % 2) row = row.concat(row[0]);
      // one set must be at least as wide as the screen; then it's there twice and slides exactly one set's width
      let set = row;
      while (set.length * W < vw + W) set = set.concat(row);
      const piece = (li, k) => {
        const el = li.cloneNode(true);
        el.classList.add(k % 2 ? 'is-tabs' : 'is-cuts');
        if ((k + r * 3) % 9 === 4) el.classList.add('is-lime');
        el.insertAdjacentHTML('afterbegin', `<svg class="fbr-shape" viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" aria-hidden="true"><path d="${shapes[k % 2]}"/></svg>`);
        return el;
      };
      const track = document.createElement('ul');
      track.className = 'fbr-track';
      track.append(...set.map(piece), ...set.map(piece));
      const rowEl = document.createElement('div');
      rowEl.className = `fbr-row${r % 2 ? ' is-rev' : ''}`;
      rowEl.style.setProperty('--shift', `${-set.length * W}px`);
      rowEl.style.setProperty('--dur', `${((set.length * W) / speeds[r % speeds.length]).toFixed(1)}s`);
      rowEl.append(track);
      return rowEl;
    }));
    // the big piece in the viewer: a tab on top and on one side, a cut on the others
    view.dataset.shape = pathOf({ t: 1, r: -1, b: -1, l: 1 }, 600, 360, 360 * 0.34);
  }

  list.replaceWith(rowsEl);
  box.classList.add('is-ready');
  build();
  window.addEventListener('resize', () => { clearTimeout(build.t); build.t = setTimeout(build, 200); });

  // off screen, the rivers stop (and so does the work of moving them)
  new IntersectionObserver(([e]) => box.classList.toggle('is-off', !e.isIntersecting)).observe(box);

  // a click (not a drag of the page on a phone) opens the piece large
  rowsEl.addEventListener('click', (ev) => {
    const li = ev.target.closest('.fbr');
    if (!li) return;
    const pad = Math.ceil(360 * 0.34 * TAB_DEPTH + 4);
    const content = li.cloneNode(true);
    content.querySelector('.fbr-shape')?.remove();
    view.innerHTML = `<div class="fbr-big${li.classList.contains('is-lime') ? ' is-lime' : ''}">`
      + `<svg class="fbr-shape" viewBox="${-pad} ${-pad} ${600 + 2 * pad} ${360 + 2 * pad}" preserveAspectRatio="none" aria-hidden="true"><path d="${view.dataset.shape}"/></svg>`
      + `<div class="fbr-big-body">${content.innerHTML}</div>`
      + `<button type="button" class="fbr-close" aria-label="${T('إغلاق', 'Close')}">×</button></div>`;
    box.classList.add('is-paused');
    view.showModal();
    view.querySelector('.fbr-close').focus({ preventScroll: true });
    if (!REDUCED && window.gsap) gsap.fromTo(view.querySelector('.fbr-big'), { scale: 0.85, rotation: -4, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(1.6)' });
    playClick();
  });
  view.addEventListener('click', (ev) => { if (ev.target === view || ev.target.closest('.fbr-close')) view.close(); });
  view.addEventListener('close', () => box.classList.remove('is-paused'));
})();
