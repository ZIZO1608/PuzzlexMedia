/* PuzzleX Media — puzzle hero concept
   Scroll story: empty board + scattered pieces → scatter → form an "X" → assemble the hero. */

gsap.registerPlugin(ScrollTrigger);

const LIME = '#D7FF00';
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// language: the English pages live in /en/ with <html lang="en">; T() picks the string for the current one,
// or the admin panel's edit of it (window.SITE.texts, keyed by the Arabic + English default — see lib/content.js)
const EN = document.documentElement.lang === 'en';
const SITE = window.SITE || {};
const pickText = (ar, en) => {
  const edit = SITE.texts && SITE.texts[`${ar}␟${en}`];
  return EN ? (edit && edit.en) || en : (edit && edit.ar) || ar;
};
const T = (ar, en) => (Array.isArray(ar) ? ar.map((a, i) => pickText(a, en[i])) : pickText(ar, en));
// asset paths built in JS start here: English pages sit one folder down; the 404 page sets data-root="/"
const ROOT = document.documentElement.dataset.root ?? (EN ? '../' : '');

const $ = (s) => document.querySelector(s);
const stage = $('.stage');
const boardEl = $('.board');
const ghostEl = $('.ghost');
const piecesEl = $('.pieces');
const ctaEl = $('.cta');
const chipLinksEl = $('.chip-links');


let images = {};
let gctx = null;
let heroTl = null; // the current hero timeline (rebuilt on resize / theme change)
let heroPieceSize = 0; // on-screen size of one hero piece; the theme wipe uses the same
let heroDone = Infinity; // timeline time at which the hero picture is complete
let heroFx = {}; // last applied on/off state of the hero's costly layers
const sheenEl = document.querySelector('.sheen');

/* ---------- utils ---------- */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const loadImage = (src) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

/* ---------- jigsaw geometry ---------- */
// One tab edge in unit space: t runs along the edge, h is the bump height. Symmetric around t=0.5,
// so a shared edge drawn from either side traces the same curve.
const TAB = [
  [0.42, 0, 0.43, 0.06, 0.39, 0.12],
  [0.34, 0.2, 0.4, 0.27, 0.5, 0.27],
  [0.6, 0.27, 0.66, 0.2, 0.61, 0.12],
  [0.57, 0.06, 0.58, 0, 0.62, 0],
];
const TAB_DEPTH = 0.27;

function edge(ctx, ax, ay, bx, by, nx, ny, sign, size) {
  if (!sign) { ctx.lineTo(bx, by); return; }
  const dx = bx - ax, dy = by - ay;
  const P = (t, h) => [ax + dx * t + nx * h * sign * size, ay + dy * t + ny * h * sign * size];
  ctx.lineTo(...P(0.38, 0));
  for (const s of TAB) ctx.bezierCurveTo(...P(s[0], s[1]), ...P(s[2], s[3]), ...P(s[4], s[5]));
  ctx.lineTo(bx, by);
}

function piecePath(ctx, x, y, w, h, e, size) {
  ctx.moveTo(x, y);
  edge(ctx, x, y, x + w, y, 0, -1, e.t, size);
  edge(ctx, x + w, y, x + w, y + h, 1, 0, e.r, size);
  edge(ctx, x + w, y + h, x, y + h, 0, 1, e.b, size);
  edge(ctx, x, y + h, x, y, -1, 0, e.l, size);
  ctx.closePath();
}

/* ---------- theme palettes for everything drawn on canvas ---------- */
const PALETTES = {
  dark: {
    bg: '#0c0c0d', glow: 'rgba(215,255,0,.20)', grid: 'rgba(255,255,255,.035)',
    text: '#f4f4f1', muted: 'rgba(244,244,241,.7)', faint: 'rgba(255,255,255,.45)',
    chip: 'rgba(255,255,255,.22)', chipText: 'rgba(244,244,241,.85)',
    ring1: 'rgba(215,255,0,.28)', ring2: 'rgba(255,255,255,.16)', spark: '#fff', sparkAlt: LIME, iconGlow: 'rgba(215,255,0,.45)',
    accentText: LIME, marker: null,
    ghostFill: 'rgba(255,255,255,.025)', ghostLine: 'rgba(255,255,255,.16)', ghostEdge: 'rgba(215,255,0,.6)', ghostTick: LIME,
    windA: '215,255,0', windB: '255,255,255',
  },
  light: {
    bg: '#efefe9', glow: 'rgba(200,240,0,.38)', grid: 'rgba(13,13,14,.05)',
    text: '#0d0d0e', muted: 'rgba(13,13,14,.68)', faint: 'rgba(13,13,14,.45)',
    chip: 'rgba(13,13,14,.25)', chipText: 'rgba(13,13,14,.85)',
    ring1: 'rgba(120,160,0,.45)', ring2: 'rgba(13,13,14,.18)', spark: '#0d0d0e', sparkAlt: '#9cc000', iconGlow: 'rgba(160,200,0,.5)',
    accentText: '#0d0d0e', marker: LIME, // lime text doesn't read on off-white: dark text on a lime highlighter instead
    ghostFill: 'rgba(13,13,14,.03)', ghostLine: 'rgba(13,13,14,.2)', ghostEdge: 'rgba(110,140,0,.75)', ghostTick: '#9cc000',
    windA: '120,160,0', windB: '13,13,14',
  },
};
const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
let PAL = PALETTES[currentTheme()];

// a headline line in the accent colour; on light it gets a lime highlighter under it
function accentLine(ctx, text, x, y, hs, align) {
  if (PAL.marker) {
    const w = ctx.measureText(text).width;
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.save();
    ctx.fillStyle = PAL.marker;
    ctx.beginPath();
    ctx.roundRect(left - hs * 0.08, y + hs * 0.52, w + hs * 0.16, hs * 0.42, hs * 0.08);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = PAL.accentText;
  ctx.fillText(text, x, y);
}

/* ---------- hero artwork (what the finished puzzle shows) ---------- */function sparkle(ctx, cx, cy, r) {
  const k = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + k, cy - k, cx + r, cy);
  ctx.quadraticCurveTo(cx + k, cy + k, cx, cy + r);
  ctx.quadraticCurveTo(cx - k, cy + k, cx - r, cy);
  ctx.quadraticCurveTo(cx - k, cy - k, cx, cy - r);
  ctx.fill();
}

function fitSize(ctx, lines, weight, size, family, maxW) {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (s <= 10 || lines.every((l) => ctx.measureText(l).width <= maxW)) return s;
    s -= 1;
  }
}

function wrap(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

function drawVisual(ctx, cx, cy, size, u, vfScale = 1.25, vfAspect = 0.8) {
  ctx.save();
  // rings
  ctx.strokeStyle = PAL.ring1;
  ctx.lineWidth = Math.max(1, u * 0.18);
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([u * 0.6, u * 1.1]);
  ctx.strokeStyle = PAL.ring2;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.95, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // icon
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-7 * Math.PI / 180);
  ctx.shadowColor = PAL.iconGlow;
  ctx.shadowBlur = size * 0.35;
  ctx.drawImage(images.icon, -size / 2, -size / 2, size, size);
  ctx.restore();

  // sparkles
  ctx.fillStyle = PAL.spark;
  sparkle(ctx, cx + size * 0.78, cy - size * 0.55, size * 0.07);
  sparkle(ctx, cx - size * 0.82, cy + size * 0.48, size * 0.05);
  ctx.fillStyle = PAL.sparkAlt;
  sparkle(ctx, cx - size * 0.7, cy - size * 0.68, size * 0.045);
  sparkle(ctx, cx + size * 0.62, cy + size * 0.7, size * 0.05);
  ctx.restore();
}

// Icon + "PUZZLEX MEDIA" set in Agera, used instead of the logo PNG (whose wordmark is outdated).
function drawBrand(ctx, x, y, h, align) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const fs = h * 0.56;
  ctx.font = `900 ${fs}px "Agera Gothic"`;
  const w1 = ctx.measureText('PUZZLEX').width;
  ctx.font = `400 ${fs}px "Agera Gothic"`;
  const w2 = ctx.measureText(' MEDIA').width;
  const gap = h * 0.32;
  const total = h + gap + w1 + w2;
  const left = align === 'center' ? x - total / 2 : x - total;
  ctx.drawImage(images.icon, left, y, h, h);
  const ty = y + h / 2 + h * 0.04;
  ctx.font = `900 ${fs}px "Agera Gothic"`;
  ctx.fillStyle = PAL.text;
  ctx.fillText('PUZZLEX', left + h + gap, ty);
  ctx.font = `400 ${fs}px "Agera Gothic"`;
  ctx.fillStyle = PAL.marker ? '#5d7400' : LIME;
  ctx.fillText(' MEDIA', left + h + gap + w1, ty);
  ctx.restore();
}

// where a line drawn at `y` (textBaseline 'top', current font) really ends: Arabic letters hang well below the em box
const inkBottom = (ctx, text, y) => y + ctx.measureText(text).actualBoundingBoxDescent;

function drawArt(ctx, W, H, mobile) {
  const u = mobile ? W / 100 : H / 100;

  // background
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);
  const vx = mobile ? W / 2 : W * 0.27;
  const vy = mobile ? H * 0.355 : H * 0.52;
  const glow = ctx.createRadialGradient(vx, vy, 0, vx, vy, mobile ? W * 0.8 : H * 0.75);
  glow.addColorStop(0, PAL.glow);
  glow.addColorStop(1, 'rgba(215,255,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, -H, W, H * 2); // reaches up under the top bar too
  ctx.strokeStyle = PAL.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = mobile ? W / 8 : W / 16;
  for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  const head = T(['نحن', 'القطعة الناقصة', 'في أحجيتك.'], ['We are', 'the missing piece', 'in your puzzle.']);
  const lead = T('قسمك الإبداعي الجاهز.', 'Your ready-made creative department.');
  const sub = T('شريك استراتيجي يفهم السوق الخليجي، ويحوّل أهدافك إلى حلول إبداعية تواكب تطلعاتك.', 'A strategic partner who understands the Gulf market and turns your goals into creative work that keeps up with your ambitions.');
  const chips = T(['هوية بصرية', 'سوشال ميديا', 'مونتاج', 'محتوى تسويقي', 'لينكدإن'], ['Visual identity', 'Social media', 'Video editing', 'Copywriting', 'LinkedIn']);
  const DIR = EN ? 'ltr' : 'rtl';

  ctx.direction = DIR;
  ctx.textBaseline = 'top';

  if (!mobile) {
    const right = W - u * 6;
    const colW = W * 0.44;
    // the text column sits on the right in both languages; English reads from its left edge
    const tx = EN ? right - colW : right, align = EN ? 'left' : 'right';

    drawBrand(ctx, right, u * 5.6, u * 5.4, 'right');
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = `700 ${u * 1.5}px "Agera Gothic"`;
    ctx.fillStyle = PAL.faint;
    ctx.fillText('MARKETING · MEDIA · PRODUCTION', u * 6, u * 8.2);
    ctx.direction = DIR;

    drawVisual(ctx, vx, vy, H * 0.38, u, 1.08, 0.86);

    // headline
    const hs = fitSize(ctx, head, 900, u * 10.5, 'Alexandria', colW);
    ctx.textAlign = align;
    let y = u * 21, bottom = 0;
    head.forEach((line, i) => {
      ctx.font = `900 ${hs}px Alexandria`;
      if (i === 1) accentLine(ctx, line, tx, y, hs, align);
      else { ctx.fillStyle = PAL.text; ctx.fillText(line, tx, y); }
      bottom = inkBottom(ctx, line, y);
      y += hs * 1.12;
    });

    // sub: below the lowest letter, wherever the Arabic ي / ج hang
    y = Math.max(y, bottom + u * 1.6) + u * 2;
    ctx.font = `600 ${u * 2.8}px Alexandria`;
    ctx.fillStyle = PAL.text;
    ctx.fillText(lead, tx, y);
    y = Math.max(y + u * 4.4, inkBottom(ctx, lead, y) + u * 1.4);
    ctx.font = `300 ${u * 2.4}px Alexandria`;
    ctx.fillStyle = PAL.muted;
    for (const l of wrap(ctx, sub, colW * 0.92)) { ctx.fillText(l, tx, y); y += u * 3.8; }

    // chips
    y += u * 1.8;
    ctx.font = `400 ${u * 1.9}px Alexandria`;
    let x = tx;
    const ph = u * 4.4, pad = u * 1.8;
    const rects = []; // where each chip lands: the links to the matching work are laid over them (placeChipLinks)
    ctx.lineWidth = 1;
    for (const c of chips) {
      const w = ctx.measureText(c).width + pad * 2;
      // English chips are wider: start a new row instead of running past the margin
      if (EN && x > tx && x + w > right) { x = tx; y += ph + u; }
      rects.push({ x: EN ? x : x - w, y, w, h: ph });
      ctx.strokeStyle = PAL.chip;
      ctx.beginPath(); ctx.roundRect(EN ? x : x - w, y, w, ph, ph / 2); ctx.stroke();
      ctx.fillStyle = PAL.chipText;
      ctx.textBaseline = 'middle';
      ctx.fillText(c, EN ? x + pad : x - pad, y + ph / 2 + u * 0.15);
      ctx.textBaseline = 'top';
      x += (EN ? 1 : -1) * (w + u * 1);
    }

    return { key: { x: vx, y: vy }, cta: { x: tx, y: y + ph + u * 3.6, align, size: u * 2.1 }, chips: rects };
  }

  // ---- mobile / portrait ----
  const cx = W / 2;
  drawBrand(ctx, cx, H * 0.05, u * 8, 'center');

  drawVisual(ctx, vx, vy, W * 0.3, u, 1.38, 0.6);

  ctx.textAlign = 'center';
  const hs = fitSize(ctx, head, 900, u * 12, 'Alexandria', W * 0.84);
  let y = H * 0.555, bottom = 0;
  head.forEach((line, i) => {
    ctx.font = `900 ${hs}px Alexandria`;
    if (i === 1) accentLine(ctx, line, cx, y, hs, 'center');
    else { ctx.fillStyle = PAL.text; ctx.fillText(line, cx, y); }
    bottom = inkBottom(ctx, line, y);
    y += hs * 1.1;
  });
  y = Math.max(y, bottom + u * 2) + u * 2.5;
  ctx.font = `600 ${u * 4.2}px Alexandria`;
  ctx.fillStyle = PAL.text;
  ctx.fillText(lead, cx, y);
  y = Math.max(y + u * 6.4, inkBottom(ctx, lead, y) + u * 2);
  ctx.font = `300 ${u * 3.6}px Alexandria`;
  ctx.fillStyle = PAL.muted;
  for (const l of wrap(ctx, sub, W * 0.82)) { ctx.fillText(l, cx, y); y += u * 5.6; }

  return { key: { x: vx, y: vy }, cta: { x: cx, y: y + u * 3, align: 'center', size: u * 3.6 }, chips: [] };
}

/* ---------- build ---------- */
function build() {
  if (gctx) gctx.revert(); // also kills the hero's ScrollTrigger, leaving other sections alone
  if (heroPhysics) { heroPhysics.stop(); heroPhysics = null; }
  PAL = PALETTES[currentTheme()];
  piecesEl.innerHTML = '';

  const vw = window.innerWidth;
  const vh = stage.clientHeight;
  if (vw < 50 || vh < 50) return false; // no real viewport yet (hidden tab): the resize handler builds once there is one
  const mobile = vw < 760 && vh > vw;
  // the board covers the whole screen: square pieces, enough of them to overhang every edge a little
  const pw = Math.ceil(mobile ? Math.max(vw / 8, vh / 14) : Math.max(vw / 16, vh / 10));
  heroPieceSize = pw;
  const ph = pw;
  const cols = Math.ceil(vw / pw);
  const rows = Math.ceil(vh / ph);
  const W = pw * cols;
  const H = ph * rows;
  boardEl.style.width = W + 'px';
  boardEl.style.height = H + 'px';

  // master artwork: laid out in the visible part of the board, below the top bar
  const topH = $('.topbar').offsetHeight;
  const ox = (W - vw) / 2, oy = (H - vh) / 2 + topH;
  const master = document.createElement('canvas');
  master.width = Math.round(W * DPR);
  master.height = Math.round(H * DPR);
  const mctx = master.getContext('2d');
  mctx.scale(DPR, DPR);
  mctx.fillStyle = PAL.bg;
  mctx.fillRect(0, 0, W, H);
  // carry the artwork's grid on under the top bar so the two areas meet without a seam
  const step = mobile ? vw / 8 : vw / 16;
  mctx.strokeStyle = PAL.grid;
  mctx.lineWidth = 1;
  mctx.beginPath();
  for (let x = ox % step; x < W; x += step) { mctx.moveTo(x, 0); mctx.lineTo(x, oy); }
  for (let y = oy - step; y > 0; y -= step) { mctx.moveTo(0, y); mctx.lineTo(W, y); }
  mctx.stroke();
  mctx.translate(ox, oy);
  const layout = drawArt(mctx, vw, vh - topH, mobile);
  for (const pt of [layout.key, layout.cta, ...layout.chips]) { pt.x += ox; pt.y += oy; }
  // the same artwork without seams, laid over the pieces and wiped in behind the final light sweep
  boardEl.querySelector('.seamless')?.remove();
  master.className = 'seamless';
  master.style.width = W + 'px';
  master.style.height = H + 'px';
  boardEl.insertBefore(master, boardEl.querySelector('.sheen'));

  // random tab directions for interior edges
  const R = rng(11);
  const hE = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => (R() > 0.5 ? 1 : -1)));
  const vE = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => (R() > 0.5 ? 1 : -1)));
  const size = Math.min(pw, ph);
  const pad = Math.ceil(size * TAB_DEPTH + 4);

  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const e = {
        t: r === 0 ? 0 : -hE[r - 1][c],
        b: r === rows - 1 ? 0 : hE[r][c],
        l: c === 0 ? 0 : -vE[r][c - 1],
        r: c === cols - 1 ? 0 : vE[r][c],
      };
      const cw = pw + pad * 2, ch = ph + pad * 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(cw * DPR);
      cv.height = Math.round(ch * DPR);
      cv.style.width = cw + 'px';
      cv.style.height = ch + 'px';
      const g = cv.getContext('2d');
      g.scale(DPR, DPR);
      g.translate(pad, pad);

      g.beginPath();
      piecePath(g, 0, 0, pw, ph, e, size);
      // the drop shadow is baked in once here; a CSS drop-shadow on 96 moving, bobbing pieces
      // made the browser re-filter every piece on every frame
      g.save();
      g.shadowColor = 'rgba(0,0,0,.5)';
      g.shadowBlur = Math.min(14, pad * 0.6);
      g.shadowOffsetY = Math.min(7, pad * 0.28);
      g.fillStyle = PAL.bg;
      g.fill();
      g.restore();
      g.save();
      g.clip();
      g.drawImage(master, 0, 0, master.width, master.height, -c * pw, -r * ph, W, H);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,.13)';
      g.stroke();
      g.restore();
      g.lineWidth = 1.1;
      g.strokeStyle = 'rgba(0,0,0,.9)';
      g.stroke();

      const el = document.createElement('div');
      el.className = 'piece';
      el.style.left = c * pw - pad + 'px';
      el.style.top = r * ph - pad + 'px';
      const inner = document.createElement('div');
      inner.className = 'inner';
      inner.style.setProperty('--d', (-R() * 3.2).toFixed(2) + 's');
      inner.append(cv);
      el.appendChild(inner);
      piecesEl.appendChild(el);
      pieces.push({ el, r, c, e, hx: (c + 0.5) * pw - W / 2, hy: (r + 0.5) * ph - H / 2 });
    }
  }

  // the missing piece: the one carrying the heart of the X mark
  const keyR = Math.min(rows - 1, Math.floor(layout.key.y / ph));
  const keyC = Math.min(cols - 1, Math.floor(layout.key.x / pw));
  const key = pieces.find((p) => p.r === keyR && p.c === keyC);
  key.el.classList.add('key');
  const hole = drawHole(key, pw, ph, pad, size);

  drawGhost(W, H, pw, ph, pad, size, pieces);
  placeCta(layout.cta, W);
  placeChipLinks(layout.chips);

  if (REDUCED) {
    gsap.set([ctaEl, chipLinksEl].filter(Boolean), { autoAlpha: 1 });
    gsap.set(master, { '--wipe': '165%', visibility: 'visible' });
    master.classList.add('clean');
    gsap.set('.intro', { autoAlpha: 0 });
    stage.classList.add('calm');
    return;
  }

  gctx = gsap.context(() => buildTimeline(pieces, key, hole, { vw, vh, W, H, pw, ph, mobile }));
}

function drawHole(key, pw, ph, pad, size) {
  const wrap = document.createElement('div');
  wrap.className = 'hole';
  wrap.style.left = key.c * pw - pad + 'px';
  wrap.style.top = key.r * ph - pad + 'px';
  const cw = pw + pad * 2, ch = ph + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(cw * DPR);
  cv.height = Math.round(ch * DPR);
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
  const g = cv.getContext('2d');
  g.scale(DPR, DPR);
  g.translate(pad, pad);
  g.beginPath();
  piecePath(g, 0, 0, pw, ph, key.e, size);
  g.fillStyle = 'rgba(215,255,0,.10)';
  g.fill();
  g.shadowColor = LIME;
  g.shadowBlur = 12;
  g.lineWidth = 2;
  g.strokeStyle = LIME;
  g.stroke();
  wrap.appendChild(cv);
  piecesEl.prepend(wrap);
  return wrap;
}

function drawGhost(W, H, pw, ph, pad, size, pieces) {
  ghostEl.width = Math.round((W + pad * 2) * DPR);
  ghostEl.height = Math.round((H + pad * 2) * DPR);
  ghostEl.style.width = W + pad * 2 + 'px';
  ghostEl.style.height = H + pad * 2 + 'px';
  ghostEl.style.left = -pad + 'px';
  ghostEl.style.top = -pad + 'px';
  const g = ghostEl.getContext('2d');
  g.scale(DPR, DPR);
  g.translate(pad, pad);

  g.fillStyle = PAL.ghostFill;
  g.fillRect(0, 0, W, H);
  g.setLineDash([3, 6]);
  g.strokeStyle = PAL.ghostLine;
  g.lineWidth = 1;
  for (const p of pieces) {
    g.beginPath();
    piecePath(g, p.c * pw, p.r * ph, pw, ph, p.e, size);
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = PAL.ghostEdge;
  g.lineWidth = 1.5;
  g.strokeRect(0, 0, W, H);
  // corner ticks
  g.lineWidth = 3;
  g.strokeStyle = PAL.ghostTick;
  const k = Math.min(W, H) * 0.05;
  g.beginPath();
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    g.moveTo(x + sx * k, y); g.lineTo(x, y); g.lineTo(x, y + sy * k);
  }
  g.stroke();
}

function placeCta(cta, W) {
  ctaEl.style.fontSize = Math.max(13, cta.size) + 'px';
  ctaEl.style.top = cta.y + 'px';
  if (cta.align === 'right') {
    ctaEl.style.right = W - cta.x + 'px';
    ctaEl.style.left = '';
    gsap.set(ctaEl, { xPercent: 0 });
  } else if (cta.align === 'left') {
    ctaEl.style.left = cta.x + 'px';
    ctaEl.style.right = '';
    gsap.set(ctaEl, { xPercent: 0 });
  } else {
    ctaEl.style.left = cta.x + 'px';
    ctaEl.style.right = '';
    gsap.set(ctaEl, { xPercent: -50 });
  }
}

// the service chips are part of the artwork: an invisible link sits on each one, opening the work of that kind.
// Phones draw no chips, so the links stay hidden there.
function placeChipLinks(rects) {
  if (!chipLinksEl) return;
  const links = [...chipLinksEl.querySelectorAll('a')];
  chipLinksEl.hidden = !rects.length;
  links.forEach((a, i) => {
    const r = rects[i];
    a.hidden = !r;
    if (!r) return;
    Object.assign(a.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  });
}

/* ---------- scroll timeline ---------- */
function buildTimeline(pieces, key, hole, { vw, vh, W, H, pw, ph, mobile }) {
  const R = rng(42);
  const halfW = vw / 2, halfH = vh / 2;

  // S0: dumped around the empty board, clear of the intro's words and buttons (relative to the stage's centre)
  const ir = $('.intro').getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const gap = pw * 0.3;
  const clear = {
    l: ir.left - (sr.left + halfW) - gap, r: ir.right - (sr.left + halfW) + gap,
    t: ir.top - (sr.top + halfH) - gap, b: ir.bottom - (sr.top + halfH) + gap,
  };
  for (const p of pieces) {
    let x, y, tries = 0;
    do {
      x = (R() * 2 - 1) * halfW * 0.9;
      y = (R() * 2 - 1) * halfH * 0.78;
    } while (x > clear.l && x < clear.r && y > clear.t && y < clear.b && ++tries < 60);
    const rot = (R() * 2 - 1) * 55;
    p.s0 = { x: x - p.hx, y: y - p.hy, rotation: rot, scale: (mobile ? 0.5 : 0.42) + R() * 0.16 };
    p.ax = x; // absolute start position, relative to the screen centre
    p.ay = y;
    // its place in the tornado
    p.th = R() * Math.PI * 2; // starting angle around the funnel
    p.hh = R() * 2 - 1; // -1 top (wide) … 1 bottom (narrow)
    p.spin = (R() * 2 - 1) * 260; // own tumbling
  }

  // timing: the tornado picks everything up, then drops the pieces into place from the edges inwards;
  // the key piece is the last one out of the storm
  const STORM_START = 0.6;
  const ASM_START = 2.1, ASM_SPAN = 2.5, ASM_DUR = 1.1; // .hero's height in styles.css is sized to this timeline
  const KEY_OUT = ASM_START + ASM_SPAN, KEY_HOVER = 1.4;
  const STORM_END = KEY_OUT;
  const CAPTION = KEY_OUT + KEY_HOVER + 0.2;
  const KEY_SNAP = CAPTION + 1.2, KEY_DUR = 0.55;
  const done = KEY_SNAP + KEY_DUR;
  heroDone = done;
  heroFx = {}; // forget the last applied states so the first frame sets them

  const others = pieces.filter((p) => p !== key);
  others
    .sort((p, q) => Math.hypot(q.hx, q.hy * 1.3) - Math.hypot(p.hx, p.hy * 1.3))
    .forEach((p, k) => {
      p.t3 = ASM_START + (k / others.length) * ASM_SPAN;
    });
  key.t3 = KEY_OUT;
  snapAt = done - 0.05; // the moment the key piece lands
  lastT = Infinity; // the first frame only records the time, so a rebuild mid-page never fires the snap sound

  // S1: a tornado. Pieces orbit a funnel (wide on top, narrow at the bottom) that sways as it turns;
  // pieces on the near side of the orbit are bigger and drawn on top.
  const SPAN = STORM_END - STORM_START;
  const SPIN = SPAN / 2.3; // keeps the turning speed independent of how long the storm lasts
  const funnelTop = Math.min(vw * (mobile ? 0.42 : 0.3), vh * 0.5);
  const funnelBottom = funnelTop * 0.1;
  const funnelH = vh * (mobile ? 0.34 : 0.36);
  const vortex = (p, t) => {
    const low = (p.hh + 1) / 2; // 0 top … 1 bottom
    const r = funnelBottom + (funnelTop - funnelBottom) * (1 - low) ** 1.25;
    const th = p.th + t * SPIN * Math.PI * 2 * (1.6 + low * 1.4); // the narrow end spins faster
    const sway = Math.sin(t * SPIN * Math.PI * 2.4 + low * 2.6) * funnelTop * 0.16;
    const depth = (Math.sin(th) + 1) / 2; // 0 back … 1 front
    return {
      x: sway + r * Math.cos(th),
      y: p.hh * funnelH + r * Math.sin(th) * 0.24,
      rotation: (th * 180) / Math.PI * 0.35 + p.spin * t * SPIN,
      scale: (0.3 + 0.36 * depth) * (0.8 + 0.35 * (1 - low)) * (mobile ? 1.15 : 1),
      depth,
    };
  };
  // the state of a piece t of the way through the storm, eased in from where it lay
  const stormState = (p, t) => {
    const v = vortex(p, t);
    const e = Math.min(1, (t * SPAN) / 0.65);
    const k = e * e * (3 - 2 * e);
    return {
      x: p.ax + (v.x - p.ax) * k - p.hx,
      y: p.ay + (v.y - p.ay) * k - p.hy,
      rotation: p.s0.rotation + (v.rotation - p.s0.rotation) * k,
      scale: p.s0.scale + (v.scale - p.s0.scale) * k,
      zIndex: 10 + Math.round(v.depth * 6 * k) * 10, // a few depth bands, so the stacking order isn't re-sorted every frame
    };
  };
  const stormT = (time) => (time - STORM_START) / SPAN;
  for (const p of pieces) p.s1 = stormState(p, stormT(p.t3)); // where each piece is when it leaves the storm

  pieces.forEach((p) => gsap.set(p.el, p.s0));
  heroPhysics = createHeroPhysics(pieces, { vw, vh, pw });
  heroPhysics.setEnabled(true);
  gsap.set(boardEl, { '--glow': 0 });
  gsap.set(hole, { autoAlpha: 0 });

  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    // runs on every rendered frame of the smoothed (scrubbed) timeline, so it reads the time actually on screen
    onUpdate: () => onHeroFrame(tl),
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.7,
    },
  });

  heroTl = tl;

  // 1 · the tornado
  tl.to('.intro', { autoAlpha: 0, y: -40, scale: 0.96, duration: 0.6, ease: 'power1.in' }, STORM_START);
  tl.to(ghostEl, { opacity: 0.35, duration: 1 }, STORM_START + 0.2);

  // wind streaks: broken elliptical arcs spinning around the same funnel, thinning out as it empties
  const windEl = $('.wind');
  windEl.width = Math.round(vw * DPR);
  windEl.height = Math.round(vh * DPR);
  const wctx = windEl.getContext('2d');
  const drawWind = (t, alpha) => {
    wctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    wctx.clearRect(0, 0, vw, vh);
    if (alpha <= 0.01) return;
    for (let i = 0; i < 18; i++) {
      const low = i / 17;
      const r = funnelBottom + (funnelTop - funnelBottom) * (1 - low) ** 1.25;
      const sway = Math.sin(t * SPIN * Math.PI * 2.4 + low * 2.6) * funnelTop * 0.16;
      const a0 = i * 1.7 + t * SPIN * Math.PI * 2 * (1.6 + low * 1.4);
      const cx = vw / 2 + sway, cy = vh / 2 + (low * 2 - 1) * funnelH;
      wctx.beginPath();
      wctx.ellipse(cx, cy, r * 1.08, r * 0.26, 0, a0, a0 + 2.2);
      wctx.strokeStyle = `rgba(${PAL.windA},${(0.24 * alpha).toFixed(3)})`;
      wctx.lineWidth = 1.4;
      wctx.stroke();
      wctx.beginPath();
      wctx.ellipse(cx, cy, r * 0.9, r * 0.2, 0, a0 + 3.3, a0 + 4.7);
      wctx.strokeStyle = `rgba(${PAL.windB},${(0.12 * alpha).toFixed(3)})`;
      wctx.lineWidth = 1;
      wctx.stroke();
    }
  };

  const storm = { t: 0 };
  tl.to(storm, {
    t: 1,
    duration: SPAN,
    ease: 'none',
    onUpdate: () => {
      const now = tl.time();
      let inStorm = 0;
      for (const p of pieces) {
        if (now >= p.t3) continue; // already on its way into the picture
        gsap.set(p.el, stormState(p, storm.t));
        inStorm++;
      }
      drawWind(storm.t, Math.min(1, (storm.t * SPAN) / 0.6) * Math.min(1, (inStorm / pieces.length) * 1.6));
    },
  }, STORM_START);

  // 2 · assemble — every piece drops out of the storm into its place, edges first; one stays out
  tl.to(ghostEl, { opacity: 1, duration: 0.6 }, ASM_START);
  others.forEach((p) => tl.fromTo(p.el, p.s1, { x: 0, y: 0, rotation: 0, scale: 1, zIndex: 1, duration: ASM_DUR, ease: 'power3.inOut', immediateRender: false }, p.t3));

  // 3 · the missing piece leaves the storm last and hovers beside its hole …
  const hover = mobile ? { x: pw * 0.15, y: -ph * 1.25, scale: 1.45 } : { x: pw * 1.35, y: -ph * 0.7, scale: 1.75 };
  tl.fromTo(key.el, key.s1, { ...hover, rotation: -10, zIndex: 5, duration: KEY_HOVER, ease: 'power3.inOut', immediateRender: false }, KEY_OUT);
  tl.to(hole, { autoAlpha: 1, duration: 0.4 }, KEY_OUT + 0.6);
  tl.fromTo('.key-caption', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4 }, CAPTION);
  tl.to(key.el, { y: hover.y - ph * 0.12, rotation: -5, duration: 1.2, ease: 'sine.inOut' }, CAPTION);

  // … and snaps in
  tl.to('.key-caption', { autoAlpha: 0, y: -10, duration: 0.3 }, KEY_SNAP);
  tl.to(key.el, { x: 0, y: 0, rotation: 0, scale: 1, duration: KEY_DUR, ease: 'power3.in' }, KEY_SNAP);
  tl.to(hole, { autoAlpha: 0, duration: 0.15 }, done - 0.1);

  // 4 · complete
  tl.to(boardEl, { '--glow': 1, duration: 0.25, ease: 'power1.out' }, done);
  tl.fromTo('.sheen span', { xPercent: -150 }, { xPercent: 420, duration: 0.9, ease: 'none' }, done);
  // the seams vanish right behind the light: the wipe edge follows the sheen's centre across the board
  tl.fromTo('.seamless', { '--wipe': '-35%' }, { '--wipe': '165%', duration: 0.9, ease: 'none' }, done);
  tl.to(boardEl, { '--glow': 0.35, duration: 0.6 }, done + 0.3);
  tl.fromTo(ctaEl, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, done + 0.25);
  if (chipLinksEl) tl.fromTo(chipLinksEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, done + 0.25);
  tl.to({}, { duration: 0.5 }, done + 0.6); // a short hold so the finished picture and its buttons settle before the next section
}

// per rendered frame of the hero timeline: the snap sound and the pieces' idle bobbing
function onHeroFrame(tl) {
  const t = tl.time();
  if (lastT < snapAt && t >= snapAt) playClick(); // only when scrolling forward past the snap
  lastT = t;
  if (heroPhysics) heroPhysics.setEnabled(t < 0.3); // the pieces are toys only until the storm comes

  // Expensive layers are only switched on while they're needed; each is touched only when its state changes.
  const fx = (key, value, applyFx) => { if (heroFx[key] !== value) { heroFx[key] = value; applyFx(value); } };
  fx('calm', t >= 0.6, (on) => stage.classList.toggle('calm', on)); // the bobbing stops once the storm takes the pieces
  fx('sheen', t >= heroDone - 0.02 && t <= heroDone + 0.95, (on) => { sheenEl.style.visibility = on ? 'visible' : 'hidden'; });
  fx('seam', t < heroDone - 0.02 ? 'off' : t > heroDone + 0.92 ? 'clean' : 'wipe', (state) => {
    const el = boardEl.querySelector('.seamless');
    if (!el) return;
    el.style.visibility = state === 'off' ? 'hidden' : 'visible';
    el.classList.toggle('clean', state === 'clean'); // fully revealed: drop the mask
  });
}

/* ---------- playing with the scattered pieces (before the first scroll) ---------- */
// While the hero is at rest the dumped pieces can be dragged and thrown, and they shove each other on contact.
// The tornado later picks every piece up from wherever it ended: stormState() reads p.ax / p.ay / p.s0.rotation.
let heroPhysics = null;

function createHeroPhysics(pieces, { vw, vh, pw }) {
  const halfW = vw / 2, halfH = vh / 2;
  const bodies = pieces.map((p) => ({ p, vx: 0, vy: 0, w: 0, r: pw * p.s0.scale * 0.52, awake: false, path: new Path2D(piecePathD(p.e, pw)) }));
  const hitCtx = document.createElement('canvas').getContext('2d');
  // is a point (stage-centre coords) on this piece's actual shape? undo its move, turn and scale, then test the outline
  const hits = (b, m) => {
    const a = (-b.p.s0.rotation * Math.PI) / 180;
    const dx = m.x - b.p.ax, dy = m.y - b.p.ay, s = b.p.s0.scale;
    return hitCtx.isPointInPath(b.path, (dx * Math.cos(a) - dy * Math.sin(a)) / s + pw / 2, (dx * Math.sin(a) + dy * Math.cos(a)) / s + pw / 2);
  };
  const byEl = new Map(bodies.map((b) => [b.p.el, b]));
  let drag = null;
  let enabled = false;

  const keepInside = (b, bounce) => {
    const xr = halfW - b.r, yr = halfH - b.r;
    if (b.p.ax < -xr) { b.p.ax = -xr; b.vx = Math.abs(b.vx) * bounce; }
    if (b.p.ax > xr) { b.p.ax = xr; b.vx = -Math.abs(b.vx) * bounce; }
    if (b.p.ay < -yr) { b.p.ay = -yr; b.vy = Math.abs(b.vy) * bounce; }
    if (b.p.ay > yr) { b.p.ay = yr; b.vy = -Math.abs(b.vy) * bounce; }
  };

  // push overlapping pairs apart; the piece being dragged never yields
  const solveContacts = (impulse) => {
    const held = drag && drag.b;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const c = bodies[j];
        if (impulse && !a.awake && !c.awake && held !== a && held !== c) continue;
        const dx = c.p.ax - a.p.ax, dy = c.p.ay - a.p.ay;
        const min = a.r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, ny = dy / d, overlap = min - d;
        const sa = held === a ? 0 : held === c ? 1 : 0.5;
        const sc = held === c ? 0 : held === a ? 1 : 0.5;
        a.p.ax -= nx * overlap * sa; a.p.ay -= ny * overlap * sa;
        c.p.ax += nx * overlap * sc; c.p.ay += ny * overlap * sc;
        if (!impulse) continue;
        // the shove carries some momentum and a little spin
        const push = overlap * 0.6;
        const spin = (nx * (c.vy - a.vy) - ny * (c.vx - a.vx)) * 0.15 + (Math.random() - 0.5) * push * 0.6;
        if (sa) { a.vx -= nx * push * sa; a.vy -= ny * push * sa; a.w -= spin * sa; a.awake = true; }
        if (sc) { c.vx += nx * push * sc; c.vy += ny * push * sc; c.w += spin * sc; c.awake = true; }
      }
    }
  };

  const render = (b) => gsap.set(b.p.el, { x: b.p.ax - b.p.hx, y: b.p.ay - b.p.hy, rotation: b.p.s0.rotation });

  // settle the random dump first so nothing starts out overlapping (otherwise the first touch would explode)
  for (let it = 0; it < 60; it++) {
    solveContacts(false);
    bodies.forEach((b) => keepInside(b, 0));
  }
  bodies.forEach(render);

  const toLocal = (ev) => {
    const r = stage.getBoundingClientRect();
    return { x: ev.clientX - (r.left + r.width / 2), y: ev.clientY - (r.top + r.height / 2) };
  };
  const onDown = (ev) => {
    if (!enabled) return;
    const m = toLocal(ev);
    // the squares overlap their neighbours' tabs: take the topmost piece whose real shape is under the pointer
    let b = null;
    for (const hit of document.elementsFromPoint(ev.clientX, ev.clientY)) {
      const cand = hit.closest && hit.closest('.piece') && byEl.get(hit.closest('.piece'));
      if (cand && hits(cand, m)) { b = cand; break; }
    }
    if (!b) return;
    ev.preventDefault();
    drag = { b, id: ev.pointerId, ox: b.p.ax - m.x, oy: b.p.ay - m.y, mx: m.x, my: m.y, vx: 0, vy: 0 };
    b.awake = true;
    b.p.el.style.zIndex = 300;
    b.p.el.classList.add('held');
    try { ev.target.setPointerCapture(ev.pointerId); } catch (e) { /* no live pointer (e.g. synthetic events): window listeners still track it */ }
  };
  const onMove = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const m = toLocal(ev);
    drag.vx = m.x - drag.mx;
    drag.vy = m.y - drag.my;
    drag.mx = m.x;
    drag.my = m.y;
  };
  const release = () => {
    if (!drag) return;
    const b = drag.b;
    // throw it with the pointer's last motion
    b.vx = drag.vx * 0.8;
    b.vy = drag.vy * 0.8;
    b.w += drag.vx * 0.2;
    b.p.el.classList.remove('held');
    drag = null;
    setTimeout(() => { if (!drag || drag.b !== b) b.p.el.style.zIndex = ''; }, 700);
  };
  const onUp = (ev) => { if (drag && ev.pointerId === drag.id) release(); };

  const tick = () => {
    if (!enabled) return;
    if (drag) {
      const b = drag.b;
      const nx = drag.mx + drag.ox, ny = drag.my + drag.oy;
      b.vx = nx - b.p.ax;
      b.vy = ny - b.p.ay;
      b.p.ax = nx;
      b.p.ay = ny;
      b.p.s0.rotation += Math.max(-6, Math.min(6, drag.vx * 0.25)); // it swings as you pull it
      drag.vx *= 0.6; drag.vy *= 0.6; // the pointer stopped → the throw dies down
      keepInside(b, 0);
    }
    for (const b of bodies) {
      if (!b.awake || (drag && drag.b === b)) continue;
      b.p.ax += b.vx;
      b.p.ay += b.vy;
      b.p.s0.rotation += b.w;
      b.vx *= 0.9; b.vy *= 0.9; b.w *= 0.88;
      keepInside(b, 0.55);
    }
    solveContacts(true);
    for (const b of bodies) {
      if (!b.awake && !(drag && drag.b === b)) continue;
      render(b);
      if (!(drag && drag.b === b) && Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.w) < 0.03) b.awake = false;
    }
  };

  piecesEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  gsap.ticker.add(tick);

  return {
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) release();
      boardEl.classList.toggle('playable', on);
    },
    stop() {
      this.setEnabled(false);
      piecesEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      gsap.ticker.remove(tick);
    },
  };
}

/* ---------- sound ---------- */
// Browsers only allow audio after a click/tap/key, so the context is unlocked on the first one.
let audio = null;
let snapAt = Infinity;
let lastT = 0;

function unlockAudio() {
  if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));

function snapNoise(at, gain, freq, len) {
  const n = Math.floor(audio.sampleRate * len);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = audio.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(audio.destination);
  src.start(at);
}

// a puzzle piece pressed home: a bright double snap over a short low knock
function playClick() {
  if (!audio || audio.state !== 'running') return; // silent until the first click/tap unlocks audio
  const t = audio.currentTime + 0.005;
  snapNoise(t, 1.1, 2600, 0.045);
  snapNoise(t + 0.028, 0.55, 3400, 0.03);
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}


/* ---------- boot ---------- */async function init() {
  await Promise.all([
    document.fonts.load('900 40px Alexandria', 'نركّب قصّة'),
    document.fonts.load('300 20px Alexandria', 'وكالة تسويق'),
    document.fonts.load('400 20px Alexandria', 'تصوير'),
    document.fonts.load('600 20px Alexandria', 'قسمك'),
    document.fonts.load('900 40px Alexandria', 'We are the missing piece'),
    document.fonts.load('300 20px Alexandria', 'A strategic partner'),
    document.fonts.load('900 20px "Agera Gothic"', 'PUZZLEX'),
    document.fonts.load('400 20px "Agera Gothic"', 'MEDIA'),
    document.fonts.load('700 20px "Agera Gothic"', 'WWW'),
  ]).catch(() => {});
  images = { icon: await loadImage(ROOT + 'assets/icon.svg') };
  build();
  ScrollTrigger.refresh();

  let lastW = window.innerWidth, lastH = window.innerHeight, timer;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 140) return; // ignore mobile URL-bar jumps
      lastW = w; lastH = h;
      build();
      ScrollTrigger.refresh();
    }, 200);
  });
}

// theme switch: redraw the hero in the new palette and land it straight on the current scroll position
document.addEventListener('themechange', () => {
  if (!stage || !images.icon) return;
  build();
  ScrollTrigger.refresh();
  if (heroTl && heroTl.scrollTrigger) heroTl.progress(heroTl.scrollTrigger.progress);
});

if (stage) init(); // the hero exists on the home page only; other pages use the shared helpers above