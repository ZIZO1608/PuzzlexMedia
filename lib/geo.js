/* PuzzleX — which country a visit comes from, worked out on this server from the visitor's IP (which is then
   thrown away: only the two-letter country is kept, see lib/analytics.js).
   The data is DB-IP's free "IP to Country Lite" (CC BY 4.0, https://db-ip.com), updated monthly. The server
   downloads it on its own into DATA_DIR/geo/, turns it into a compact binary file (about 7 MB) and checks
   once a day for the new month's file. Until the first download finishes, visits simply have no country. */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');
const { Readable } = require('node:stream');

const MAGIC = 'PXG1';
const month = (d) => d.toISOString().slice(0, 7);

function ipv4(s) {
  const p = s.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    const v = Number(x);
    if (!/^\d{1,3}$/.test(x) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}
// the first 64 bits of an IPv6 address (plenty to tell countries apart)
function ipv6(s) {
  if (!s.includes(':')) return null;
  const [head, tail = null] = s.split('::');
  if (s.split('::').length > 2) return null;
  const a = head ? head.split(':') : [];
  const b = tail === null ? [] : tail ? tail.split(':') : [];
  if (b.length && b[b.length - 1].includes('.')) return null; // embedded IPv4: handled by the caller
  const groups = tail === null ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.slice(0, 4).reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}
const code = (cc) => (cc.charCodeAt(0) << 8) | cc.charCodeAt(1);
const uncode = (n) => String.fromCharCode(n >> 8, n & 255);

function createGeo({ dataDir, enabled = true }) {
  const dir = path.join(dataDir, 'geo');
  let db = null; // { v4s, v4e, v4c, v6s, v6e, v6c, month }
  let busy = false;

  function load(file) {
    const buf = fs.readFileSync(file);
    if (buf.toString('ascii', 0, 4) !== MAGIC) throw new Error('not a geo file');
    const n4 = buf.readUInt32LE(4), n6 = buf.readUInt32LE(8);
    let off = 12;
    const take = (Type, n, size) => { const a = new Type(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + n * size)); off += n * size; return a; };
    const v4s = take(Uint32Array, n4, 4), v4e = take(Uint32Array, n4, 4), v4c = take(Uint16Array, n4, 2);
    off = Math.ceil(off / 8) * 8;
    const v6s = take(BigUint64Array, n6, 8), v6e = take(BigUint64Array, n6, 8), v6c = take(Uint16Array, n6, 2);
    db = { v4s, v4e, v4c, v6s, v6e, v6c, month: path.basename(file).slice(8, 15) };
  }

  // DB-IP's CSV (start,end,country) → the binary file; neighbouring ranges of one country are merged
  async function build(m) {
    const res = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${m}.csv.gz`);
    if (!res.ok) throw Object.assign(new Error(`download ${res.status}`), { status: res.status });
    const lines = readline.createInterface({ input: Readable.fromWeb(res.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    const v4 = [[], [], []], v6 = [[], [], []];
    const push = (t, s, e, c) => {
      const i = t[0].length - 1;
      if (i >= 0 && t[2][i] === c && t[1][i] + (typeof s === 'bigint' ? 1n : 1) >= s) { if (e > t[1][i]) t[1][i] = e; return; }
      t[0].push(s); t[1].push(e); t[2].push(c);
    };
    for await (const line of lines) {
      const [a, b, cc] = line.split(',');
      if (!cc || !/^[A-Z]{2}$/.test(cc) || cc === 'ZZ') continue;
      const s4 = ipv4(a);
      if (s4 !== null) { push(v4, s4, ipv4(b), code(cc)); continue; }
      const s6 = ipv6(a), e6 = ipv6(b);
      if (s6 !== null && e6 !== null) push(v6, s6, e6, code(cc));
    }
    if (v4[0].length < 1000) throw new Error('the download looks incomplete');
    const head = Buffer.alloc(12);
    head.write(MAGIC, 0, 'ascii'); head.writeUInt32LE(v4[0].length, 4); head.writeUInt32LE(v6[0].length, 8);
    const parts = [head, Buffer.from(Uint32Array.from(v4[0]).buffer), Buffer.from(Uint32Array.from(v4[1]).buffer), Buffer.from(Uint16Array.from(v4[2]).buffer)];
    const len = parts.reduce((x, p) => x + p.length, 0);
    parts.push(Buffer.alloc(Math.ceil(len / 8) * 8 - len));
    parts.push(Buffer.from(BigUint64Array.from(v6[0]).buffer), Buffer.from(BigUint64Array.from(v6[1]).buffer), Buffer.from(Uint16Array.from(v6[2]).buffer));
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `country-${m}.bin`);
    await fsp.writeFile(`${file}.tmp`, Buffer.concat(parts));
    await fsp.rename(`${file}.tmp`, file);
    return file;
  }

  // use the newest file on disk; download this month's (or last month's, early in a month) when missing
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      await fsp.mkdir(dir, { recursive: true });
      const files = (await fsp.readdir(dir)).filter((f) => /^country-\d{4}-\d{2}\.bin$/.test(f)).sort();
      const newest = files[files.length - 1];
      if (newest && (!db || db.month !== newest.slice(8, 15))) load(path.join(dir, newest));
      const now = new Date(), want = month(now);
      if (newest && newest.slice(8, 15) >= want) return;
      if (newest && now.getUTCDate() < 3) return; // the new month's file appears a day or two in
      let file;
      try { file = await build(want); } catch (err) {
        if (err.status !== 404) throw err;
        const last = month(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
        if (newest && newest.slice(8, 15) >= last) return;
        file = await build(last);
      }
      load(file);
      for (const f of files) if (path.join(dir, f) !== file) await fsp.unlink(path.join(dir, f)).catch(() => {});
      console.log(`[geo] country data ${db.month} ready (${db.v4s.length} IPv4 + ${db.v6s.length} IPv6 ranges)`);
    } catch (err) {
      console.error('[geo] could not update the country data:', err.message);
    } finally { busy = false; }
  }

  const find = (starts, ends, codes, ip) => {
    let lo = 0, hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] > ip) hi = mid - 1;
      else if (ends[mid] < ip) lo = mid + 1;
      else return uncode(codes[mid]);
    }
    return '';
  };
  // 'SY', 'AE', … or '' when unknown
  function country(ip) {
    if (!db || !ip) return '';
    const s = String(ip).trim().replace(/^::ffff:/i, '').replace(/%.*$/, '');
    const v4 = ipv4(s);
    if (v4 !== null) return find(db.v4s, db.v4e, db.v4c, v4);
    const v6 = ipv6(s);
    return v6 === null ? '' : find(db.v6s, db.v6e, db.v6c, v6);
  }

  if (enabled) {
    setTimeout(refresh, 5000).unref();
    setInterval(refresh, 24 * 3600 * 1000).unref();
  }
  return { country, refresh, get ready() { return Boolean(db); } };
}

module.exports = { createGeo, ipv4, ipv6 };
