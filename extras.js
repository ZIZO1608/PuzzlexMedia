/* PuzzleX — the small things every page shares, plus a few home-page sections:
     the back-to-top piece (bottom right): its outline draws itself as you read, it turns lime at the end,
       and a press sends it flying up while the page follows
     the WhatsApp button's greeting bubble (the button itself is added by the server once there's a number)
     the home page's service request picker, the client-feedback slider's dots, and the partner logos strip
   Uses T(), SITE, ROOT, REDUCED and EN from main.js, jigsawD() and TAB_DEPTH from pages.js / main.js. */

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

/* ---------- WhatsApp: a greeting next to the round button, once per visit ---------- */
// the server adds the button after the page's scripts, so wait for the whole document
document.addEventListener('DOMContentLoaded', function initWhatsAppHello() {
  const fab = document.querySelector('.wa-fab');
  if (!fab || REDUCED) return;
  let seen = false;
  try { seen = sessionStorage.getItem('puzzlex-wa-hello') === '1'; } catch (e) { /* show it anyway */ }
  if (seen) return;
  const bubble = document.createElement('div');
  bubble.className = 'wa-hello';
  bubble.setAttribute('role', 'status');
  bubble.innerHTML = '<b></b><span></span><button type="button" class="wa-hello-x"></button>';
  bubble.querySelector('b').textContent = T('أهلاً 👋', 'Hi there 👋');
  bubble.querySelector('span').textContent = T('عندك مشروع؟ كلّمنا على واتساب.', 'Got a project? Message us on WhatsApp.');
  const x = bubble.querySelector('.wa-hello-x');
  x.setAttribute('aria-label', T('إغلاق', 'Close'));
  x.textContent = '×';
  document.body.append(bubble);
  const hide = () => {
    bubble.classList.remove('is-in');
    try { sessionStorage.setItem('puzzlex-wa-hello', '1'); } catch (e) { /* fine */ }
    setTimeout(() => bubble.remove(), 400);
  };
  x.addEventListener('click', hide);
  bubble.addEventListener('click', (ev) => { if (ev.target !== x) { fab.click(); hide(); } });
  fab.addEventListener('click', hide);
  // after the visitor has had a look round, not straight away
  setTimeout(() => { if (bubble.isConnected) bubble.classList.add('is-in'); }, 9000);
  setTimeout(() => { if (bubble.isConnected) hide(); }, 24000);
});

/* ---------- home · service request: pick the pieces, the button opens the form with them chosen ---------- */
(function initRequest() {
  const box = document.querySelector('[data-request]');
  if (!box) return;
  const section = box.closest('.request');
  const go = section.querySelector('.rq-go');
  const count = section.querySelector('.rq-count');
  const empty = count.textContent;
  const picked = new Set();
  // the noun after a number in Arabic: 1 and 2 have their own forms, 3–10 plural, 11+ singular
  const pieces = (n) => (EN ? `${n} ${n === 1 ? 'service' : 'services'} picked`
    : n === 1 ? 'اخترت خدمة واحدة' : n === 2 ? 'اخترت خدمتين' : `اخترت ${n} ${n <= 10 ? 'خدمات' : 'خدمة'}`);
  const draw = () => {
    const ids = [...picked];
    go.href = ids.length ? `contact.html?services=${ids.map(encodeURIComponent).join(',')}` : 'contact.html';
    count.textContent = ids.length ? pieces(ids.length) : empty;
    section.classList.toggle('has-picks', ids.length > 0);
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
    const on = opt.getAttribute('aria-pressed') !== 'true';
    opt.setAttribute('aria-pressed', String(on));
    if (on) picked.add(opt.dataset.id); else picked.delete(opt.dataset.id);
    opt.closest('.rq-card').classList.toggle('is-on', !!opt.closest('.rq-card').querySelector('[aria-pressed="true"]'));
    if (typeof playClick === 'function') { try { playClick(); } catch (e) { /* sound is a bonus */ } }
    draw();
  });
  // the picks also go to the contact form if the visitor gets there another way (menu, footer)
  go.addEventListener('click', () => {
    try { sessionStorage.setItem('puzzlex-services', JSON.stringify([...picked])); } catch (e) { /* the link carries them */ }
  });
  // on phones the WhatsApp and back-to-top buttons would sit on the request bar: they step aside meanwhile
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => document.documentElement.classList.toggle('rq-in-view', e.isIntersecting), { rootMargin: '-35% 0px -10% 0px' })
      .observe(section);
  }
  if (!REDUCED && window.gsap && window.ScrollTrigger) {
    gsap.from(section.querySelectorAll('.rq-card'), {
      y: 40, autoAlpha: 0, rotate: (i) => (i % 2 ? 2 : -2), duration: 0.8, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: box, start: 'top 85%', once: true },
    });
  }
})();

/* ---------- home · client feedback: on phones the cards slide sideways; the dots show where you are ---------- */
(function initFeedbackSlider() {
  const list = document.querySelector('.testimonials .tm-list');
  const dotsEl = document.querySelector('.testimonials .tm-dots');
  if (!list || !dotsEl) return;
  const cards = [...list.children];
  if (cards.length < 2) return;
  dotsEl.innerHTML = cards.map(() => '<i></i>').join('');
  const dots = [...dotsEl.children];
  const active = () => {
    const mid = list.getBoundingClientRect().left + list.clientWidth / 2;
    let best = 0, dist = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d2 = Math.abs(r.left + r.width / 2 - mid);
      if (d2 < dist) { dist = d2; best = i; }
    });
    dots.forEach((d3, i) => d3.classList.toggle('on', i === best));
  };
  list.addEventListener('scroll', () => requestAnimationFrame(active), { passive: true });
  addEventListener('resize', active);
  active();
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
