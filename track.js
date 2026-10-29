/* PuzzleX — visitor statistics for the admin panel (lib/analytics.js). Sends to our own server only.
   Every visitor is counted anonymously: the page, clicks on buttons and links, and how long the page stayed open.
   A random per-visit id (sessionStorage, gone when the tab closes) links one visit's pages, so the panel can show
   its path. Nothing outlives the visit, so there is no banner to ask. A browser asking not to be tracked
   (Do Not Track / Global Privacy Control) gets no visit id. */
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
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('a, button');
    if (!el) return;
    var c = classify(el);
    if (c && c.x !== undefined) send({ t: 'click', k: c.k, x: c.x });
  }, true);
})();
