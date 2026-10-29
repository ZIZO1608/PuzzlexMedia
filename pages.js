/* PuzzleX — inner pages (about / services / work / feedback / contact) and the chrome shared by every page.
   Uses gsap + ScrollTrigger, helpers from main.js (piecePath, TAB_DEPTH, REDUCED, playClick, $)
   and from sections.js (loadPopMark / popMark). Every block checks its own markup first, so this file
   can be loaded on any page. */

/* ---------- shared chrome ---------- */
(function initChrome() {
  const bar = document.querySelector('.topbar--page');
  if (bar) {
    const onScroll = () => bar.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  // phones: the links, language, theme and contact button fold into a full-screen menu (styles.css, "Phones")
  document.querySelectorAll('.topbar').forEach((top) => {
    const nav = top.querySelector('.nav');
    if (!nav) return;
    nav.id ||= 'site-menu';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-toggle';
    btn.setAttribute('aria-controls', nav.id);
    btn.innerHTML = '<span></span><span></span>';
    top.append(btn);
    // everything outside the top bar (on the home page the bar sits inside the hero, so walk up to <body>)
    const outside = () => {
      const out = [];
      for (let el = top; el.parentElement && el !== document.body; el = el.parentElement) {
        for (const sib of el.parentElement.children) if (sib !== el && sib.tagName !== 'SCRIPT') out.push(sib);
      }
      return out;
    };
    const set = (open) => {
      top.classList.toggle('menu-open', open);
      document.documentElement.classList.toggle('menu-lock', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? T('إغلاق القائمة', 'Close menu') : T('القائمة', 'Menu'));
      // the page behind the open menu can't be reached by Tab, a screen reader or a click
      outside().forEach((el) => { el.inert = open; });
    };
    set(false);
    btn.addEventListener('click', () => set(!top.classList.contains('menu-open')));
    top.addEventListener('click', (ev) => { if (ev.target.closest('.nav a, .top-actions a')) set(false); });
    document.addEventListener('keydown', (ev) => {
      if (!top.classList.contains('menu-open')) return;
      if (ev.key === 'Escape') { set(false); btn.focus(); return; }
      if (ev.key !== 'Tab') return;
      // Tab cycles inside the open menu
      const items = [...top.querySelectorAll('a[href], button')].filter((el) => el.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    matchMedia('(min-width: 761px)').addEventListener('change', (ev) => { if (ev.matches) set(false); });
  });
  // the loading screen hides the scrollbar; positions shift slightly once it's gone
  document.addEventListener('loaderdone', () => ScrollTrigger.refresh());
  // switching language keeps the same project / picked services
  if (location.search) document.querySelectorAll('.lang-switch').forEach((l) => { l.search = location.search; });
  document.querySelectorAll('.site-footer .year').forEach((el) => { el.textContent = new Date().getFullYear(); });
  // the footer mark assembles itself the first time it scrolls into view
  const mark = document.querySelector('.footer-mark');
  if (mark && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mark.classList.add('is-armed');
    void mark.offsetWidth; // commit the hidden state, so a footer already on screen still animates in
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      mark.classList.add('is-in');
      io.disconnect();
    }, { threshold: 0.6 });
    io.observe(mark);
  }
})();

// a jigsaw outline as SVG path data: body `w` square at (ox, oy), tabs sized for a `tab`-sized piece
function jigsawD(e, w, tab = w, ox = 0, oy = 0) {
  let d = '';
  const n = (v) => +v.toFixed(2);
  const rec = {
    moveTo: (x, y) => { d += `M${n(x)} ${n(y)}`; },
    lineTo: (x, y) => { d += `L${n(x)} ${n(y)}`; },
    bezierCurveTo: (a, b, c, dd, x, y) => { d += `C${n(a)} ${n(b)} ${n(c)} ${n(dd)} ${n(x)} ${n(y)}`; },
    closePath: () => { d += 'Z'; },
  };
  piecePath(rec, ox, oy, w, w, e, tab);
  return d;
}

/* ---------- About · the tray: a 2×2 puzzle tray seen in 3D, the lime X piece drops into its slot ---------- */
async function initTray() {
  const scene = document.querySelector('.tray-scene');
  if (!scene) return;
  const tray = scene.querySelector('.tray');
  await loadPopMark();

  const U = 100, PAD = 34;
  const hE = [1, -1]; // edge between the two rows, per column
  const vE = [-1, 1]; // edge between the two columns, per row
  const edges = (c, r) => ({ t: r === 0 ? 0 : -hE[c], b: r === 1 ? 0 : hE[c], l: c === 0 ? 0 : -vE[r], r: c === 1 ? 0 : vE[r] });
  const SLOT = { c: 1, r: 0 };
  const vb = `${-PAD} ${-PAD} ${2 * U + 2 * PAD} ${2 * U + 2 * PAD}`;
  const layer = (cls, inner, z) => `<svg class="${cls}" viewBox="${vb}" style="transform: translateZ(${z}px)">${inner}</svg>`;
  const slab = (fill) => `<rect x="-22" y="-22" width="${2 * U + 44}" height="${2 * U + 44}" rx="22" style="fill:${fill}"/>`;

  // tray slab with thickness (stacked copies), then the three placed pieces and the empty slot
  let html = '';
  for (let i = 7; i >= 1; i--) html += layer('tray-layer', slab('var(--tray-edge)'), -i * 2.6);
  let face = slab('var(--tray)');
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const d = jigsawD(edges(c, r), U, U, c * U, r * U);
      face += c === SLOT.c && r === SLOT.r
        ? `<path d="${d}" style="fill:var(--tray-hole)"/>`
        : `<path d="${d}" style="fill:var(--tray-piece);stroke:var(--tray-seam);stroke-width:.8"/>`;
    }
  }
  const sd = jigsawD(edges(SLOT.c, SLOT.r), U, U, SLOT.c * U, SLOT.r * U);
  html += layer('tray-face', face, 0);
  html += layer('tray-shadow', `<path d="${sd}" style="fill:rgba(0,0,0,.55)"/>`, 0.5); // the lime piece's shadow on the tray

  // the lime piece, with its own thickness
  let piece = '';
  for (let i = 6; i >= 1; i--) piece += layer('piece-layer', `<path d="${sd}" style="fill:#a3c400"/>`, -i * 2.2);
  const mark = popMark
    ? `<svg x="${SLOT.c * U + 27}" y="${SLOT.r * U + 22}" width="46" height="46" viewBox="${popMark.viewBox}">${popMark.inner}</svg>`
    : '';
  piece += layer('piece-face', `<path d="${sd}" style="fill:#d7ff00"/>${mark}`, 0);
  tray.innerHTML = `${html}<div class="tray-piece">${piece}</div>`;

  const lime = tray.querySelector('.tray-piece');
  const shadow = tray.querySelector('.tray-shadow');
  if (REDUCED) { gsap.set(lime, { z: 1.5 }); return; }

  // it falls into its slot once on arrival, then lifts when you point at the tray
  const REST = 1.5; // resting just above the tray face (coplanar faces would let the tray draw over it)
  gsap.set(lime, { z: 240, rotationZ: -38, x: 30, y: -30, autoAlpha: 0 });
  gsap.set(shadow, { opacity: 0.05, scale: 1.25, svgOrigin: `${SLOT.c * U + 50} ${SLOT.r * U + 50}` });
  const drop = gsap.timeline({ delay: 0.35 });
  drop.to(lime, { autoAlpha: 1, duration: 0.25, ease: 'none' }, 0);
  drop.to(lime, { z: REST, rotationZ: 0, x: 0, y: 0, duration: 1.05, ease: 'power3.in' }, 0);
  drop.to(shadow, { opacity: 1, scale: 1, duration: 1.05, ease: 'power3.in' }, 0);
  drop.add(() => playClick());
  drop.to(tray, { y: 5, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.out' }); // the tray gives a little

  scene.addEventListener('pointerenter', () => {
    if (drop.isActive()) return;
    gsap.to(lime, { z: 70, rotationZ: -8, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    gsap.to(shadow, { opacity: 0.35, scale: 1.12, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
  });
  scene.addEventListener('pointerleave', () => {
    if (drop.isActive()) return;
    gsap.to(lime, { z: REST, rotationZ: 0, duration: 0.45, ease: 'power3.in', overwrite: 'auto', onComplete: playClick });
    gsap.to(shadow, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.in', overwrite: 'auto' });
  });
}

/* ---------- About · why us: four pieces that lock into one square as you scroll ---------- */
function initReasons() {
  const sec = document.querySelector('.reasons');
  if (!sec) return;
  const board = sec.querySelector('.reasons-board');
  const items = [...board.querySelectorAll('.reason')];
  let ctx = null;

  const build = () => {
    if (ctx) ctx.revert();
    board.classList.remove('locked');
    const mobile = window.innerWidth < 760;
    const S = mobile
      ? Math.min(window.innerWidth * 0.84, 360)
      : Math.min(window.innerWidth * 0.27, window.innerHeight * 0.37, 380);
    const tab = S * 0.55; // smaller tabs than the piece itself: more room for text
    const cut = tab * TAB_DEPTH; // how deep a cut-in reaches
    const pad = Math.ceil(cut + 8);
    const cols = mobile ? 1 : 2, rows = mobile ? 4 : 2;

    // reading order 01 → 04 runs top-to-bottom, right-to-left in Arabic and left-to-right in English
    const cell = (i) => (mobile ? { c: 0, r: i } : { c: (i % 2 === 0) !== EN ? 1 : 0, r: Math.floor(i / 2) });
    // every piece gets exactly one tab and one cut-in on its inner edges
    const hE = mobile ? [[1], [1], [1]] : [[-1, 1]]; // [row gap][column] — on phones: cut-in on top, tab below
    const vE = mobile ? [] : [[1], [-1]]; // [row][column gap]
    const edgesAt = (c, r) => ({
      t: r === 0 ? 0 : -hE[r - 1][c],
      b: r === rows - 1 ? 0 : hE[r][c],
      l: c === 0 ? 0 : -vE[r][c - 1],
      r: c === cols - 1 ? 0 : vE[r][c],
    });

    board.style.width = cols * S + 'px';
    board.style.height = rows * S + 'px';
    items.forEach((it, i) => {
      const { c, r } = cell(i);
      const e = edgesAt(c, r);
      const side = S + pad * 2;
      Object.assign(it.style, { left: c * S - pad + 'px', top: r * S - pad + 'px', width: side + 'px', height: side + 'px' });
      // keep the text inside the part no cut-in reaches
      const inset = (edge) => pad + (edge < 0 ? cut + S * 0.06 : S * 0.1);
      it.style.padding = `${inset(e.t)}px ${inset(e.r)}px ${inset(e.b)}px ${inset(e.l)}px`;
      it.querySelector('.reason-shape')?.remove();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'reason-shape');
      svg.setAttribute('viewBox', `${-pad} ${-pad} ${side} ${side}`);
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = `<path d="${jigsawD(e, S, tab)}"/>`;
      it.prepend(svg);
    });

    if (REDUCED) { board.classList.add('locked'); return; }

    ctx = gsap.context(() => {
      const spread = (i) => {
        const { c, r } = cell(i);
        const sx = mobile ? (i % 2 ? -1 : 1) : (c === 1 ? 1 : -1);
        const sy = mobile ? 0 : (r === 0 ? -1 : 1);
        return { x: sx * S * (mobile ? 0.35 : 0.42), y: sy * S * 0.3, rotation: (i % 2 ? -1 : 1) * (7 + i * 2), opacity: 0.35 };
      };
      if (mobile) {
        // phones: each piece slides into the stack as it scrolls into view
        items.forEach((it, i) => {
          gsap.fromTo(it, spread(i), {
            x: 0, y: 0, rotation: 0, opacity: 1, ease: 'power2.out',
            scrollTrigger: { trigger: it, start: 'top 92%', end: 'top 55%', scrub: 0.8 },
          });
        });
        ScrollTrigger.create({ trigger: board, start: 'bottom 70%', onEnter: () => { board.classList.add('locked'); playClick(); }, onLeaveBack: () => board.classList.remove('locked') });
        return;
      }
      const LOCK = 1;
      let last = 0;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.9 },
        onUpdate: () => {
          const t = tl.time();
          if (last < LOCK && t >= LOCK) playClick();
          board.classList.toggle('locked', t >= LOCK);
          last = t;
        },
      });
      items.forEach((it, i) => tl.fromTo(it, spread(i), { x: 0, y: 0, rotation: 0, opacity: 1, duration: 0.8, ease: 'power2.inOut' }, 0.1 + i * 0.03));
      tl.to({}, { duration: 0.6 }, LOCK);
    });
  };

  build();
  let lastW = window.innerWidth, timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      build();
      ScrollTrigger.refresh();
    }, 250);
  });
}

/* ---------- About · vision: the sentence lights up word by word ---------- */
function initVision() {
  const sec = document.querySelector('.vision');
  if (!sec) return;
  const p = sec.querySelector('.vision-text');
  const words = p.textContent.trim().split(/\s+/);
  p.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
  const spans = [...p.querySelectorAll('.w')];
  if (REDUCED) { spans.forEach((s) => { s.style.opacity = 1; }); return; }
  gsap.to(spans, {
    opacity: 1,
    stagger: 0.1,
    ease: 'none',
    scrollTrigger: { trigger: sec, start: 'top 20%', end: 'bottom bottom', scrub: 0.6 },
  });
  gsap.fromTo(sec.querySelector('.vision-year'), { yPercent: 12, scale: 0.92 }, {
    yPercent: -12, scale: 1.04, ease: 'none',
    scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

/* ---------- Services · the big pieces in the opening, one per group (each links to its section) ---------- */
function initServiceHero() {
  const wrap = document.querySelector('.svc-hero-pieces');
  if (!wrap) return;
  const U = 100, TAB = 90, PAD = Math.ceil(TAB * TAB_DEPTH + 4);
  const pieces = [...wrap.querySelectorAll('.svc-hero-piece')];
  const last = pieces.length - 1;
  const vE = pieces.slice(1).map((_, c) => (c % 2 ? -1 : 1)); // edge between columns c|c+1, tabs alternating
  wrap.style.setProperty('--pad', (PAD / U).toFixed(3));
  wrap.style.setProperty('--n', pieces.length);
  pieces.forEach((a, i) => {
    const c = EN ? i : last - i; // follow the reading order
    const e = { t: 0, b: 0, l: c === 0 ? 0 : -vE[c - 1], r: c === last ? 0 : vE[c] };
    a.style.setProperty('--c', c);
    a.insertAdjacentHTML('afterbegin',
      `<svg class="svc-hero-shape" viewBox="${-PAD} ${-PAD} ${U + 2 * PAD} ${U + 2 * PAD}" aria-hidden="true"><path d="${jigsawD(e, U, TAB)}"/></svg>`);
  });
}

/* ---------- the bottom tray (services page and contact form): picked pieces fly into it ---------- */
const MINI_PAD = Math.ceil(100 * TAB_DEPTH + 4);
const miniPiece = () => `<svg class="mini-piece" viewBox="${-MINI_PAD} ${-MINI_PAD} ${100 + 2 * MINI_PAD} ${100 + 2 * MINI_PAD}"><path d="${jigsawD({ t: 0, b: 0, l: -1, r: 1 }, 100, 100)}"/></svg>`;

// Arabic counting: قطعة واحدة · قطعتان (the dual needs no numeral) · 3–10 قطع · 11+ قطعة
const pieceUnit = (n) => (EN ? (n === 1 ? 'piece' : 'pieces') : n === 1 ? 'قطعة واحدة' : n === 2 ? 'قطعتان' : n <= 10 ? 'قطع' : 'قطعة');

// a small lime piece flies from `from` (an element) into `slot` in the tray `panel`
function flyPiece(from, slot, panel) {
  if (REDUCED) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const r = slot.getBoundingClientRect();
  // the tray may still be sliding up from below: aim for where it will rest, not where it is now
  const rising = ((gsap.getProperty(panel, 'yPercent') || 0) * panel.offsetHeight) / 100;
  const to = { left: r.left, top: r.top - rising, width: r.width, height: r.height };
  const el = document.createElement('div');
  el.className = 'fly-piece';
  el.innerHTML = miniPiece();
  document.body.appendChild(el);
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
  gsap.set(el, { left: sx, top: sy, xPercent: -50, yPercent: -50, scale: 1.5, rotation: -40 });
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: () => { el.remove(); resolve(); } });
    tl.to(el, { x: to.left + to.width / 2 - sx, duration: 0.75, ease: 'power1.inOut' }, 0);
    tl.to(el, { y: to.top + to.height / 2 - sy, duration: 0.75, ease: 'back.in(1.2)' }, 0);
    tl.to(el, { rotation: 320, scale: 0.7, duration: 0.75, ease: 'power2.inOut' }, 0);
  });
}

// shows / hides the tray (it springs up from below) and lands a new piece in it
function createTray(panel) {
  const piecesEl = panel.querySelector('.my-puzzle-pieces');
  const countEl = panel.querySelector('.my-puzzle-count');
  const unitEl = panel.querySelector('.my-puzzle-unit');
  let open = false;

  const render = (n) => {
    countEl.textContent = EN || n > 2 ? n : '';
    unitEl.textContent = pieceUnit(n);
    piecesEl.innerHTML = Array.from({ length: Math.min(n, 6) }, miniPiece).join('') + (n > 6 ? `<span class="more">+${n - 6}</span>` : '');
  };

  const setOpen = (on, animate) => {
    if (on === open) return;
    open = on;
    gsap.killTweensOf(panel);
    if (on) panel.hidden = false;
    if (!animate || REDUCED) { panel.hidden = !on; gsap.set(panel, { yPercent: 0, autoAlpha: on ? 1 : 0 }); return; }
    gsap.fromTo(panel, on ? { yPercent: 160, autoAlpha: 0 } : { yPercent: 0, autoAlpha: 1 }, {
      yPercent: on ? 0 : 160, autoAlpha: on ? 1 : 0, duration: 0.5, ease: on ? 'back.out(1.6)' : 'power2.in',
      onComplete: () => { if (!on) panel.hidden = true; },
    });
  };

  // the n-th piece's slot stays empty until the flying piece lands in it, then the tray gives a little bounce
  const land = async (from, n) => {
    const slot = piecesEl.querySelectorAll('.mini-piece')[Math.min(n, 6) - 1];
    if (slot && !REDUCED) gsap.set(slot, { autoAlpha: 0 });
    await flyPiece(from, slot || piecesEl, panel);
    if (slot && slot.isConnected) gsap.fromTo(slot, { autoAlpha: 1, scale: 1.4 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
    playClick();
    if (open && !REDUCED) gsap.fromTo(panel, { scale: 1 }, { scale: 1.04, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out' });
  };

  return { render, setOpen, land, get open() { return open; } };
}

/* ---------- Services · build your puzzle: picked services fly into a tray, then go to the contact page ---------- */
function initServicePicker() {
  const panel = document.querySelector('.my-puzzle');
  if (!panel) return;
  const KEY = 'puzzlex-services';
  const buttons = [...document.querySelectorAll('.svc')];
  const known = new Set(buttons.map((b) => b.dataset.id));
  const send = panel.querySelector('.my-puzzle-send');
  const tray = createTray(panel);

  let picked = [];
  try { picked = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((id) => known.has(id)); } catch (e) { picked = []; }

  const render = () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(picked.includes(b.dataset.id))));
    tray.render(picked.length);
    send.href = 'contact.html' + (picked.length ? `?services=${encodeURIComponent(picked.join(','))}` : '');
    try { sessionStorage.setItem(KEY, JSON.stringify(picked)); } catch (e) { /* the pick just won't survive a reload */ }
  };

  buttons.forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.dataset.id;
    if (picked.includes(id)) {
      picked = picked.filter((x) => x !== id);
      render();
      if (!picked.length) tray.setOpen(false, true);
      return;
    }
    picked.push(id);
    render();
    // the piece pops up out of the board and drops back in, now lime
    if (!REDUCED) {
      gsap.fromTo(btn.parentElement, { y: 0, rotation: 0, scale: 1 }, {
        keyframes: [
          { y: -18, rotation: gsap.utils.random(-4, 4), scale: 1.04, duration: 0.16, ease: 'power2.out' },
          { y: 0, rotation: 0, scale: 1, duration: 0.55, ease: 'back.out(2.6)' },
        ],
        overwrite: true, clearProps: 'transform',
      });
    }
    tray.setOpen(true, true);
    tray.land(btn.querySelector('.svc-add'), picked.length); // from the card's +
  }));

  panel.querySelector('.my-puzzle-clear').addEventListener('click', () => {
    picked = [];
    render();
    tray.setOpen(false, true);
  });

  render();
  tray.setOpen(picked.length > 0, false);
}

/* ---------- segmented control (LinkedIn: people / companies) ---------- */
function initSegmented() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const tabs = [...seg.querySelectorAll('[role="tab"]')];
    const thumb = seg.querySelector('.seg-thumb');
    const place = (tab) => {
      thumb.style.width = tab.offsetWidth + 'px';
      thumb.style.transform = `translateX(${tab.offsetLeft}px)`;
    };
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      place(tab);
      if (focus) tab.focus();
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (!REDUCED) gsap.fromTo(panel.querySelectorAll('.svc, .svc-feature'), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.06, ease: 'power3.out' });
      ScrollTrigger.refresh();
    };
    tabs.forEach((t) => t.addEventListener('click', () => select(t)));
    seg.addEventListener('keydown', (ev) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      // right-to-left: ArrowLeft moves forward
      const step = ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      ev.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
    place(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]);
    window.addEventListener('resize', () => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
  });
}

/* ---------- Services · the two lists of a group as one jigsaw board ----------
   Every card is drawn as a piece: a tab (1) or blank (-1) wherever it meets a neighbour, across the two columns and
   down each one, flat with rounded corners on the board's outside. Cards in the same row get the same height so the
   pieces really fit. On phones the columns stack, and each list is its own one-column board. */
const BOARD_TAB = 96; // the tab is drawn for a piece this size: about 26px deep, 38px across at its widest

function boardPieceD(w, h, e, s = BOARD_TAB, r = 18) {
  let d = '';
  const n = (v) => +v.toFixed(1);
  const pt = (x, y) => `${n(x)} ${n(y)}`;
  // a side from a to b; the tab sits in its middle whatever its length, bulging along the outward normal
  const side = (ax, ay, bx, by, nx, ny, sign) => {
    if (sign) {
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      const at = (t, k) => pt(ax + ux * (len / 2 + (t - 0.5) * s) + nx * k * sign * s, ay + uy * (len / 2 + (t - 0.5) * s) + ny * k * sign * s);
      d += `L${at(0.38, 0)}`;
      for (const c of TAB) d += `C${at(c[0], c[1])} ${at(c[2], c[3])} ${at(c[4], c[5])}`;
    }
    d += `L${pt(bx, by)}`;
  };
  const arc = (x, y, rad) => { if (rad) d += `A${rad} ${rad} 0 0 1 ${pt(x, y)}`; };
  // only a corner between two outside (flat) sides is rounded
  const tl = !e.t && !e.l ? r : 0, tr = !e.t && !e.r ? r : 0, br = !e.b && !e.r ? r : 0, bl = !e.b && !e.l ? r : 0;
  d += `M${pt(tl, 0)}`;
  side(tl, 0, w - tr, 0, 0, -1, e.t); arc(w, tr, tr);
  side(w, tr, w, h - br, 1, 0, e.r); arc(w - br, h, br);
  side(w - br, h, bl, h, 0, 1, e.b); arc(0, h - bl, bl);
  side(0, h - bl, 0, tl, -1, 0, e.l); arc(tl, 0, tl);
  return `${d}Z`;
}

function initServiceBoard() {
  const pad = Math.ceil(BOARD_TAB * TAB_DEPTH) + 4; // room around a card for its tabs and stroke
  document.querySelectorAll('.svc-cols').forEach((cols) => {
    const lists = [...cols.querySelectorAll('.svc-list')];
    const columns = lists.map((ul) => [...ul.querySelectorAll('.svc')]);
    const titles = [...cols.querySelectorAll('.svc-col-title')];
    const cards = columns.flat();
    if (!cards.length) return;
    cols.classList.add('svc-board');
    cards.forEach((btn) => btn.insertAdjacentHTML('afterbegin', '<svg class="svc-shape" aria-hidden="true"><path/></svg>'));

    const draw = (btn, e) => {
      const w = btn.offsetWidth, h = btn.offsetHeight;
      const svg = btn.firstChild;
      svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`);
      Object.assign(svg.style, { left: `${-pad}px`, top: `${-pad}px`, width: `${w + 2 * pad}px`, height: `${h + 2 * pad}px` });
      svg.firstChild.setAttribute('d', boardPieceD(w, h, e));
    };
    const layout = () => {
      if (!cards[0].offsetWidth) return; // a hidden tab (LinkedIn for companies): drawn when it shows
      [...cards, ...titles].forEach((el) => { el.style.minHeight = ''; });
      const sideBySide = lists.length === 2 && Math.abs(lists[0].getBoundingClientRect().top - lists[1].getBoundingClientRect().top) < 30;
      if (sideBySide) {
        if (titles.length === 2) { const th = Math.max(...titles.map((t) => t.offsetHeight)); titles.forEach((t) => { t.style.minHeight = `${th}px`; }); }
        for (let r = 0; r < Math.max(...columns.map((c) => c.length)); r++) {
          const row = columns.map((c) => c[r]).filter(Boolean);
          const rh = Math.max(...row.map((b) => b.offsetHeight));
          row.forEach((b) => { b.style.minHeight = `${rh}px`; });
        }
      }
      // neighbours take turns: one gets the tab, the other the matching blank
      const turn = (odd) => (odd ? 1 : -1);
      columns.forEach((col, c) => col.forEach((btn, r) => {
        const e = { t: 0, r: 0, b: 0, l: 0 };
        if (r > 0) e.t = -turn((r - 1 + c) % 2);
        if (r < col.length - 1) e.b = turn((r + c) % 2);
        const other = sideBySide && columns[1 - c][r];
        if (other) {
          const s = turn(r % 2); // the left-hand piece's tab: out (1) or in (-1)
          if (btn.getBoundingClientRect().left < other.getBoundingClientRect().left) e.r = s; else e.l = -s;
        }
        draw(btn, e);
      }));
    };
    let frame = 0;
    new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; layout(); }); }).observe(cols);
  });
}

/* ---------- Services · the pieces fall into the board as it comes into view ---------- */
function initServiceReveal() {
  const pieces = [...document.querySelectorAll('.svc-group:not(#linkedin) .svc-list li, #li-people .svc-list li')];
  if (!pieces.length || REDUCED) return;
  gsap.set(pieces, { autoAlpha: 0 });
  ScrollTrigger.batch(pieces, {
    start: 'top 92%',
    onEnter: (batch) => gsap.fromTo(batch,
      { y: 60, x: () => gsap.utils.random(-30, 30), rotation: () => gsap.utils.random(-9, 9), autoAlpha: 0 },
      { y: 0, x: 0, rotation: 0, autoAlpha: 1, duration: 0.8, stagger: 0.08, ease: 'back.out(1.4)', overwrite: true, clearProps: 'transform' }),
  });
}

/* ---------- Work · placeholder covers ---------- */
// A stand-in image for a project until its real files arrive: the client's colours, a faint jigsaw grid,
// the client's logo on a tile, and a clear "placeholder" label.
const hashStr = (s) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

// project texts come from the admin panel: always inserted escaped
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// an uploaded image when there is one, otherwise the generated placeholder
const projectImage = (p, src, variant, w, h) => (src
  ? `<img class="cover" src="${escHtml(assetUrl(src))}" alt="${escHtml(p.title)} — ${escHtml(p.client)}" width="${w}" height="${h}" loading="lazy" decoding="async">`
  : coverSVG(p, variant, w, h));

function coverSVG(p, variant = 0, w = 400, h = 300) {
  const R = rng(hashStr(p.id) + variant * 101);
  const gid = `cv-${p.id}-${variant}-${w}x${h}`;
  const size = [80, 100, 66, 120][variant % 4];
  const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
  const hE = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (R() > 0.5 ? 1 : -1)));
  const vE = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (R() > 0.5 ? 1 : -1)));
  let grid = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = { t: r ? -hE[r - 1][c] : 0, b: r < rows - 1 ? hE[r][c] : 0, l: c ? -vE[r][c - 1] : 0, r: c < cols - 1 ? vE[r][c] : 0 };
      grid += `<path d="${jigsawD(e, size, size, c * size, r * size)}"/>`;
    }
  }
  // the logo tile sits somewhere different in each variant
  const tile = Math.min(w, h) * (variant ? 0.3 : 0.36);
  const spots = [[0.5, 0.48], [0.3, 0.42], [0.68, 0.55], [0.5, 0.4]];
  const [fx, fy] = spots[variant % spots.length];
  const tx = w * fx - tile / 2, ty = h * fy - tile / 2;
  const angle = variant ? (R() * 2 - 1) * 8 : 0;
  return `<svg class="cover" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${T('صورة مؤقتة', 'Placeholder image')} — ${escHtml(p.client)}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.colors[0]}"/><stop offset="1" stop-color="${p.colors[1]}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${gid})"/>
    <g fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1.2">${grid}</g>
    <g transform="rotate(${angle.toFixed(1)} ${w * fx} ${h * fy})">
      <rect x="${tx + 6}" y="${ty + 10}" width="${tile}" height="${tile}" rx="${tile * 0.18}" fill="rgba(0,0,0,.25)"/>
      <rect x="${tx}" y="${ty}" width="${tile}" height="${tile}" rx="${tile * 0.18}" fill="#fff"/>
      <image href="${escHtml(assetUrl(p.logo))}" x="${tx + tile * 0.08}" y="${ty + tile * 0.08}" width="${tile * 0.84}" height="${tile * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <g transform="translate(${w - 14} ${h - 14})">
      <rect x="-86" y="-22" width="86" height="22" rx="11" fill="rgba(0,0,0,.35)"/>
      <text x="-43" y="-7" text-anchor="middle" font-family="Alexandria" font-size="10.5" font-weight="600" fill="rgba(255,255,255,.85)">${T('صورة مؤقتة', 'Placeholder')}</text>
    </g>
  </svg>`;
}

const miniArrowPiece = () => {
  const pad = Math.ceil(100 * TAB_DEPTH + 4);
  return `<svg viewBox="${-pad} ${-pad} ${100 + 2 * pad} ${100 + 2 * pad}" aria-hidden="true">
    <path d="${jigsawD({ t: 1, r: 0, b: -1, l: 1 }, 100, 100)}"/>
    <path class="arrow" d="M64 50H34M48 34L32 50l16 16"/>
  </svg>`;
};

/* ---------- Work · the grid, filtered by sector and by type of work ---------- */
// a project's type comes from words in its service tags (either language), so new projects from the
// admin panel sort themselves; `contact` is the service the empty-type message offers in the form.
// The ids are the ones the home page's hero chips link to (work.html?type=…).
const WORK_TYPES = [
  { id: 'identity', name: T('هوية بصرية', 'Visual identity'), words: ['هوية', 'identity'], contact: 'identity' },
  { id: 'social', name: T('سوشال ميديا', 'Social media'), words: ['سوشال', 'social'], contact: 'social-design' },
  { id: 'video', name: T('مونتاج وفيديو', 'Video & editing'), words: ['فيديو', 'موشن', 'مونتاج', 'video', 'motion', 'edit'], contact: 'ad-edit' },
  { id: 'content', name: T('محتوى تسويقي', 'Marketing content'), words: ['محتوى', 'حملة', 'كتابة', 'content', 'campaign', 'copy'], contact: 'copywriting' },
  { id: 'linkedin', name: T('لينكدإن', 'LinkedIn'), words: ['لينكد', 'linkedin'], contact: 'li-profile' },
];
const typesOf = (p) => WORK_TYPES.filter((t) => p.services.some((s) => t.words.some((w) => s.toLowerCase().includes(w)))).map((t) => t.id);

function initWork() {
  const grid = document.querySelector('.work-grid');
  if (!grid || typeof PROJECTS === 'undefined') return;
  grid.innerHTML = PROJECTS.map((p) => `
    <li class="work-item" data-sector="${escHtml(p.sector)}" data-types="${typesOf(p).join(' ')}">
      <a class="work-card" href="project.html?id=${encodeURIComponent(p.id)}">
        <div class="work-cover">${projectImage(p, p.cover, 0, 400, 300)}<span class="work-go">${miniArrowPiece()}</span></div>
        <div class="work-meta">
          <span class="work-client">${escHtml(p.client)}</span>
          <h2 class="work-title">${escHtml(p.title)}</h2>
          <ul class="work-tags">${p.services.map((s) => `<li>${escHtml(s)}</li>`).join('')}</ul>
        </div>
      </a>
    </li>`).join('');

  const items = [...grid.querySelectorAll('.work-item')];
  const chips = [...document.querySelectorAll('.work-filters .chip')];
  chips.forEach((chip) => {
    const f = chip.dataset.filter;
    const label = chip.querySelector('.chip-label'); // the sector names are edited with the projects
    if (label && SECTORS[f]) label.textContent = SECTORS[f];
    chip.querySelector('.chip-count').textContent = f === 'all' ? PROJECTS.length : PROJECTS.filter((p) => p.sector === f).length;
  });

  // the second row: type of work, opened from the home page's chips with ?type=…
  const sectorRow = document.querySelector('.work-filters');
  const typeRow = document.createElement('div');
  typeRow.className = 'work-filters work-types';
  typeRow.setAttribute('role', 'group');
  typeRow.setAttribute('aria-label', T('تصفية حسب نوع العمل', 'Filter by type of work'));
  const typeCount = (id) => PROJECTS.filter((p) => id === 'all' || typesOf(p).includes(id)).length;
  typeRow.innerHTML = `<span class="work-types-label">${T('نوع العمل', 'Type of work')}</span>` + [{ id: 'all', name: T('الكل', 'All') }, ...WORK_TYPES]
    .map((t) => `<button class="chip" type="button" data-type="${t.id}" aria-pressed="false">${escHtml(t.name)} <span class="chip-count">${typeCount(t.id)}</span></button>`).join('');
  sectorRow.after(typeRow);
  const typeChips = [...typeRow.querySelectorAll('.chip')];

  // nothing of a kind published yet: say so, and offer that service in the contact form instead of an empty grid
  const empty = document.createElement('div');
  empty.className = 'work-empty';
  empty.hidden = true;
  grid.after(empty);

  let sector = 'all';
  let type = new URLSearchParams(location.search).get('type');
  if (!WORK_TYPES.some((t) => t.id === type)) type = 'all';
  const show = (it) => (sector === 'all' || it.dataset.sector === sector) && (type === 'all' || it.dataset.types.split(' ').includes(type));

  // filtering: the grid dips out, the cards are swapped, and the ones that stay come back in turn
  const apply = (animate) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === sector)));
    typeChips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === type)));
    const swap = () => {
      items.forEach((it) => it.classList.toggle('is-hidden', !show(it)));
      const t = WORK_TYPES.find((x) => x.id === type);
      empty.hidden = items.some(show);
      if (!empty.hidden) {
        empty.innerHTML = `<p>${t ? T(`لا توجد أعمال منشورة في «${escHtml(t.name)}» هنا بعد — لكنّها من صميم ما نقدّمه.`, `No published “${escHtml(t.name)}” work here yet — but it’s very much what we do.`)
          : T('لا توجد أعمال منشورة هنا بعد.', 'No published work here yet.')}</p>
          <a class="btn btn-primary" href="contact.html${t ? `?services=${t.contact}` : ''}">${T('ابدأ مشروعك', 'Start your project')}</a>`;
      }
      ScrollTrigger.refresh();
    };
    if (!animate || REDUCED) { swap(); return; }
    gsap.to(grid, {
      autoAlpha: 0, y: 12, duration: 0.2, ease: 'power1.in', overwrite: true,
      onComplete: () => {
        swap();
        const visible = items.filter(show);
        gsap.set(grid, { autoAlpha: 1, y: 0 });
        gsap.fromTo(visible, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.05, ease: 'power3.out', overwrite: true });
      },
    });
  };
  chips.forEach((chip) => chip.addEventListener('click', () => { sector = chip.dataset.filter; apply(true); }));
  typeChips.forEach((chip) => chip.addEventListener('click', () => {
    type = chip.dataset.type;
    // the address keeps the type, so the page can be shared or switched to the other language as it is
    const q = type === 'all' ? '' : `?type=${type}`;
    history.replaceState(null, '', location.pathname + q);
    document.querySelectorAll('.lang-switch').forEach((l) => { l.search = q; });
    apply(true);
  }));
  apply(false);

  if (!REDUCED) {
    gsap.set(items, { y: 40, autoAlpha: 0 });
    ScrollTrigger.batch(items, {
      start: 'top 92%',
      onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out', overwrite: true }),
    });
  }
}

/* ---------- Work · one project page (project.html?id=…) ---------- */
function initProject() {
  const page = document.querySelector('.project');
  if (!page || typeof PROJECTS === 'undefined') return;
  const id = new URLSearchParams(location.search).get('id');
  const i = PROJECTS.findIndex((p) => p.id === id);
  if (i < 0) {
    page.querySelector('.project-title').textContent = T('لم نجد هذا المشروع', 'Project not found');
    page.querySelector('.project-summary').innerHTML = T('ربما تغيّر الرابط.', 'The link may have changed.') + ` <a href="work.html">${T('تصفّح كل الأعمال', 'Browse all work')}</a>.`;
    page.querySelector('.project-facts').hidden = true;
    page.querySelector('.project-gallery').hidden = true;
    return;
  }
  const p = PROJECTS[i];
  document.title = `${p.title} — ${p.client} | PuzzleX Media`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', p.summary);

  page.querySelector('.project-logo').innerHTML = `<img src="${escHtml(assetUrl(p.logo))}" alt="${escHtml(p.client)}" width="96" height="96">`;
  page.querySelector('.project-client').textContent = p.client;
  page.querySelector('.project-title').textContent = p.title;
  page.querySelector('.project-summary').textContent = p.summary;
  page.querySelector('.project-sector').textContent = SECTORS[p.sector];
  page.querySelector('.project-services').innerHTML = p.services.map((s) => `<a class="tag" href="services.html">${escHtml(s)}</a>`).join('');
  if (p.year) page.querySelector('.project-year').textContent = p.year;
  else page.querySelector('.project-year-row').remove();

  // gallery: one wide frame, two side by side, one wide again (repeating for more uploaded images)
  const shape = (k) => (k % 3 === 0 ? [800, 450, 'wide'] : [400, 300, '']);
  const frames = p.gallery.length
    ? p.gallery.map((src, k) => [k, ...shape(k), src])
    : [[0, 800, 400, 'wide'], [1, 400, 300, ''], [2, 400, 300, ''], [3, 800, 340, 'wide']];
  page.querySelector('.project-gallery').innerHTML = frames
    .map(([v, w, h, cls, src]) => `<figure class="gallery-item ${cls}">${projectImage(p, src, v, w, h)}</figure>`).join('');

  const prev = PROJECTS[(i - 1 + PROJECTS.length) % PROJECTS.length];
  const next = PROJECTS[(i + 1) % PROJECTS.length];
  page.querySelector('.project-nav').innerHTML = `
    <a class="project-nav-link prev" href="project.html?id=${encodeURIComponent(prev.id)}"><span class="dir">${T('→ المشروع السابق', '← Previous project')}</span><span class="name">${escHtml(prev.title)}</span><span class="who">${escHtml(prev.client)}</span></a>
    <a class="project-nav-link next" href="project.html?id=${encodeURIComponent(next.id)}"><span class="dir">${T('المشروع التالي ←', 'Next project →')}</span><span class="name">${escHtml(next.title)}</span><span class="who">${escHtml(next.client)}</span></a>`;

  if (!REDUCED) {
    gsap.from(page.querySelectorAll('.project-head, .project-summary, .project-facts > div'), { y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out', delay: 0.1 });
    const figs = page.querySelectorAll('.gallery-item');
    gsap.set(figs, { y: 50, autoAlpha: 0 });
    ScrollTrigger.batch(figs, { start: 'top 92%', onEnter: (b) => gsap.to(b, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out' }) });
  }
}

/* ---------- Contact · the form, with the services picked on the services page already in place ---------- */
const SERVICE_GROUPS = [
  { title: T('الإبداعية', 'Creative'), items: [['identity', T('الهوية البصرية', 'Visual identity')], ['social-design', T('السوشال ميديا والإعلانات', 'Social media & ad design')], ['print', T('المطبوعات والإعلانات الطرقية', 'Print & outdoor ads')], ['profiles', T('البروفايلات والعروض', 'Company profiles & decks')], ['ad-edit', T('المونتاج الإعلاني', 'Ad video editing')], ['intro-videos', T('الفيديوهات التعريفية', 'Brand & intro videos')], ['event-videos', T('فيديوهات المناسبات والفعاليات', 'Event videos')], ['ai-ads', T('الإعلانات بالذكاء الاصطناعي', 'AI-made ads')]] },
  { title: T('التسويقية', 'Marketing'), items: [['copywriting', T('كتابة المحتوى التسويقي', 'Marketing copywriting')], ['content-plan', T('خطة المحتوى الشهرية', 'Monthly content plan')], ['community', T('إدارة التفاعل', 'Community management')], ['kpi', T('تحليل الأداء', 'Performance analysis')]] },
  { title: T('لينكدإن', 'LinkedIn'), items: [['li-profile', T('تحسين الحساب', 'Profile optimization')], ['li-content', T('محتوى أسبوعي متخصص', 'Weekly expert content')], ['li-jobs', T('التقديم لفرص العمل', 'Job application support')], ['li-coaching', T('جلسات تدريب شخصية', '1:1 coaching sessions')], ['li-audit', T('تدقيق حساب الشركة', 'Company page audit')], ['li-plan', T('خطة محتوى مؤسسي', 'Corporate content plan')], ['li-talent', T('استقطاب الكفاءات', 'Talent acquisition')], ['li-ads', T('حملات ممولة', 'Paid campaigns')]] },
  { title: T('البرمجية', 'Programming'), items: [['dev-crm', T('أنظمة CRM', 'CRM systems')], ['dev-erp', T('أنظمة ERP', 'ERP systems')], ['dev-pos', T('أنظمة نقاط البيع', 'POS systems')], ['dev-custom', T('أنظمة ولوحات تحكم مخصصة', 'Custom systems & dashboards')], ['dev-automation', T('الأتمتة بالذكاء الاصطناعي (n8n)', 'AI automation (n8n)')], ['dev-landing', T('صفحات الهبوط', 'Landing pages')], ['dev-website', T('المواقع الإلكترونية', 'Websites')], ['dev-store', T('التجارة الإلكترونية', 'E-commerce')], ['dev-app', T('تطبيقات الجوال', 'Mobile apps')]] },
  { title: T('أخرى', 'Other'), items: [['other', T('لست متأكدًا بعد — ساعدوني', 'Not sure yet — help me')]] },
];

function initContact() {
  const form = document.querySelector('.contact-form');
  if (!form) return;
  const KEY = 'puzzlex-services';
  const known = new Set(SERVICE_GROUPS.flatMap((g) => g.items.map(([id]) => id)));
  const PAD = Math.ceil(100 * TAB_DEPTH + 4);
  const box = `${-PAD} ${-PAD} ${100 + 2 * PAD} ${100 + 2 * PAD}`;
  const mini = `<svg class="opt-piece" viewBox="${box}" aria-hidden="true"><path d="${jigsawD({ t: 0, b: 0, l: -1, r: 1 }, 100, 100)}"/></svg>`;

  // picked services: the link from the services page wins, then whatever this tab remembers
  const fromUrl = (new URLSearchParams(location.search).get('services') || '').split(',').filter((id) => known.has(id));
  let stored = [];
  try { stored = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((id) => known.has(id)); } catch (e) { stored = []; }
  const picked = new Set(fromUrl.length ? fromUrl : stored);

  const groupsEl = form.querySelector('.pieces-groups');
  groupsEl.innerHTML = SERVICE_GROUPS.map((g) => `
    <div class="pieces-group">
      <span class="pieces-group-title">${g.title}</span>
      <div class="pieces-opts">${g.items.map(([id, name]) => `
        <button class="piece-opt" type="button" data-id="${id}" aria-pressed="${picked.has(id)}">${mini}<span>${name}</span></button>`).join('')}
      </div>
    </div>`).join('');
  const hint = form.querySelector('.pieces-hint');
  hint.hidden = !picked.size;

  const save = () => {
    try { sessionStorage.setItem(KEY, JSON.stringify([...picked].filter((id) => id !== 'other'))); } catch (e) { /* just not remembered */ }
  };

  // Arabic-Indic (٠–٩) and Persian (۰–۹) digits are ordinary on Arabic keyboards: read them as 0–9
  const latinDigits = (v) => v.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
  const fields = {
    name: { el: form.querySelector('#f-name'), err: form.querySelector('#e-name'), check: (v) => (v.trim().length < 2 ? T('اكتب اسمك من فضلك.', 'Please enter your name.') : '') },
    email: { el: form.querySelector('#f-email'), err: form.querySelector('#e-email'), check: (v) => (!v.trim() ? T('نحتاج بريدك لنعود إليك.', 'We need your email to get back to you.') : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? T('يبدو أن البريد غير مكتمل.', 'That email looks incomplete.') : '') },
    phone: { el: form.querySelector('#f-phone'), err: form.querySelector('#e-phone'), check: (v) => (v.trim() && !/^\+?[\d\s()-]{7,20}$/.test(latinDigits(v.trim())) ? T('اكتب الرقم بالأرقام فقط، مع رمز الدولة إن أمكن.', 'Digits only, with the country code if you can.') : '') },
    message: { el: form.querySelector('#f-message'), err: form.querySelector('#e-message'), check: (v) => (v.trim().length < 10 ? T('أخبرنا بجملة أو جملتين عن مشروعك.', 'Tell us a sentence or two about your project.') : '') },
  };
  const servicesErr = form.querySelector('#e-services');
  const piecesField = form.querySelector('.pieces-field');

  const show = (f, msg) => {
    f.err.textContent = msg;
    f.el.setAttribute('aria-invalid', String(!!msg));
    f.el.closest('.field').classList.toggle('has-error', !!msg);
  };
  const checkServices = () => {
    const msg = picked.size ? '' : T('اختر قطعة واحدة على الأقل، أو «لست متأكدًا بعد».', 'Pick at least one piece, or “Not sure yet”.');
    servicesErr.textContent = msg;
    piecesField.classList.toggle('has-error', !!msg);
    return !msg;
  };
  // errors appear once a field has been left (or on submit), then update live while typing
  Object.values(fields).forEach((f) => {
    f.el.addEventListener('blur', () => { f.touched = true; show(f, f.check(f.el.value)); });
    f.el.addEventListener('input', () => { if (f.touched) show(f, f.check(f.el.value)); });
  });

  // the tray at the bottom collects the picked pieces, like on the services page; it steps aside while the
  // send button is on screen (it would only cover it) and once the message is sent
  const panel = document.querySelector('.my-puzzle');
  const tray = panel && createTray(panel);
  let footInView = false, sent = false;
  const syncTray = (animate) => {
    if (!tray) return;
    tray.render(picked.size);
    tray.setOpen(picked.size > 0 && !footInView && !sent, animate);
  };
  if (tray) {
    new IntersectionObserver(([e]) => { footInView = e.isIntersecting; syncTray(true); }).observe(form.querySelector('.form-foot'));
    panel.querySelector('.my-puzzle-send').addEventListener('click', () => {
      const msg = fields.message.el;
      scrollToEl(msg, 'center');
      msg.focus({ preventScroll: true });
    });
    panel.querySelector('.my-puzzle-clear').addEventListener('click', () => {
      picked.clear();
      groupsEl.querySelectorAll('.piece-opt').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      save();
      syncTray(true);
    });
  }

  groupsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.piece-opt');
    if (!btn) return;
    const id = btn.dataset.id;
    const on = !picked.has(id);
    if (on) picked.add(id); else picked.delete(id);
    btn.setAttribute('aria-pressed', String(on));
    save();
    if (servicesErr.textContent) checkServices();
    syncTray(true);
    if (!on) return;
    if (!REDUCED) gsap.fromTo(btn.querySelector('.opt-piece'), { rotation: -120, scale: 0.4 }, { rotation: 0, scale: 1, duration: 0.5, ease: 'back.out(2)' });
    if (tray && tray.open) tray.land(btn.querySelector('.opt-piece'), picked.size); // plays the click when it lands
    else playClick();
  });

  const done = form.querySelector('.form-done');
  const body = [...form.children].filter((el) => el !== done);
  done.querySelector('.done-piece').innerHTML = `<path d="${jigsawD({ t: 1, r: -1, b: 1, l: -1 }, 100, 100)}"/><path class="tick" d="M28 52l15 15 30-32"/>`;

  const celebrate = () => {
    const h = form.offsetHeight;
    body.forEach((el) => { el.hidden = true; });
    done.hidden = false;
    playClick();
    scrollToEl(form);
    if (REDUCED) return;
    gsap.fromTo(form, { minHeight: h }, { minHeight: 0, duration: 0.6, ease: 'power2.inOut', clearProps: 'minHeight' });
    gsap.from(done.querySelector('.done-piece'), { y: -160, rotation: -200, scale: 0.4, duration: 0.9, ease: 'bounce.out' });
    gsap.from(done.querySelectorAll('h2, p, .done-again'), { y: 20, autoAlpha: 0, duration: 0.5, stagger: 0.08, delay: 0.5, ease: 'power3.out' });
    // little pieces burst outwards when the big one lands
    const burst = done.querySelector('.done-burst');
    burst.innerHTML = Array.from({ length: 14 }, () => mini).join('');
    [...burst.children].forEach((p, i) => {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, d = 110 + Math.random() * 120;
      gsap.fromTo(p, { x: 0, y: 0, scale: 0.3, rotation: 0, autoAlpha: 1 },
        { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, rotation: (Math.random() * 2 - 1) * 360, scale: 0.5 + Math.random() * 0.6, autoAlpha: 0, duration: 1.2 + Math.random() * 0.5, delay: 0.55, ease: 'power3.out' });
    });
  };

  const sendBtns = [...form.querySelectorAll('.form-submit')];
  const formError = form.querySelector('.form-error');
  let sending = false;

  // everything they filled in, as a WhatsApp message to our number (data-wa, set by the server from the admin panel)
  const serviceNames = new Map(SERVICE_GROUPS.flatMap((g) => g.items));
  const whatsappUrl = (number) => {
    const val = (id) => form.querySelector(id).value.trim();
    const lines = [
      T('مرحبًا PuzzleX Media 👋 طلب جديد من الموقع:', 'Hi PuzzleX Media 👋 A new request from the website:'), '',
      `${T('الاسم', 'Name')}: ${val('#f-name')}`,
      val('#f-company') ? `${T('الشركة', 'Company')}: ${val('#f-company')}` : null,
      `${T('البريد', 'Email')}: ${val('#f-email')}`,
      val('#f-phone') ? `${T('الهاتف', 'Phone')}: ${latinDigits(val('#f-phone'))}` : null, '',
      `${T('القطع المطلوبة', 'Pieces needed')}:`, ...[...picked].map((id) => `• ${serviceNames.get(id)}`), '',
      `${T('الرسالة', 'Message')}:`, val('#f-message'),
    ].filter((l) => l !== null);
    return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (sending) return;
    const waBtn = ev.submitter && ev.submitter.dataset.via === 'whatsapp' ? ev.submitter : null;
    formError.textContent = '';
    let firstBad = null;
    Object.values(fields).forEach((f) => {
      f.touched = true;
      const msg = f.check(f.el.value);
      show(f, msg);
      if (msg && !firstBad) firstBad = f.el;
    });
    if (!checkServices() && !firstBad) firstBad = groupsEl.querySelector('.piece-opt');
    if (firstBad) {
      firstBad.focus({ preventScroll: true });
      scrollToEl(firstBad, 'center');
      if (!REDUCED) gsap.fromTo(form.querySelector('.send-ways'), { x: 0 }, { x: 8, duration: 0.07, repeat: 5, yoyo: true, ease: 'sine.inOut', clearProps: 'x' });
      return;
    }
    // WhatsApp: a tab opened after the await below would be blocked as a pop-up, so open it now and
    // point it at the chat once the message is saved
    const waUrl = waBtn && whatsappUrl(waBtn.dataset.wa);
    const waTab = waBtn && window.open('', '_blank');
    if (waTab) waTab.opener = null;
    // send it to the site's own server (server.js → POST /api/contact): saved for the admin panel, emailed to
    // the team, and the sender gets the "within 48 hours" confirmation email
    sending = true;
    const busyBtn = waBtn || ev.submitter || sendBtns[0];
    sendBtns.forEach((b) => { b.disabled = true; });
    busyBtn.setAttribute('aria-busy', 'true');
    let data = {};
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name.el.value, company: form.querySelector('#f-company').value, email: fields.email.el.value,
          phone: latinDigits(fields.phone.el.value), message: fields.message.el.value, services: [...picked],
          website: form.querySelector('[name="website"]').value, lang: EN ? 'en' : 'ar', channel: waBtn ? 'whatsapp' : 'email',
        }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || String(res.status));
    } catch (err) {
      // on WhatsApp the message itself goes through the chat, so a failed save doesn't stop it
      if (!waBtn) {
        formError.textContent = err.message === 'rate'
          ? T('أرسلت عدة رسائل خلال وقت قصير. حاول مرة أخرى بعد بضع دقائق.', 'You’ve sent several messages in a short time. Please try again in a few minutes.')
          : T('تعذّر إرسال رسالتك الآن. حاول مرة أخرى بعد قليل.', 'We couldn’t send your message just now. Please try again shortly.');
        data = null;
      }
    } finally {
      sending = false;
      sendBtns.forEach((b) => { b.disabled = false; });
      busyBtn.removeAttribute('aria-busy');
    }
    if (!data) return;
    if (waBtn) {
      if (waTab) waTab.location.href = waUrl;
      else window.location.href = waUrl; // pop-ups blocked: go to the chat in this tab
    }
    done.querySelectorAll('.done-name').forEach((b) => { b.textContent = fields.name.el.value.trim().split(/\s+/)[0]; });
    done.querySelector('.done-via-email').hidden = !!waBtn;
    done.querySelector('.done-via-whatsapp').hidden = !waBtn;
    done.querySelector('.done-confirmed').hidden = !data.confirmed;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing to forget */ }
    sent = true;
    syncTray(true);
    celebrate();
  });

  done.querySelector('.done-again').addEventListener('click', () => {
    form.reset();
    formError.textContent = '';
    Object.values(fields).forEach((f) => { f.touched = false; show(f, ''); });
    done.hidden = true;
    body.forEach((el) => { el.hidden = false; });
    hint.hidden = !picked.size;
    sent = false;
    syncTray(false);
    fields.name.el.focus();
  });

  if (!REDUCED) {
    gsap.from('.contact-form > .form-row, .contact-form > .field, .contact-form > .form-foot', { y: 30, autoAlpha: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', delay: 0.15 });
    gsap.from('.contact-card', { y: 30, autoAlpha: 0, duration: 0.8, ease: 'power3.out', delay: 0.35 });
  }
}

/* ---------- 404 · a 3×3 board with its centre missing; click the stray piece to put it back ---------- */
function initLost() {
  const wrap = document.querySelector('.lost-board');
  if (!wrap) return;
  const U = 100, PAD = 40;
  const H = [[-1, -1, 1], [1, 1, -1]], V = [[1, -1], [-1, 1], [1, -1]]; // the centre has a tab on every side
  const edges = (r, c) => ({ t: r ? -H[r - 1][c] : 0, b: r < 2 ? H[r][c] : 0, l: c ? -V[r][c - 1] : 0, r: c < 2 ? V[r][c] : 0 });
  let tiles = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (r !== 1 || c !== 1) tiles += `<path class="tile" d="${jigsawD(edges(r, c), U, U, c * U, r * U)}"/>`;
  }
  const hole = jigsawD(edges(1, 1), U, U, U, U);
  wrap.innerHTML = `<svg viewBox="${-PAD} ${-PAD} ${300 + 2 * PAD} ${300 + 2 * PAD}" aria-hidden="false">
    ${tiles}<path class="hole" d="${hole}"/>
    <g class="lost-piece" role="button" tabindex="0" aria-label="${T('أعد القطعة إلى مكانها', 'Put the piece back')}">
      <path d="${hole}"/><text x="150" y="152" text-anchor="middle" dominant-baseline="middle">?</text>
    </g></svg>`;

  const piece = wrap.querySelector('.lost-piece');
  const hint = document.querySelector('.lost-hint');
  // the stray piece rests off the board's corner, tilted
  const away = { x: EN ? 150 : -150, y: -150, r: EN ? 24 : -24 };
  // tween a plain object and write the SVG transform ourselves: rotating about the hole's centre stays exact
  const pos = { ...away };
  const draw = () => piece.setAttribute('transform', `translate(${pos.x} ${pos.y}) rotate(${pos.r} 150 150)`);
  draw();
  const float = () => (REDUCED ? null : gsap.to(pos, { y: away.y - 8, r: away.r + (EN ? 3 : -3), duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: draw }));
  float();

  let home = false;
  const toggle = () => {
    home = !home;
    gsap.killTweensOf(pos);
    gsap.to(pos, home
      ? { x: 0, y: 0, r: 0, duration: REDUCED ? 0 : 0.7, ease: 'back.out(1.4)', onUpdate: draw, onComplete: playClick }
      : { ...away, duration: REDUCED ? 0 : 0.6, ease: 'power3.out', onUpdate: draw, onComplete: float });
    piece.querySelector('text').textContent = home ? '✓' : '?';
    if (hint) hint.textContent = home
      ? T('هكذا أفضل. لكن الصفحة التي طلبتها ما زالت غير موجودة — جرّب أحد الروابط.', 'Much better. The page you asked for still isn’t here, though — try one of these links.')
      : T('اضغط القطعة لتعيدها إلى مكانها.', 'Click the piece to put it back.');
  };
  piece.addEventListener('click', toggle);
  piece.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
}

/* ---------- Feedback · the score counts up, long quotes fold, the cards drop into the wall like pieces, filters ---------- */
function initFeedback() {
  const score = document.querySelector('.fb-score');
  if (score && !REDUCED) {
    const num = score.querySelector('[data-count-to]');
    const to = parseFloat(num.dataset.countTo);
    const decimals = num.dataset.countTo.includes('.') ? 1 : 0;
    const counter = { v: 0 };
    num.textContent = (0).toFixed(decimals);
    const tl = gsap.timeline({ paused: true })
      .from(score, { y: 34, autoAlpha: 0, duration: 0.7, ease: 'power3.out' })
      .to(counter, { v: to, duration: 1.5, ease: 'power2.out', onUpdate: () => { num.textContent = counter.v.toFixed(decimals); } }, '<0.2');
    const fill = score.querySelector('.fb-stars-fill');
    if (fill) tl.fromTo(fill, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.5, ease: 'power2.out' }, '<');
    const bars = score.querySelectorAll('.fb-bar b');
    if (bars.length) tl.from(bars, { scaleX: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }, '<0.2');
    // after the loading screen, when there is one
    if (document.documentElement.classList.contains('is-loading')) document.addEventListener('loaderdone', () => tl.play(), { once: true });
    else tl.play();
  }

  // long quotes fold after nine lines, with "read more" (here and in the home page's section)
  const readMore = T('اقرأ المزيد', 'Read more'), readLess = T('عرض أقل', 'Show less');
  document.querySelectorAll('.fb-wall .tm-card, .tm-list .tm-card').forEach((card) => {
    const quote = card.querySelector('.tm-quote');
    quote.classList.add('is-clamped');
    if (quote.scrollHeight - quote.clientHeight < 4) { quote.classList.remove('is-clamped'); return; }
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tm-more';
    more.textContent = readMore;
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      const open = !quote.classList.toggle('is-clamped');
      more.textContent = open ? readLess : readMore;
      more.setAttribute('aria-expanded', String(open));
      ScrollTrigger.refresh();
    });
    quote.after(more);
  });

  const wall = document.querySelector('.fb-wall');
  if (!wall) return;
  const cards = [...wall.querySelectorAll('.tm-card')];

  // a card falls in tilted, straightens, and its edge flashes as it clicks into place
  const revealed = new WeakSet();
  const drop = (batch) => {
    batch.forEach((c) => revealed.add(c));
    gsap.fromTo(batch, { y: 70, rotation: () => gsap.utils.random(-7, 7), scale: 0.94, autoAlpha: 0 }, {
      y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.85, ease: 'back.out(1.5)', overwrite: true,
      stagger: { each: 0.07, onComplete() { const c = this.targets()[0]; c.classList.remove('snap'); void c.offsetWidth; c.classList.add('snap'); } },
    });
  };
  cards.forEach((c) => c.addEventListener('animationend', () => c.classList.remove('snap')));
  if (!REDUCED) {
    gsap.set(cards, { autoAlpha: 0 });
    ScrollTrigger.batch(cards, { start: 'top 94%', onEnter: (batch) => drop(batch.filter((c) => !revealed.has(c))) });
  }

  const chips = [...document.querySelectorAll('.fb-filters .chip')];
  const matches = (card, filter) => filter === 'all' || (filter === 'media' ? card.hasAttribute('data-media') : card.dataset.rating === filter);
  const apply = (filter) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
    const swap = () => {
      cards.forEach((c) => c.classList.toggle('is-hidden', !matches(c, filter)));
      ScrollTrigger.refresh();
    };
    if (REDUCED) { swap(); return; }
    gsap.to(wall, {
      autoAlpha: 0, y: 12, duration: 0.2, ease: 'power1.in', overwrite: true,
      onComplete: () => {
        swap();
        gsap.set(wall, { autoAlpha: 1, y: 0 });
        // the first screenful drops in again; the rest are simply there
        const shown = cards.filter((c) => matches(c, filter));
        gsap.set(shown.slice(9), { autoAlpha: 1, y: 0, rotation: 0, scale: 1 });
        shown.slice(9).forEach((c) => revealed.add(c));
        drop(shown.slice(0, 9));
      },
    });
  };
  chips.forEach((chip) => chip.addEventListener('click', () => apply(chip.dataset.filter)));
}

/* ---------- Feedback · the images clients shared, full screen (home page and feedback page) ---------- */
function initFeedbackViewer() {
  if (!document.querySelector('.tm-shot')) return;
  let box = null, img, count, caption, prev, next, shots = [], at = 0, opener = null;
  const root = document.documentElement;

  const build = () => {
    box = document.createElement('dialog');
    box.className = 'fb-lightbox';
    box.setAttribute('aria-label', T('عارض الصور', 'Image viewer'));
    box.setAttribute('data-lenis-prevent', '');
    box.innerHTML = `
      <div class="fb-lb-top"><span class="fb-lb-count"></span><button class="fb-lb-btn fb-lb-close" type="button">✕</button></div>
      <div class="fb-lb-stage">
        <button class="fb-lb-btn fb-lb-nav fb-lb-prev" type="button">${EN ? '←' : '→'}</button>
        <img alt="">
        <button class="fb-lb-btn fb-lb-nav fb-lb-next" type="button">${EN ? '→' : '←'}</button>
      </div>
      <p class="fb-lb-caption"></p>`;
    img = box.querySelector('img');
    count = box.querySelector('.fb-lb-count');
    caption = box.querySelector('.fb-lb-caption');
    prev = box.querySelector('.fb-lb-prev');
    next = box.querySelector('.fb-lb-next');
    box.querySelector('.fb-lb-close').setAttribute('aria-label', T('إغلاق', 'Close'));
    prev.setAttribute('aria-label', T('الصورة السابقة', 'Previous image'));
    next.setAttribute('aria-label', T('الصورة التالية', 'Next image'));
    box.querySelector('.fb-lb-close').addEventListener('click', () => box.close());
    prev.addEventListener('click', () => show(at - 1, -1));
    next.addEventListener('click', () => show(at + 1, 1));
    // a click on the dark area around the image closes it
    box.addEventListener('click', (ev) => { if (ev.target === box || ev.target.classList.contains('fb-lb-stage')) box.close(); });
    box.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      const forward = (ev.key === 'ArrowRight') === EN; // right is "next" in English, "previous" in Arabic
      show(at + (forward ? 1 : -1), forward ? 1 : -1);
    });
    // swipe: towards the reading direction's start is "next"
    let x0 = null;
    box.addEventListener('pointerdown', (ev) => { x0 = ev.clientX; });
    box.addEventListener('pointerup', (ev) => {
      if (x0 === null) return;
      const dx = ev.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 50 || shots.length < 2) return;
      const forward = EN ? dx < 0 : dx > 0;
      show(at + (forward ? 1 : -1), forward ? 1 : -1);
    });
    box.addEventListener('close', () => {
      root.classList.remove('view-lock');
      if (opener) opener.focus();
    });
    document.body.append(box);
  };

  function show(i, dir = 0) {
    at = (i + shots.length) % shots.length;
    const shot = shots[at];
    img.src = shot.href;
    img.alt = shot.querySelector('img').alt;
    count.textContent = shots.length > 1 ? `${at + 1} / ${shots.length}` : '';
    prev.hidden = next.hidden = shots.length < 2;
    if (!REDUCED) gsap.fromTo(img, { autoAlpha: 0, x: dir * (EN ? 40 : -40), scale: dir ? 1 : 0.94 }, { autoAlpha: 1, x: 0, scale: 1, duration: 0.45, ease: 'power3.out', overwrite: true });
  }

  document.addEventListener('click', (ev) => {
    const shot = ev.target.closest('.tm-shot');
    if (!shot || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return; // new tab still works
    ev.preventDefault();
    if (!box) build();
    const card = shot.closest('.tm-card');
    shots = [...card.querySelectorAll('.tm-shot')];
    opener = shot;
    const name = card.querySelector('figcaption b'), role = card.querySelector('figcaption small');
    caption.replaceChildren();
    if (name) caption.append(Object.assign(document.createElement('b'), { textContent: name.textContent }));
    if (role) caption.append(` · ${role.textContent}`);
    root.classList.add('view-lock');
    box.showModal();
    show(shots.indexOf(shot));
  });
}

/* ---------- boot ---------- */
(async function initPages() {
  await document.fonts.ready;
  initTray();
  initReasons();
  initVision();
  initServiceHero();
  initServicePicker();
  initSegmented();
  initServiceBoard();
  initServiceReveal();
  initWork();
  initProject();
  initFeedback();
  initFeedbackViewer();
  initContact();
  initLost();
  ScrollTrigger.refresh();
})();
