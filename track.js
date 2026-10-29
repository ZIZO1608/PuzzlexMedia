/* PuzzleX — visitor statistics for the admin panel (lib/analytics.js). Sends to our own server only.
   Every visitor is counted anonymously: the page, clicks on buttons and links, and how long the page stayed open.
   A random per-visit id (sessionStorage, gone when the tab closes) links one visit's pages, so the panel can show
   its path. Nothing outlives the visit, so the statistics need no banner. Each click also sends where it landed,
   for the admin's click map. A browser asking not to be tracked (Do Not Track / Global Privacy Control) gets no
   visit id and is never recorded by Clarity (the one part that asks first, at the end of this file). */
(function () {
  'use strict';
  var EN = document.documentElement.lang === 'en';
  var KEY = 'puzzlex-stats';

  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* private mode: not remembered */ } }
  function del(store, k) { try { window[store].removeItem(k); } catch (e) { /* nothing to remove */ } }
  function newId() {
    var a = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join('');
  }

  var refused = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  // the old banner's answer and long-lived visitor id: no longer used, so not left behind on the device
  del('localStorage', KEY); del('localStorage', KEY + '-v');
  function visit() {
    if (refused) return '';
    var s = get('sessionStorage', KEY + '-s');
    if (!s) { s = newId(); set('sessionStorage', KEY + '-s', s); }
    return s;
  }

  var params = new URLSearchParams(location.search);
  var project = /\/project(\.html)?$/.test(location.pathname) ? params.get('id') || '' : '';
  function send(data) {
    var s = visit();
    data.p = location.pathname;
    data.l = EN ? 'en' : 'ar';
    if (project) data.pr = project;
    if (s) data.s = s;
    var body = JSON.stringify(data);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', body)) return;
    } catch (e) { /* fall through */ }
    try { fetch('/api/track', { method: 'POST', body: body, keepalive: true, credentials: 'same-origin' }); } catch (e) { /* offline */ }
  }

  /* ---------- the page view ---------- */
  send({ t: 'view', r: document.referrer, h: location.hostname, w: window.innerWidth, utm: params.get('utm_source') || '' });

  /* ---------- time on the page: only while it's visible ---------- */
  var shown = document.visibilityState === 'visible' ? Date.now() : 0, spent = 0;
  function leave() {
    if (shown) { spent += Date.now() - shown; shown = 0; }
    var d = Math.round(spent / 1000);
    if (d >= 1) send({ t: 'leave', d: d });
    spent = 0;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') leave();
    else shown = Date.now();
  });
  window.addEventListener('pagehide', leave);

  /* ---------- clicks on links and buttons ---------- */
  var label = function (el) {
    return (el.getAttribute('aria-label') || el.textContent || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  var bare = function (path) { return path.replace(/^\/en(?=\/|$)/, '') || '/'; };
  function classify(el) {
    if (el.tagName === 'BUTTON') {
      if (el.classList.contains('form-submit')) return { k: 'form', x: el.dataset.via === 'whatsapp' ? 'whatsapp' : 'email' };
      return { k: 'button', x: label(el) };
    }
    var href = el.getAttribute('href') || '';
    if (el.dataset.social) return { k: 'social', x: el.dataset.social };
    if (/^tel:/i.test(href)) return { k: 'phone', x: label(el) };
    if (/^mailto:/i.test(href)) return { k: 'email', x: label(el) };
    if (!href || href.charAt(0) === '#') return { k: 'button', x: label(el) };
    var u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    if (/(^|\.)wa\.me$|whatsapp\.com$/i.test(u.hostname)) return { k: 'whatsapp', x: bare(location.pathname) };
    if (u.host !== location.host) return { k: 'out', x: u.hostname.replace(/^www\./, '') };
    if (/\/project(\.html)?$/.test(u.pathname) && u.searchParams.get('id')) return { k: 'project', x: u.searchParams.get('id') };
    var toEn = /^\/en(\/|$)/.test(u.pathname);
    if (toEn !== EN && bare(u.pathname) === bare(location.pathname)) return { k: 'lang', x: toEn ? 'en' : 'ar' };
    if (/\/contact(\.html)?$/.test(u.pathname)) return { k: 'cta', x: label(el) };
    return { k: 'link', x: bare(u.pathname) + (u.search.length < 40 ? u.search : '') };
  }
  // the element's path from the nearest id, e.g. "#work > div:nth-of-type(2) > a:nth-of-type(5)", so the admin's
  // click map can find the same element again at any screen width
  function path(el) {
    var parts = [];
    for (var n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 14; n = n.parentElement) {
      if (n.id && /^[a-z][\w-]*$/i.test(n.id)) { parts.unshift('#' + n.id); return parts.join(' > '); }
      var i = 1, tag = n.tagName.toLowerCase();
      for (var s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
    }
    return parts.length ? 'body > ' + parts.join(' > ') : '';
  }
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest || ev.target.closest('.px-consent')) return;
    var el = ev.target.closest('a, button');
    var c = el ? classify(el) : { k: 'tap', x: label(ev.target).slice(0, 40) || ev.target.tagName.toLowerCase() };
    if (!c || c.x === undefined) return;
    var at = el || ev.target, r = at.getBoundingClientRect(), doc = document.documentElement;
    var frac = function (v) { return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000; };
    send({
      t: 'click', k: c.k, x: c.x, sel: path(at).slice(0, 300), vw: window.innerWidth,
      ox: r.width ? frac((ev.clientX - r.left) / r.width) : 0.5, oy: r.height ? frac((ev.clientY - r.top) / r.height) : 0.5,
      px: frac(ev.pageX / Math.max(1, doc.scrollWidth)), py: Math.round(ev.pageY),
    });
  }, true);

  /* ---------- Microsoft Clarity (video recordings, heatmaps): only when switched on, and only after "accept" ----------
     The statistics above need no permission; Clarity records the visit on Microsoft's servers, so it asks first.
     The answer is the one thing kept beyond the visit (localStorage), so the question isn't asked on every page. */
  var CLARITY = window.SITE && window.SITE.clarity;
  if (!CLARITY) return;
  var ASK = 'puzzlex-clarity';
  var T = function (ar, en) { return EN ? en : ar; };
  var answer = refused ? 'no' : get('localStorage', ASK);
  function clarity() {
    if (answer !== 'yes' || window.clarity) return;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(CLARITY);
    document.head.appendChild(tag);
    window.clarity('consent');
  }
  clarity();
  if (answer) return;
  function banner() {
    var css = document.createElement('style');
    css.textContent = '.px-consent{position:fixed;z-index:80;inset-inline:16px;bottom:16px;max-width:520px;margin-inline-start:auto;'
      + 'display:grid;gap:12px;padding:16px 18px;border:1px solid var(--line);border-radius:18px;background:rgba(var(--ink-rgb),.92);'
      + 'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--text);font:400 13.5px/1.7 var(--ar);'
      + 'box-shadow:0 18px 50px rgba(0,0,0,.35);opacity:0;translate:0 12px;transition:opacity .35s ease,translate .35s ease}'
      + '.px-consent.in{opacity:1;translate:0 0}.px-consent p{margin:0;color:var(--muted)}.px-consent a{color:var(--accent-text);text-decoration:underline}'
      + '.px-consent .row{display:flex;flex-wrap:wrap;gap:8px}.px-consent button{font:700 13px var(--ar);min-height:40px;padding:0 18px;border-radius:999px;cursor:pointer;'
      + 'border:1px solid rgba(var(--fg-rgb),.25);background:none;color:var(--text)}.px-consent button.yes{background:var(--lime);border-color:var(--lime);color:#0a0a0b}'
      + '@media (prefers-reduced-motion:reduce){.px-consent{transition:none}}';
    document.head.appendChild(css);
    var box = document.createElement('div');
    box.className = 'px-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', T('تسجيل الزيارة', 'Visit recording'));
    var p = document.createElement('p');
    p.textContent = T('هل تسمح بأن نسجّل كيف تتصفّح الموقع (التمرير والنقرات، دون ما تكتبه) بأداة Microsoft Clarity، لنحسّنه للزوار؟ ',
      'May we record how you browse the site (scrolling and clicks, never what you type) with Microsoft Clarity, to improve it for visitors? ');
    var more = document.createElement('a');
    more.href = EN ? '/en/privacy.html' : '/privacy.html';
    more.textContent = T('سياسة الخصوصية', 'Privacy policy');
    p.appendChild(more);
    var row = document.createElement('div');
    row.className = 'row';
    var yes = document.createElement('button'), no = document.createElement('button');
    yes.type = no.type = 'button';
    yes.className = 'yes';
    yes.textContent = T('موافق', 'Accept');
    no.textContent = T('لا، شكراً', 'No thanks');
    row.append(yes, no);
    box.append(p, row);
    var close = function (v) {
      answer = v;
      set('localStorage', ASK, v);
      box.classList.remove('in');
      setTimeout(function () { box.remove(); }, 400);
      clarity();
    };
    yes.onclick = function () { close('yes'); };
    no.onclick = function () { close('no'); };
    document.body.appendChild(box);
    requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add('in'); }); });
  }
  // after the loading screen, so the first thing a visitor sees is still the site
  (function wait(n) {
    if (document.documentElement.classList.contains('is-loading') && n < 40) return setTimeout(wait, 250, n + 1);
    setTimeout(banner, 1200);
  })(0);
})();
