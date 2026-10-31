/* PuzzleX — admin sign-in.
   Passwords: scrypt with a random salt per user (users.json never holds a password).
   Sessions: a random token in an HttpOnly, Secure, SameSite=Strict cookie (named __Host-… over HTTPS, so no
   subdomain can set or read it), kept in memory for 12 hours of inactivity; a server restart signs everyone out,
   which is fine for two editors.
   Brute force: every failed attempt slows the next answer (1, 2, 4, 8 s); 5 failures per IP or per username lock
   that key for 15 minutes, and each further lock within a day doubles it (30, 60 min at most). */
'use strict';

const crypto = require('node:crypto');

const IDLE_MS = 12 * 60 * 60 * 1000;
const FAIL = { max: 5, lockMs: 15 * 60 * 1000, maxLockMs: 60 * 60 * 1000, memoryMs: 24 * 60 * 60 * 1000, maxDelayMs: 8000 };
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const hashPassword = (password, salt = crypto.randomBytes(16).toString('base64')) =>
  new Promise((ok, no) => crypto.scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? no(err) : ok({ salt, hash: key.toString('base64') }))));

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'base64'), b = Buffer.from(user.hash, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// why a new password is too weak, or '' when it's fine (the panel's change form and tools/admin-user.js)
const COMMON = /^(?:password|passw0rd|qwerty|letmein|welcome|admin|puzzlex|puzzlexmedia|123456|iloveyou)/i;
function passwordProblem(password, username = '') {
  const pw = String(password);
  if (pw.length < 12) return 'at least 12 characters';
  if (pw.length > 200) return 'at most 200 characters';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) return 'must not contain the username';
  if (COMMON.test(pw.replace(/[^a-z0-9]/gi, ''))) return 'too common';
  if (new Set(pw).size < 6) return 'too many repeated characters';
  // a long phrase is strong as it is; a shorter one needs a mix of letters, digits and symbols
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(pw)).length;
  if (pw.length < 16 && kinds < 3) return 'under 16 characters it needs 3 of: lowercase, uppercase, digits, symbols';
  return '';
}

// a password people can type: 4 groups of 4 from an alphabet without look-alikes (≈ 95 bits)
function generatePassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += abc[crypto.randomInt(abc.length)];
    groups.push(s);
  }
  return groups.join('-');
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function createAuth({ store, secureCookies }) {
  const sessions = new Map(); // token → { username, seen }
  const fails = new Map();    // 'ip:…' | 'user:…' → { times: [failures since the last lock], until, locks: [lock times] }
  // __Host- makes the browser refuse the cookie unless it is Secure, Path=/ and has no Domain
  const COOKIE = secureCookies() ? '__Host-px_admin' : 'px_admin';

  const users = () => store.read('users.json', []);
  const findUser = (username) => users().find((u) => u.username === String(username || '').trim().toLowerCase());

  const entry = (key) => {
    const now = Date.now();
    const e = fails.get(key) || { times: [], until: 0, locks: [] };
    e.times = e.times.filter((t) => now - t < FAIL.lockMs);
    e.locks = e.locks.filter((t) => now - t < FAIL.memoryMs);
    return e;
  };
  const locked = (...keys) => keys.some((k) => entry(k).until > Date.now());
  // the wait before answering a wrong password: doubles with each recent failure on the worse of the keys
  const delayFor = (...keys) => {
    const n = Math.max(...keys.map((k) => entry(k).times.length));
    return n ? Math.min(1000 * 2 ** (n - 1), FAIL.maxDelayMs) : 0;
  };
  const failed = (...keys) => keys.forEach((k) => {
    const e = entry(k), now = Date.now();
    e.times.push(now);
    if (e.times.length >= FAIL.max) {
      e.locks.push(now);
      e.until = now + Math.min(FAIL.lockMs * 2 ** (e.locks.length - 1), FAIL.maxLockMs);
      e.times = [];
      console.warn(`[admin] sign-in locked for ${k} until ${new Date(e.until).toISOString()}`);
    }
    fails.set(k, e);
  });
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of fails) if (v.until < now && v.times.every((t) => now - t >= FAIL.lockMs) && v.locks.every((t) => now - t >= FAIL.memoryMs)) fails.delete(k);
    for (const [k, s] of sessions) if (now - s.seen > IDLE_MS) sessions.delete(k);
  }, 60 * 1000).unref();

  async function login(username, password, ip) {
    const keys = [`ip:${ip}`, `user:${String(username).toLowerCase()}`];
    if (locked(...keys)) return { error: 'locked' };
    const user = findUser(username);
    // hash even for unknown users so the response time doesn't reveal which names exist
    const ok = user ? await verifyPassword(String(password), user) : (await hashPassword(String(password)), false);
    if (!ok) {
      failed(...keys);
      if (locked(...keys)) return { error: 'locked' };
      await sleep(delayFor(...keys));
      return { error: 'invalid' };
    }
    keys.forEach((k) => fails.delete(k));
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { username: user.username, seen: Date.now() });
    return { token, user: publicUser(user) };
  }

  function sessionFrom(req) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`));
    const s = m && sessions.get(m[1]);
    if (!s || Date.now() - s.seen > IDLE_MS) return null;
    const user = findUser(s.username);
    if (!user) { sessions.delete(m[1]); return null; } // user removed
    s.seen = Date.now();
    return { token: m[1], user: publicUser(user) };
  }

  const cookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies() ? '; Secure' : ''}`;
  const logout = (token) => sessions.delete(token);

  async function setPassword(username, password) {
    const { salt, hash } = await hashPassword(password);
    await store.update('users.json', [], (list) => {
      const u = list.find((x) => x.username === username);
      if (!u) throw new Error(`no user ${username}`);
      Object.assign(u, { salt, hash, changed: new Date().toISOString() });
      return list;
    });
    // other sessions of this user end: a changed password should lock out whoever had the old one
    for (const [k, s] of sessions) if (s.username === username) sessions.delete(k);
  }

  return { login, logout, sessionFrom, cookie, setPassword, verifyPassword, findUser, COOKIE };
}

const publicUser = (u) => ({ username: u.username, name: u.name || u.username });

module.exports = { createAuth, hashPassword, generatePassword, passwordProblem };
