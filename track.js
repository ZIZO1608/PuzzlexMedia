/* PuzzleX — visitor statistics for the admin panel (lib/analytics.js). Sends to our own server only.
   Every visitor is counted anonymously: the page, clicks on buttons and links, and how long the page stayed open.
   The small banner asks once whether we may also remember this browser; only after "accept" does it keep
   a random visitor id (localStorage) and a per-visit id (sessionStorage), so the panel can show a visit's path.
   A browser asking not to be tracked (Do Not Track / Global Privacy Control) is never asked and never remembered. */
(function () {
  'use strict';
  var EN = document.documentElement.lang === 'en';
  var KEY = 'puzzlex-stats';
  var T = function (ar, en) { return EN ? en : ar; };

  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* private mode: not remembered */ } }
  function del(store, k) { try { window[store].removeItem(k); } catch (e) { /* nothing to remove */ } }
  function newId() {
    var a = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join('');
  }

  var refused = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  var choice = refused ? 'no' : get('localStorage', KEY);
  function ids() {
    if (choice !== 'yes') return {};
    var v = get('localStorage', KEY + '-v'), s = get('sessionStorage', KEY + '-s');
    if (!v) { v = newId(); set('localStorage', KEY + '-v', v); }
    if (!s) { s = newId(); set('sessionStorage', KEY + '-s', s); }
    return { v: v, s: s };
  }

  var params = new URLSearchParams(location.search);
  var project = /\/project(\.html)?$/.test(location.pathname) ? params.get('id') || '' : '';
  function send(data) {
    var id = ids();
    data.p = location.pathname;
    data.l = EN ? 'en' : 'ar';
    if (project) data.pr = project;
    if (id.v) { data.v = id.v; data.s = id.s; }
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
    if (el.closest('.px-consent')) return null;
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

  /* ---------- the consent banner ---------- */
  if (choice) return;
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
    box.setAttribute('aria-label', T('إحصائيات الزيارة', 'Visit statistics'));
    var p = document.createElement('p');
    p.textContent = T('نحسب الزيارات لنحسّن الموقع، على خادمنا فقط ودون إعلانات. هل تسمح بأن نتذكّر متصفحك لنفهم كيف يتنقّل الزوار بين الصفحات؟ ',
      'We count visits to improve the site, on our own server and with no ads. May we remember this browser to see how visitors move between pages? ');
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
    no.textContent = T('لا، شكرًا', 'No thanks');
    row.append(yes, no);
    box.append(p, row);
    var close = function (v) {
      choice = v;
      set('localStorage', KEY, v);
      if (v === 'no') { del('localStorage', KEY + '-v'); del('sessionStorage', KEY + '-s'); }
      box.classList.remove('in');
      setTimeout(function () { box.remove(); }, 400);
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
