/* PuzzleX — smooth scrolling and the scroll extras shared by every page.
   Lenis smooths wheel and keyboard scrolling on desktop; touch keeps the phone's own native scroll.
   Loaded right after gsap + ScrollTrigger and before main.js, so every page script can use scrollToEl(). */

const SCROLL_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

ScrollTrigger.config({ ignoreMobileResize: true }); // the phone URL bar showing/hiding no longer re-measures everything

const lenis = !SCROLL_REDUCED && window.Lenis
  ? new Lenis({ lerp: 0.11, wheelMultiplier: 1, allowNestedScroll: true, autoRaf: false })
  : null;

if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000)); // one clock for Lenis and every scrubbed timeline
  gsap.ticker.lagSmoothing(0);

  // the loading screen, the open phone menu and the image viewer lock the page; Lenis has to stop with them
  const root = document.documentElement;
  const syncLock = () => {
    if (['is-loading', 'menu-lock', 'view-lock'].some((c) => root.classList.contains(c))) lenis.stop();
    else lenis.start();
  };
  syncLock();
  new MutationObserver(syncLock).observe(root, { attributes: true, attributeFilter: ['class'] });
}

// scroll so `el` sits at the top of the screen, or in its middle with block 'center'
function scrollToEl(el, block = 'start') {
  if (!lenis) {
    el.scrollIntoView({ behavior: SCROLL_REDUCED ? 'auto' : 'smooth', block });
    return;
  }
  const offset = block === 'center' ? -(window.innerHeight - el.offsetHeight) / 2 : 0;
  lenis.scrollTo(el, { offset, duration: 1.1 });
}

// scroll to a page position in pixels
function scrollToY(top) {
  if (lenis) lenis.scrollTo(top, { duration: 1.1 });
  else window.scrollTo({ top, behavior: SCROLL_REDUCED ? 'auto' : 'smooth' });
}

// same-page links (#creative …) glide instead of jumping
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href').length < 2) return;
  const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
  if (!target) return;
  ev.preventDefault();
  scrollToEl(target);
  history.replaceState(null, '', a.hash);
});

/* ---------- progress line: a thin lime bar along the top edge fills as you read down the page ---------- */
(function initScrollProgress() {
  if (SCROLL_REDUCED) return;
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  const fill = gsap.quickSetter(bar, 'scaleX');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => fill(self.progress),
    onRefresh: (self) => fill(self.progress),
  });
})();

/* ---------- section headings rise out of a mask as they come into view ---------- */
(function initHeadingReveals() {
  if (SCROLL_REDUCED) return;
  const reveal = () => {
    document.querySelectorAll('.section-title').forEach((title) => {
      const kicker = title.previousElementSibling && title.previousElementSibling.classList.contains('kicker')
        ? title.previousElementSibling
        : null;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: title, start: 'top 88%', once: true },
      });
      if (kicker) tl.fromTo(kicker, { autoAlpha: 0, letterSpacing: '.8em' }, { autoAlpha: 1, letterSpacing: '.35em', duration: 0.9, ease: 'power3.out', clearProps: 'letterSpacing' }, 0);
      // the negative insets leave room for the Arabic ascenders and the underline, so only the bottom edge wipes
      tl.fromTo(title,
        { yPercent: 55, clipPath: 'inset(100% -20% -30% -20%)' },
        { yPercent: 0, clipPath: 'inset(-30% -20% -30% -20%)', duration: 1, ease: 'expo.out', clearProps: 'clipPath,transform' },
        0.08);
    });
  };
  // fonts change the headings' heights, so measure once they're in
  document.fonts.ready.then(reveal);
})();
