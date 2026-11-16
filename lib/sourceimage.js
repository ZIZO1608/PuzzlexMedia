'use strict';
/* PuzzleX — a cover for an AI article, taken from its source (lib/blogbot.js). For each source link in turn: read
   the page's share image (og:image, twitter:image, image_src), download it, and keep it on this server as a WebP of
   at most 1600px wide (ffmpeg, as lib/media.js uses) under /uploads/, like an image uploaded in the admin panel.
   The first source with a usable image wins; with none, the article keeps the blog's drawn cover.

   The links come from the model's answer, so nothing is fetched blindly: http(s) only, public addresses only
   (every redirect checked again), pages read up to 1.5 MB, images up to 10 MB, 15 seconds each, and only real
   images (checked by their first bytes) are kept. */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const PAGE_MAX = 1.5 * 1024 * 1024;
const IMAGE_MAX = 10 * 1024 * 1024;
const TIMEOUT = 15000;
const UA = 'Mozilla/5.0 (compatible; PuzzleXMediaBot/1.0; +https://www.puzzlexmedia.com)';

// private, loopback, link-local and other non-public addresses: never fetched
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('::ffff:') && privateIp(s.slice(7));
}
async function safe(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return null;
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) return null;
  } catch { return null; }
  return u;
}

// GET with every redirect checked, a size cap and a timeout; resolves to { buf, type, url } or null
async function get(url, max, accept) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await safe(current);
    if (!u) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(u, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: accept } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), u).href; continue; }
      if (!res.ok || !res.body) return null;
      if (Number(res.headers.get('content-length')) > max) return null;
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > max) { ctrl.abort(); return null; }
        chunks.push(chunk);
      }
      return { buf: Buffer.concat(chunks), type: String(res.headers.get('content-type') || '').toLowerCase(), url: u.href };
    } catch { return null; } finally { clearTimeout(timer); }
  }
  return null;
}

// the page's share image: og:image (and its secure_url), twitter:image, then <link rel="image_src">
function shareImage(html, base) {
  const head = html.slice(0, 400000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return m ? (m[2] ?? m[3]) : ''; };
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&quot;/g, '"').trim();
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    const tag = metas.find((t) => (attr(t, 'property') || attr(t, 'name')).toLowerCase() === key && attr(t, 'content'));
    if (tag) { try { return new URL(decode(attr(tag, 'content')), base).href; } catch { /* next */ } }
  }
  const link = /<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i.exec(head);
  if (link) { const href = /href\s*=\s*["']([^"']+)["']/i.exec(link[0]); if (href) { try { return new URL(decode(href[1]), base).href; } catch { /* none */ } } }
  return '';
}

// what the first bytes say it is
function kind(buf) {
  if (buf.length < 64) return null;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 4, 12) === 'ftypavif' || buf.toString('ascii', 4, 12) === 'ftypavis') return 'avif';
  return null;
}

// the picture's size as ffmpeg reads it ({ w, h } or null): with no output file it prints what it read and stops
function probe(input) {
  return new Promise((resolve) => {
    let err = '';
    const child = spawn(FFMPEG, ['-hide_banner', '-i', input], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const kill = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', () => { clearTimeout(kill); resolve(null); });
    child.on('close', () => {
      clearTimeout(kill);
      const m = /Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(err);
      resolve(m ? { w: Number(m[1]), h: Number(m[2]) } : null);
    });
  });
}
// a cover, not a logo or an icon: wide enough, and landscape (news pictures are about 16:9 or 1.91:1)
const coverShaped = (s) => Boolean(s && s.w >= 500 && s.h >= 250 && s.w / s.h >= 1.2 && s.w / s.h <= 2.8);

// one still frame, at most 1600px wide, as WebP (quality 82); resolves to the output's size or 0
function toWebp(input, output) {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-frames:v', '1',
      '-vf', "scale='min(1600,iw)':-2", '-c:v', 'libwebp', '-quality', '82', output], { stdio: 'ignore', windowsHide: true });
    const kill = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.on('error', () => { clearTimeout(kill); resolve(0); });
    child.on('close', async (code) => {
      clearTimeout(kill);
      if (code !== 0) return resolve(0);
      try { resolve((await fsp.stat(output)).size); } catch { resolve(0); }
    });
  });
}

// try the sources in turn; resolves to { src, credit: { url, host } } or null
async function coverFrom(sources, uploadsDir) {
  for (const page of (sources || []).slice(0, 5)) {
    const doc = await get(page, PAGE_MAX, 'text/html,application/xhtml+xml');
    if (!doc || !/html|xml/.test(doc.type)) continue;
    const imageUrl = shareImage(doc.buf.toString('utf8'), doc.url);
    if (!imageUrl) continue;
    const img = await get(imageUrl, IMAGE_MAX, 'image/webp,image/png,image/jpeg,image/*;q=0.8');
    const type = img && kind(img.buf);
    if (!type) continue;
    const id = crypto.randomBytes(12).toString('hex');
    await fsp.mkdir(uploadsDir, { recursive: true });
    const tmp = path.join(os.tmpdir(), `px-cover-${id}`);
    const out = path.join(uploadsDir, `${id}.webp`);
    await fsp.writeFile(tmp, img.buf);
    let src = '';
    try {
      // a site's logo or a tiny icon is no cover: on to the next source
      if (!coverShaped(await probe(tmp))) continue;
      if (await toWebp(tmp, out) > 2 * 1024) src = `/uploads/${id}.webp`;
      else if (['jpg', 'png', 'webp'].includes(type) && img.buf.length <= 5 * 1024 * 1024) {
        // ffmpeg couldn't read it: keep the original when it's already a web format
        await fsp.rm(out, { force: true });
        await fsp.writeFile(path.join(uploadsDir, `${id}.${type}`), img.buf);
        src = `/uploads/${id}.${type}`;
      }
    } finally { await fsp.rm(tmp, { force: true }); }
    if (!src) { await fsp.rm(out, { force: true }); continue; }
    let host = '';
    try { host = new URL(doc.url).hostname.replace(/^www\./, ''); } catch { /* left empty */ }
    return { src, credit: { url: doc.url, host } };
  }
  return null;
}

// a cover that is no longer used by any draft or article (a deleted or replaced draft)
async function dropCover(src, uploadsDir) {
  const m = /^\/uploads\/([a-f0-9]{24}\.(webp|png|jpg))$/.exec(src || '');
  if (m) await fsp.rm(path.join(uploadsDir, m[1]), { force: true }).catch(() => {});
}

module.exports = { coverFrom, dropCover, shareImage, privateIp };
