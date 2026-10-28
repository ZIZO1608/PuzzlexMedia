/* PuzzleX — custom cursor: a small lime puzzle piece that leans into the motion and turns to "slot in"
   over anything clickable. Mouse only; touch devices and reduced-motion keep the system cursor.
   Uses piecePathD() from sections.js and REDUCED from main.js. */

(function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || REDUCED) return;

  const HOT = 'a, button, [role="button"], .partners-board.done .pp, .orbit, .pp-pop-piece, .board.playable .piece';
  const LABELS = [
    ['.pp-pop-piece', T('اسحب', 'Drag')],
    ['.board.playable .piece', T('اسحب', 'Drag')],
    ['.partners-board.done .pp', T('افتح', 'Open')],
    ['.work-card', T('افتح', 'Open')],
    ['.tm-shot', T('كبّر', 'View')],
    ['.pp-pop', T('رجوع', 'Back')],
  ];

  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  const d = piecePathD({ t: 1, r: 1, b: -1, l: -1 });
  el.innerHTML = `
    <span class="cursor-tilt">
      <svg class="cursor-piece" viewBox="-34 -34 168 168">
        <path d="${d}" fill="#d7ff00" stroke="#0a0a0b" stroke-width="8" stroke-linejoin="round"/>
        <path d="M14 18 Q14 12 20 12 L40 12" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="7" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="cursor-label"></span>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('has-cursor');

  const tiltEl = el.querySelector('.cursor-tilt');
  const label = el.querySelector('.cursor-label');
  let x = 0, y = 0, tx = 0, ty = 0, tilt = 0, shown = false;

  window.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    tx = ev.clientX;
    ty = ev.clientY;
    if (!shown) {
      x = tx; y = ty;
      shown = true;
      el.classList.add('is-visible');
    }
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    shown = false;
    el.classList.remove('is-visible');
  });

  // what's under the pointer decides the state; re-checked on move so it follows DOM changes (pop-up, board done)
  let lastTarget = null;
  const refresh = (target) => {
    lastTarget = target;
    const t = target instanceof Element ? target : null;
    el.classList.toggle('is-hover', !!(t && t.closest(HOT)));
    const lab = t && LABELS.find(([sel]) => t.closest(sel));
    label.textContent = lab ? lab[1] : '';
    el.classList.toggle('has-label', !!lab);
  };
  window.addEventListener('pointerover', (ev) => refresh(ev.target), { passive: true });
  window.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse') el.classList.add('is-down'); });
  window.addEventListener('pointerup', () => {
    el.classList.remove('is-down');
    requestAnimationFrame(() => refresh(document.elementFromPoint(tx, ty))); // a click may open/close the pop-up
  });

  gsap.ticker.add(() => {
    if (!shown) return;
    const dx = tx - x;
    x += dx * 0.45;
    y += (ty - y) * 0.45;
    // lean into horizontal motion, ease back when it stops
    tilt += (Math.max(-30, Math.min(30, dx * 1.1)) - tilt) * 0.18;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    tiltEl.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
    if (lastTarget && !lastTarget.isConnected) refresh(document.elementFromPoint(tx, ty));
  });
})();
