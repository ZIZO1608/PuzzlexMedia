/* PuzzleX — values + partners sections.
   Shares helpers defined in main.js: $, rng, piecePath, TAB_DEPTH, DPR, LIME, REDUCED, loadImage, playClick. */

/* ---------- Values: the star's marked tip turns to each value ---------- */
function initValues() {
  const sec = $('.values');
  const items = [...sec.querySelectorAll('.value')];
  const labels = [...sec.querySelectorAll('.orbit-label')];
  const star = sec.querySelector('.star-rot');

  let current = -1;
  const setActive = (i) => {
    if (i === current) return;
    current = i;
    items.forEach((el, k) => el.classList.toggle('is-active', k === i));
    labels.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.i) === i));
  };
  setActive(0);

  // click a value — or anywhere around the star — and the star turns there.
  // It scrolls to that value's stretch of the section, so star, text and scroll stay in step.
  let goTo = setActive;
  const orbit = sec.querySelector('.orbit');
  orbit.addEventListener('click', (ev) => {
    const label = ev.target.closest('.orbit-label');
    if (label) { goTo(Number(label.dataset.i)); return; }
    const r = orbit.getBoundingClientRect();
    const ang = Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
    goTo((((Math.round(ang / (Math.PI / 2))) % 4) + 4) % 4); // right 0 · bottom 1 · left 2 · top 3
  });
  labels.forEach((label) => {
    label.setAttribute('role', 'button');
    label.tabIndex = 0;
    label.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goTo(Number(label.dataset.i)); }
    });
  });
  if (REDUCED) return;

  // tip starts on the right (الإبداع) and turns clockwise: bottom → left → top
  gsap.set(star, { svgOrigin: '0 0', rotation: 90 });
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.8,
      onUpdate: (self) => {
        setActive(Math.min(3, Math.floor(self.progress * 4)));
      },
    },
  });
  [180, 270, 360].forEach((rotation, k) => tl.to(star, { rotation, duration: 0.6, ease: 'power2.inOut' }, k + 0.7));
  tl.to({}, { duration: 0.01 }, 4);

  goTo = (i) => {
    const st = tl.scrollTrigger;
    window.scrollTo({ top: st.start + (st.end - st.start) * ((i + 0.5) / 4), behavior: 'smooth' });
  };
}

/* ---------- Partners: logos assemble into one puzzle, the centre piece is "yours" ---------- */
// the logos come from the admin panel (window.SITE.partners: { src, name } in puzzle order); the grid is the smallest odd
// square that holds them all around the centre piece: 7×7 for 48 logos, 5×5 for up to 24, 9×9 for up to 80
const PARTNERS = SITE.partners && SITE.partners.length
  ? SITE.partners
  : Array.from({ length: 48 }, (_, i) => ({ src: `assets/partners/p${String(i + 1).padStart(2, '0')}.webp`, name: '' }));
const assetUrl = (src) => (/^(\/|https?:)/.test(src) ? src : ROOT + src);
let GRID = 7;
let partnerImgs = [];
let pctx = null;
let partnerLastT = 0;

function pieceCanvas(size, pad, e, paint) {
  const cw = size + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(cw * DPR);
  cv.height = Math.round(cw * DPR);
  cv.style.width = cv.style.height = cw + 'px';
  const g = cv.getContext('2d');
  g.scale(DPR, DPR);
  g.translate(pad, pad);
  g.beginPath();
  piecePath(g, 0, 0, size, size, e, size);
  paint(g);
  // the canvas only reacts inside the piece's outline, not in the square around it
  cv.style.clipPath = `path('${piecePathD(e, size, pad, pad)}')`;
  return cv;
}

// The part of a piece's body that no cut-in reaches: sides with a cut-in are inset by its full depth,
// sides with a tab (or a flat edge) only by a small margin.
function safeRect(e, size, margin = 0.08) {
  const cut = TAB_DEPTH + 0.05;
  const l = (e.l < 0 ? cut : margin) * size;
  const r = size - (e.r < 0 ? cut : margin) * size;
  const t = (e.t < 0 ? cut : margin) * size;
  const b = size - (e.b < 0 ? cut : margin) * size;
  return { x: l, y: t, w: r - l, h: b - t };
}

// scale a box to sit entirely inside a rect, centred
function fitInto(box, rect) {
  const s = Math.min(rect.w / box.w, rect.h / box.h);
  const w = box.w * s, h = box.h * s;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

// the visible extent of a logo image (its tile has empty margins), in image pixels
function trimBox(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: width, h: height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function paintLogo(img, size, e) {
  return (g) => {
    g.fillStyle = '#ffffff';
    g.fill();
    if (!img) { g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.22)'; g.stroke(); return; } // a slot with no logo yet
    const box = img._box || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const f = fitInto(box, safeRect(e, size));
    g.save();
    g.clip();
    g.drawImage(img, box.x, box.y, box.w, box.h, f.x, f.y, f.w, f.h);
    g.restore();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.22)';
    g.stroke();
  };
}

function paintKey(size) {
  return (g) => {
    g.fillStyle = LIME;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.stroke();
    g.fillStyle = '#0a0a0b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = T('rtl', 'ltr');
    // sized to sit inside the body with a margin (the piece has tabs on every side, no cut-ins)
    let fs = size * 0.22;
    g.font = `800 ${fs}px Alexandria`;
    while (g.measureText(T('مكانك', 'YOUR')).width > size * 0.72 && fs > 6) g.font = `800 ${(fs -= 0.5)}px Alexandria`;
    g.fillText(T('مكانك', 'YOUR'), size / 2, size * 0.39);
    g.fillText(T('هنا', 'SPOT'), size / 2, size * 0.65);
  };
}

function paintSlot(g) {
  g.fillStyle = 'rgba(215,255,0,.06)';
  g.fill();
  g.setLineDash([4, 5]);
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(215,255,0,.8)';
  g.stroke();
}

function buildPartners() {
  if (pctx) pctx.revert();
  const sec = $('.partners');
  const board = sec.querySelector('.partners-board');
  board.innerHTML = '';
  board.classList.remove('done');

  const vw = window.innerWidth, vh = window.innerHeight;
  const mobile = vw < 760;
  // leave room for the frame moulding, the mat and the hanging wire above it
  const frame = sec.querySelector('.partners-frame');
  const mat = sec.querySelector('.partners-mat');
  const extra = 2 * (parseFloat(getComputedStyle(frame).paddingLeft) + parseFloat(getComputedStyle(mat).paddingLeft));
  const wire = mobile ? 30 : 48;
  const fit = Math.min((mobile ? vw * 0.9 : vw * 0.46) - extra, (mobile ? vh * 0.48 : vh * 0.76) - extra - wire, 680);
  const size = Math.floor(fit / GRID);
  const W = size * GRID;
  board.style.width = board.style.height = W + 'px';
  const pad = Math.ceil(size * TAB_DEPTH + 4);

  const R = rng(77);
  const hE = Array.from({ length: GRID - 1 }, () => Array.from({ length: GRID }, () => (R() > 0.5 ? 1 : -1)));
  const vE = Array.from({ length: GRID }, () => Array.from({ length: GRID - 1 }, () => (R() > 0.5 ? 1 : -1)));
  const keyIdx = Math.floor((GRID * GRID) / 2);
  // the centre piece gets a tab on all four sides (its neighbours get the matching cut-ins),
  // so its whole body is solid and the "مكانك هنا" text never runs into a hole
  const kr = Math.floor(keyIdx / GRID), kc = keyIdx % GRID;
  hE[kr - 1][kc] = -1; // top edge sticks up
  hE[kr][kc] = 1; // bottom edge sticks down
  vE[kr][kc - 1] = -1; // left edge sticks out
  vE[kr][kc] = 1; // right edge sticks out

  const edgesAt = (r, c) => ({
    t: r === 0 ? 0 : -hE[r - 1][c],
    b: r === GRID - 1 ? 0 : hE[r][c],
    l: c === 0 ? 0 : -vE[r][c - 1],
    r: c === GRID - 1 ? 0 : vE[r][c],
  });

  // Give each logo the piece where it can be largest: the most stretched logos pick first,
  // each taking the free slot whose cut-in-free area fits its shape best (wide logos → side tabs, etc.).
  const assigned = new Map();
  const freeSlots = [];
  for (let i = 0; i < GRID * GRID; i++) if (i !== keyIdx) freeSlots.push({ i, rect: safeRect(edgesAt(Math.floor(i / GRID), i % GRID), 1) });
  const fitArea = (box, rect) => { const f = fitInto(box, rect); return f.w * f.h; };
  [...partnerImgs]
    .sort((a, b) => Math.abs(Math.log(b._box.w / b._box.h)) - Math.abs(Math.log(a._box.w / a._box.h)))
    .forEach((img) => {
      let best = 0;
      freeSlots.forEach((s, k) => { if (fitArea(img._box, s.rect) > fitArea(img._box, freeSlots[best].rect)) best = k; });
      assigned.set(freeSlots[best].i, img);
      freeSlots.splice(best, 1);
    });

  const pieces = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const e = edgesAt(r, c);
      const isKey = r * GRID + c === keyIdx;
      const place = (el) => {
        el.style.left = c * size - pad + 'px';
        el.style.top = r * size - pad + 'px';
        board.appendChild(el);
      };
      if (isKey) {
        const slot = pieceCanvas(size, pad, e, paintSlot);
        slot.className = 'pp-slot';
        slot.style.position = 'absolute';
        place(slot);
      }
      const img = isKey ? null : assigned.get(r * GRID + c);
      const el = document.createElement('div');
      el.className = isKey ? 'pp key' : 'pp';
      el._pp = { e, img, isKey, size, pad }; // what the pop-up needs to redraw this piece large
      if (img && img._name) el.title = img._name; // the partner's name (admin panel) on hover
      const inner = document.createElement('div');
      inner.className = 'inner';
      inner.appendChild(pieceCanvas(size, pad, e, isKey ? paintKey(size) : paintLogo(img, size, e)));
      el.appendChild(inner);
      place(el);
      pieces.push({ el, isKey });
    }
  }

  const key = pieces.find((p) => p.isKey);
  const slot = board.querySelector('.pp-slot');

  if (REDUCED) {
    board.classList.add('done');
    gsap.set(slot, { autoAlpha: 0 });
    return;
  }

  pctx = gsap.context(() => {
    const R2 = rng(5);
    const far = Math.hypot(vw, vh);
    for (const p of pieces) {
      const ang = R2() * Math.PI * 2;
      const rad = far * (0.35 + R2() * 0.35);
      gsap.set(p.el, { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, rotation: (R2() * 2 - 1) * 120, scale: 0.6 + R2() * 0.3, autoAlpha: 0 });
    }

    const SNAP = 3.9;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: sec, start: 'top 70%', end: 'bottom bottom', scrub: 1 },
      // per rendered frame of the smoothed timeline, not per scroll event
      onUpdate: () => {
          const t = tl.time();
          if (partnerLastT < SNAP && t >= SNAP) {
            playClick();
            frame.classList.remove('nudge');
            void frame.offsetWidth; // restart the swing
            frame.classList.add('nudge');
          }
          partnerLastT = t;
          board.classList.toggle('done', t >= SNAP);
      },
    });

    const others = pieces.filter((p) => !p.isKey).sort(() => R2() - 0.5);
    others.forEach((p, k) => {
      tl.to(p.el, { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 0.9, ease: 'power3.out' }, (k / others.length) * 2.6);
    });
    // the last piece hovers in, then drops into the centre
    tl.fromTo(key.el, { x: 0, y: -size * 1.8, rotation: -18, scale: 1.9, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 2.9);
    tl.to(key.el, { y: -size * 1.5, rotation: -10, duration: 0.4, ease: 'sine.inOut' }, 2.9);
    tl.to(key.el, { y: 0, rotation: 0, scale: 1, duration: 0.6, ease: 'power3.in' }, SNAP - 0.6);
    tl.to(slot, { autoAlpha: 0, duration: 0.1 }, SNAP - 0.05);
    tl.fromTo('.partners-cta', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, SNAP + 0.05);
    tl.to({}, { duration: 0.6 }, SNAP + 0.5);
    partnerLastT = tl.time();
  });
}

/* ---------- Partner piece pop-up: a thick 3D piece you can spin, then it flies home ---------- */
const POP_UNIT = 100; // piece body size in SVG units
const POP_DEPTH = 6; // piece thickness, in the same units
const SVG_NS = 'http://www.w3.org/2000/svg';
let popMark = null; // the X mark, read once from assets/icon.svg and drawn as vector on the back

async function loadPopMark() {
  try {
    const doc = new DOMParser().parseFromString(await (await fetch(ROOT + 'assets/icon.svg')).text(), 'image/svg+xml');
    // keep the X and its star, drop the lime tile (the back is already lime)
    const paths = [...doc.querySelectorAll('path')].map((p) => `<path d="${p.getAttribute('d')}" fill="${p.getAttribute('fill') || '#0a0a0b'}"/>`);
    popMark = { viewBox: doc.documentElement.getAttribute('viewBox'), inner: paths.join('') };
  } catch {
    popMark = null;
  }
}

// the jigsaw outline as SVG path data, traced with the same piecePath() the canvases use
function piecePathD(e, size = POP_UNIT, ox = 0, oy = 0) {
  let d = '';
  const n = (v) => +v.toFixed(2);
  const rec = {
    moveTo: (x, y) => { d += `M${n(x)} ${n(y)}`; },
    lineTo: (x, y) => { d += `L${n(x)} ${n(y)}`; },
    bezierCurveTo: (a, b, c, dd, x, y) => { d += `C${n(a)} ${n(b)} ${n(c)} ${n(dd)} ${n(x)} ${n(y)}`; },
    closePath: () => { d += 'Z'; },
  };
  piecePath(rec, ox, oy, size, size, e, size);
  return d;
}

function popSvg(cls, pad, inner) {
  const box = POP_UNIT + pad * 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${box} ${box}`);
  svg.setAttribute('class', cls);
  svg.innerHTML = inner;
  return svg;
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixRgb = (a, b, t, shade = 1) => {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round((v + (B[i] - v) * t) * shade)).join(',')})`;
};

// the logo trimmed to its visible extent and fitted into the piece's safe area (SVG units)
function logoSvg(data) {
  const img = data.img;
  if (!img) return '';
  const box = img._box || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  const f = fitInto(box, safeRect(data.e, POP_UNIT));
  const n = (v) => v.toFixed(2);
  return `<svg x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">
    <image href="${img.src}" width="${img.naturalWidth}" height="${img.naturalHeight}"/></svg>`;
}

// Every face is an SVG laid out at its real on-screen size (no upscaling), so it stays sharp.
function buildPopPiece(data, unit) {
  const pad = Math.ceil(POP_UNIT * TAB_DEPTH + 4);
  const d = piecePathD(data.e);
  const frag = document.createDocumentFragment();
  const depthPx = POP_DEPTH * unit;
  const mirrored = `<g transform="matrix(-1 0 0 1 ${POP_UNIT} 0)">`; // the back is seen through a 180° turn

  // edge: tightly stacked silhouettes, blending from the front colour to the back colour, a touch darker mid-way
  const [frontEdge, backEdge] = data.isKey ? ['#c4e800', '#a9cc00'] : ['#e4e4dc', '#bcdc10'];
  const layers = Math.max(12, Math.min(22, Math.ceil(depthPx / 1.1)));
  for (let i = layers - 1; i >= 1; i--) {
    const k = i / layers; // 0 front … 1 back
    const shade = 1 - 0.16 * (1 - Math.abs(k - 0.5) * 2);
    const layer = popSvg('layer', pad, `<path d="${d}" fill="${mixRgb(frontEdge, backEdge, k, shade)}"/>`);
    layer.style.transform = `translateZ(${(-k * depthPx).toFixed(2)}px)`;
    frag.appendChild(layer);
  }

  // back: lime, with the X mark drawn as vector
  // the back is seen mirrored, so its safe area uses the edges swapped left↔right;
  // the mark + "PUZZLEX" block is scaled to fit inside it
  const backSafe = safeRect({ t: data.e.t, b: data.e.b, l: data.e.r, r: data.e.l }, POP_UNIT);
  const blk = fitInto({ w: 1, h: 1.36 }, { x: backSafe.x + backSafe.w * 0.08, y: backSafe.y + backSafe.h * 0.06, w: backSafe.w * 0.84, h: backSafe.h * 0.88 });
  const markSize = blk.w;
  const textSize = markSize * 0.19;
  const mark = popMark
    ? `<svg x="${blk.x.toFixed(2)}" y="${blk.y.toFixed(2)}" width="${markSize.toFixed(2)}" height="${markSize.toFixed(2)}" viewBox="${popMark.viewBox}">${popMark.inner}</svg>`
    : '';
  const textY = blk.y + markSize * 1.12 + textSize;
  const back = popSvg('back', pad, `
    ${mirrored}<path d="${d}" fill="#d7ff00"/></g>
    ${mark}
    <text x="${(blk.x + markSize / 2).toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle" font-family="Agera Gothic" font-weight="900" font-size="${textSize.toFixed(2)}" fill="#0a0a0b" letter-spacing="${(textSize * 0.06).toFixed(2)}">PUZZLEX</text>
    ${mirrored}<path d="${d}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".4"/></g>`);
  back.style.transform = `translateZ(${(-depthPx).toFixed(2)}px) rotateY(180deg)`;
  frag.appendChild(back);

  // front: the logo face (or "your place" for the key piece) with a soft gloss
  const faceInner = data.isKey
    ? `<path d="${d}" fill="#d7ff00"/>
       <text x="50" y="44" text-anchor="middle" direction="rtl" font-family="Alexandria" font-weight="800" font-size="18" fill="#0a0a0b">${T('مكانك', 'YOUR')}</text>
       <text x="50" y="70" text-anchor="middle" direction="rtl" font-family="Alexandria" font-weight="800" font-size="18" fill="#0a0a0b">${T('هنا', 'SPOT')}</text>`
    : `<path d="${d}" fill="#fff"/>
       ${logoSvg(data)}`;
  const front = popSvg('front', pad, `
    <defs>
      <clipPath id="pop-clip"><path d="${d}"/></clipPath>
      <linearGradient id="pop-gloss" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".08"/>
      </linearGradient>
    </defs>
    ${faceInner}
    <path d="${d}" fill="url(#pop-gloss)"/>
    <path d="${d}" fill="none" stroke="rgba(0,0,0,.16)" stroke-width=".4"/>`);
  frag.appendChild(front);

  return { frag, sidePx: (POP_UNIT + pad * 2) * unit };
}

function initPiecePop() {
  loadPopMark();
  const board = $('.partners-board');
  let open = null; // the pop-up currently shown

  board.addEventListener('click', (ev) => {
    const el = ev.target.closest('.pp');
    if (!el || open || !board.classList.contains('done')) return;
    openPop(el);
  });

  const blockScroll = (ev) => { if (open) ev.preventDefault(); };
  window.addEventListener('wheel', blockScroll, { passive: false });
  window.addEventListener('touchmove', blockScroll, { passive: false });
  window.addEventListener('keydown', (ev) => {
    if (!open) return;
    if (ev.key === 'Escape') open.close();
    else if ([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) ev.preventDefault();
  });

  function openPop(el) {
    const data = el._pp;
    if (!data.img && !data.isKey) return; // empty slot: nothing to show
    const vw = window.innerWidth, vh = window.innerHeight;
    const bodyPx = Math.min(vw * 0.5, vh * 0.46, 400); // on-screen size of the piece body
    const unit = bodyPx / POP_UNIT;
    const { frag, sidePx } = buildPopPiece(data, unit);

    const root = document.createElement('div');
    root.className = 'pp-pop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', (data.img && data.img._name) || T('قطعة شريك نجاح', 'Partner piece'));
    root.innerHTML = `
      <div class="pp-pop-backdrop"></div>
      <div class="pp-pop-shadow"></div>
      <div class="pp-pop-stage"><div class="pp-pop-piece"></div></div>
      <p class="pp-pop-hint">${T('اسحب لتدوير القطعة · اضغط خارجها للرجوع', 'Drag to turn the piece · click outside to go back')}</p>`;
    const obj = root.querySelector('.pp-pop-piece');
    const shadow = root.querySelector('.pp-pop-shadow');
    obj.style.width = obj.style.height = sidePx + 'px';
    obj.style.marginLeft = obj.style.marginTop = -sidePx / 2 + 'px';
    const stack = document.createElement('div');
    stack.className = 'pp-pop-stack';
    stack.style.width = stack.style.height = sidePx + 'px';
    stack.appendChild(frag);
    obj.appendChild(stack);
    document.body.appendChild(root);

    // where the piece sits on the board, relative to the screen centre (FLIP start)
    const from = () => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - window.innerWidth / 2,
        y: r.top + r.height / 2 - window.innerHeight / 2,
        scale: data.size / bodyPx,
      };
    };
    const start = from();
    el.style.visibility = 'hidden';

    const state = { rx: 0, ry: 0, vx: 0, vy: 0, dragging: false, moved: 0, live: false };
    const render = () => gsap.set(obj, { rotationX: state.rx, rotationY: state.ry });

    gsap.set(obj, { x: start.x, y: start.y, scale: start.scale, rotationX: 0, rotationY: 0, z: 0 });
    const intro = gsap.timeline({
      onComplete: () => { state.ry = 0; state.rx = -8; state.live = true; },
    });
    intro.to(root.querySelector('.pp-pop-backdrop'), { opacity: 1, duration: 0.45, ease: 'power1.out' }, 0);
    intro.to(obj, { x: 0, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, 0);
    intro.fromTo(obj, { rotationY: 0, rotationX: 0 }, { rotationY: 360, rotationX: -8, duration: 1.2, ease: 'power2.out' }, 0);
    intro.fromTo(shadow, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'power3.out' }, 0.1);
    intro.to(root.querySelector('.pp-pop-hint'), { opacity: 1, duration: 0.4 }, 0.8);

    // turntable + inertia; drags write straight into the angles
    const tick = () => {
      if (!state.live || state.dragging) return;
      state.ry += state.vy + 0.25 * (1 - Math.min(1, Math.abs(state.vy) / 3));
      state.rx += state.vx;
      state.vx *= 0.94;
      state.vy *= 0.95;
      state.rx += (-8 - state.rx) * 0.02; // settle back to a slight tilt
      render();
    };
    gsap.ticker.add(tick);

    let lastX = 0, lastY = 0;
    obj.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); // no text selection / image drag starting from the piece
      if (!state.live) return;
      state.dragging = true;
      state.moved = 0;
      lastX = ev.clientX; lastY = ev.clientY;
      try { obj.setPointerCapture(ev.pointerId); } catch (e) { /* no live pointer */ }
      obj.classList.add('dragging');
    });
    obj.addEventListener('pointermove', (ev) => {
      if (!state.dragging) return;
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      state.moved += Math.abs(dx) + Math.abs(dy);
      state.vy = dx * 0.45;
      state.vx = -dy * 0.45;
      state.ry += state.vy;
      state.rx = Math.max(-70, Math.min(70, state.rx + state.vx));
      render();
    });
    const endDrag = () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.moved > 6) state.dragEndedAt = performance.now();
      obj.classList.remove('dragging');
    };
    obj.addEventListener('pointerup', endDrag);
    obj.addEventListener('pointercancel', endDrag);

    root.addEventListener('click', (ev) => {
      if (obj.contains(ev.target)) return; // clicks (and drag releases) on the piece itself
      if (performance.now() - (state.dragEndedAt || 0) < 300) return; // a drag that ended off the piece isn't a click outside
      close();
    });

    function close() {
      if (!open || open.closing) return;
      open.closing = true;
      intro.kill();
      state.live = false;
      gsap.ticker.remove(tick);
      const home = from();
      // spin forward to the nearest front-facing turn, then fly back into the slot
      const ry = Math.ceil((state.ry + 60) / 360) * 360;
      const outro = gsap.timeline({
        onComplete: () => {
          el.style.visibility = '';
          root.remove();
          open = null;
          playClick();
        },
      });
      outro.to(root.querySelector('.pp-pop-hint'), { opacity: 0, duration: 0.2 }, 0);
      outro.to(obj, { rotationY: ry, rotationX: 0, duration: 0.85, ease: 'power2.inOut' }, 0);
      outro.to(obj, { x: home.x, y: home.y, scale: home.scale, duration: 0.85, ease: 'power3.inOut' }, 0);
      outro.to(shadow, { opacity: 0, scale: 0.4, duration: 0.6 }, 0);
      outro.to(root.querySelector('.pp-pop-backdrop'), { opacity: 0, duration: 0.6, ease: 'power1.in' }, 0.25);
    }

    open = { close, closing: false };
  }
}

/* ---------- boot ---------- */
async function initSections() {
  // these sections live on the home page only; other pages just reuse the helpers in this file
  if ($('.values')) initValues();
  if (!$('.partners')) return;
  await document.fonts.load('800 20px Alexandria', T('مكانك هنا', 'YOUR SPOT')).catch(() => {});
  // a logo that fails to load is left out rather than breaking the puzzle
  partnerImgs = (await Promise.all(PARTNERS.map((p) => loadImage(assetUrl(p.src)).then((img) => Object.assign(img, { _name: p.name || '' }), () => null)))).filter(Boolean);
  GRID = 3;
  while (GRID * GRID - 1 < partnerImgs.length) GRID += 2;
  for (const img of partnerImgs) img._box = trimBox(img); // so logos can be fitted to the safe area of each piece
  buildPartners();
  initPiecePop();
  ScrollTrigger.refresh();

  let lastW = window.innerWidth, lastH = window.innerHeight, timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 140) return;
      lastW = w; lastH = h;
      buildPartners();
      ScrollTrigger.refresh();
    }, 250);
  });
}

initSections();
