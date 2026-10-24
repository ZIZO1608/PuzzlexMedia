/* PuzzleX — loading screen: a 3×3 puzzle assembles as the page loads, the lime X key piece drops in last,
   then the pieces fly apart to reveal the page. Shown once per browser tab session.
   Runs right after its own markup, before the page's other scripts, so it depends on nothing else. */

(function initLoader() {
  const root = document.documentElement;
  const el = document.querySelector('.loader');
  if (!el) return;
  if (!root.classList.contains('is-loading')) { el.remove(); return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pieces = [...el.querySelectorAll('.loader-piece')];
  const num = el.querySelector('.loader-num');
  const MIN_MS = reduced ? 0 : 600;  // a glimpse of the puzzle, not a wait: the page is what people came for
  const MAX_MS = 4000;               // never hold the page hostage to a slow resource
  const t0 = performance.now();

  // real progress: fonts, every image on the page, then the window's load event
  let total = 2, done = 0;
  const tick = () => { done++; };
  document.fonts.ready.then(tick, tick);
  window.addEventListener('load', tick, { once: true });
  document.addEventListener('DOMContentLoaded', () => {
    const imgs = [...document.images].filter((img) => !img.closest('.loader'));
    total += imgs.length;
    imgs.forEach((img) => {
      if (img.complete) tick();
      else { img.addEventListener('load', tick, { once: true }); img.addEventListener('error', tick, { once: true }); }
    });
  }, { once: true });

  let shown = 0, placed = 0, finished = false;
  const frame = (now) => {
    const elapsed = now - t0;
    const real = elapsed > MAX_MS ? 1 : done / total;
    const pace = Math.min(1, elapsed / MIN_MS);
    const target = Math.min(real, pace);
    shown += (target - shown) * 0.2;
    if (target === 1 && 1 - shown < 0.004) shown = 1;
    num.textContent = Math.round(shown * 100);
    // the eight outer pieces land in turn; the key waits for 100%
    const want = Math.min(pieces.length, Math.floor(shown * (pieces.length + 1)));
    while (placed < want) pieces[placed++].classList.add('is-in');
    if (shown === 1 && !finished) { finished = true; finish(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function finish() {
    el.classList.add('is-complete');           // the key piece drops in
    const hold = reduced ? 0 : 200;
    setTimeout(() => {
      el.classList.add('is-leaving');          // pieces fly apart, the backdrop fades
      root.classList.remove('is-loading');
      try { sessionStorage.setItem('puzzlex-loaded', '1'); } catch (e) { /* shows again next page, that's all */ }
      document.dispatchEvent(new CustomEvent('loaderdone'));
      setTimeout(() => el.remove(), reduced ? 300 : 1100);
    }, hold);
  }
})();
