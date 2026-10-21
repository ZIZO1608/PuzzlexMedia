// Screenshot capture for the user guide — a Node port of the client-user-guide skill's capture.py (no Python here).
//   GUIDE_PASS=… node user-guide/tools/capture.mjs user-guide/shots.json --out user-guide/shots [--only id1 id2]
// Same config format as the skill (references/capture.md); selectors are CSS, or `text=Label` (the smallest visible
// element whose text is exactly Label), or `css >> text=Label` (inside css). Writes <id>.png (2×) + <id>.json
// { image, width, height, boxes: { key: [x, y, w, h] }, clipped, display_url } — what build.mjs reads.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const cfgPath = args[0];
const outDir = path.resolve(args[args.indexOf('--out') + 1] || 'shots');
const only = args.includes('--only') ? args.slice(args.indexOf('--only') + 1) : null;
// a .mjs config (default export) is easier to write when screens run page scripts
const cfg = cfgPath.endsWith('.mjs') ? (await import(pathToFileURL(path.resolve(cfgPath)).href)).default : JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const env = (v) => (typeof v === 'string' && v.startsWith('$ENV:') ? process.env[v.slice(5)] ?? '' : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

const PORT = 9340;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-cap-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--lang=ar', 'about:blank'], { stdio: 'ignore' });

let t;
for (let i = 0; i < 50 && !t; i++) {
  try { t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map(); const hs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { wait.get(m.id)?.(m); wait.delete(m.id); } else hs.forEach((h) => h(m)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const errors = [];
hs.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
});
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.split('\n')[0] || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

const vp = cfg.viewport || { width: 1280, height: 760 };
const dpr = cfg.device_scale_factor || 2;
await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: dpr, mobile: Boolean(cfg.is_mobile) });
if (cfg.is_mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  try { sessionStorage.setItem('puzzlex-loaded', '1') } catch (e) {}
  // selector helper shared by every step: CSS, text=Label, or css >> text=Label
  window.__find = (sel, all) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    let scope = document, s = sel;
    if (sel.includes(' >> ')) { const [a, b] = sel.split(' >> '); scope = [...document.querySelectorAll(a)].find(vis); s = b; if (!scope) return all ? [] : null; }
    let list;
    if (s.startsWith('text=')) {
      const want = s.slice(5).trim();
      list = [...scope.querySelectorAll('body *, *')].filter((el) => vis(el) && el.textContent.replace(/\\s+/g, ' ').trim() === want);
      list = list.filter((el) => !list.some((o) => o !== el && el.contains(o))); // the innermost match
    } else list = [...scope.querySelectorAll(s)].filter(vis);
    return all ? list : list[0] || null;
  };
  window.__set = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
` });

const base = cfg.base_url.replace(/\/$/, '');
async function go(url) {
  const loaded = new Promise((r) => hs.push((m) => m.method === 'Page.loadEventFired' && r()));
  await send('Page.navigate', { url: /^https?:/.test(url) ? url : base + '/' + url.replace(/^\//, '') });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(600);
}
async function waitFor(sel, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await run(`!!__find(${JSON.stringify(sel)})`)) return; await sleep(120); }
  throw new Error(`wait_for timed out: ${sel}`);
}
async function act(a) {
  try {
    if (a.goto) await go(a.goto);
    else if (a.click) { const ok = await run(`(() => { const el = __find(${JSON.stringify(a.click)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`); if (!ok) throw new Error(`click: not found ${a.click}`); await sleep(250); }
    else if (a.fill) { const ok = await run(`(() => { const el = __find(${JSON.stringify(a.fill.selector)}); if (!el) return false; __set(el, ${JSON.stringify(env(a.fill.value))}); return true; })()`); if (!ok) throw new Error(`fill: not found ${a.fill.selector}`); }
    else if (a.eval) await run(`(async () => { ${a.eval} })()`);
    else if (a.wait) await sleep(a.wait);
    else if (a.wait_for) await waitFor(a.wait_for);
    else if (a.scroll_to) await run(`(() => { const el = __find(${JSON.stringify(a.scroll_to)}); el && el.scrollIntoView({ block: 'start' }); })()`);
    else if (a.hash) { await run(`location.hash = ${JSON.stringify(a.hash)}`); await sleep(900); }
  } catch (e) { if (!a.optional) throw e; }
}

const results = { ok: [], failed: [] };
if (cfg.login) {
  await go(cfg.login.url || '/');
  for (const a of cfg.login.actions || []) await act(a);
  if (cfg.login.wait_for) await waitFor(cfg.login.wait_for);
}
for (const a of cfg.setup || []) await act(a);

const BASE_CSS = '*{caret-color:transparent!important;transition:none!important;animation:none!important} ::-webkit-scrollbar{display:none}';
for (const sc of cfg.screens) {
  if (only && !only.includes(sc.id)) continue;
  try {
    if (sc.url != null) await go(sc.url);
    for (const a of sc.actions || []) await act(a);
    if (sc.wait_for) await waitFor(sc.wait_for);
    let css = BASE_CSS + (cfg.css || '') + (sc.css || '');
    for (const sel of [...(cfg.hide || []), ...(sc.hide || [])]) css += `\n${sel}{visibility:hidden!important}`;
    for (const sel of [...(cfg.blur || []), ...(sc.blur || [])]) css += `\n${sel}{filter:blur(5px)!important}`;
    await run(`(() => { const s = document.createElement('style'); s.id = '__cap'; s.textContent = ${JSON.stringify(css)}; document.head.append(s); })()`);
    await sleep(sc.delay_ms ?? cfg.delay_ms ?? 400);

    // the clip region (viewport coordinates) and every callout box relative to it
    const geo = await run(`(() => {
      const pad = ${sc.clip_padding ?? 12};
      let clip = null;
      ${sc.clip ? `const c = __find(${JSON.stringify(sc.clip)}); if (!c) return { err: 'clip not found' };
        const vr = c.getBoundingClientRect(); if (vr.top < 0 || vr.bottom > innerHeight) { c.scrollIntoView({ block: vr.height > innerHeight ? 'start' : 'center' }); }
        const r = c.getBoundingClientRect();
        clip = { x: Math.max(r.left - pad, 0), y: Math.max(r.top - pad, 0) };
        clip.width = Math.min(r.right + pad, innerWidth) - clip.x; clip.height = Math.min(r.bottom + pad, innerHeight) - clip.y;` : ''}
      const o = clip ? [clip.x, clip.y] : [0, 0];
      const boxes = {}, missing = [];
      for (const [key, sel] of ${JSON.stringify((sc.callouts || []).map((c) => [c.key, c.selector]))}) {
        const el = __find(sel);
        if (!el) { missing.push(key); continue; }
        const r = el.getBoundingClientRect();
        boxes[key] = [r.left - o[0], r.top - o[1], r.width, r.height].map((v) => Math.round(v * 10) / 10);
      }
      return { clip, boxes, missing, url: location.href, sx: scrollX, sy: scrollY };
    })()`);
    if (geo.err) throw new Error(geo.err);
    // CDP's clip is in page coordinates: add the scroll offset to the viewport rectangle
    const clip = geo.clip && { x: geo.clip.x + geo.sx, y: geo.clip.y + geo.sy, width: geo.clip.width, height: geo.clip.height, scale: 1 };
    const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
    if (!shot.result) throw new Error('screenshot failed');
    fs.writeFileSync(path.join(outDir, `${sc.id}.png`), Buffer.from(shot.result.data, 'base64'));
    await run(`document.getElementById('__cap')?.remove()`);
    const w = geo.clip ? geo.clip.width : vp.width, h = geo.clip ? geo.clip.height : vp.height;
    const displayBase = (cfg.display_base_url || base).replace(/\/$/, '');
    const meta = {
      image: `${sc.id}.png`, width: w, height: h, url: geo.url,
      display_url: sc.display_url || geo.url.replace(base, displayBase).replace(/^https?:\/\//, ''),
      clipped: Boolean(geo.clip), device: cfg.is_mobile ? 'phone' : 'desktop', boxes: geo.boxes, captured: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    fs.writeFileSync(path.join(outDir, `${sc.id}.json`), JSON.stringify(meta, null, 2));
    console.log(`  ok  ${sc.id}${geo.missing.length ? `  (missing callouts: ${geo.missing.join(', ')})` : ''}`);
    results.ok.push(sc.id);
    if (geo.missing.length) results.failed.push(`${sc.id}: callouts not found: ${geo.missing.join(', ')}`);
  } catch (e) {
    console.log(`  FAIL ${sc.id}: ${e.message}`);
    results.failed.push(`${sc.id}: ${e.message}`);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s.result) fs.writeFileSync(path.join(outDir, `_error-${sc.id}.png`), Buffer.from(s.result.data, 'base64'));
  }
}
console.log(`\n${results.ok.length} captured, ${results.failed.length} problem(s)`);
for (const f of results.failed) console.log('  - ' + f);
if (errors.length) console.log('page errors:', [...new Set(errors)].join(' | '));
ws.close(); chrome.kill();
