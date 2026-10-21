/* PuzzleX — admin sign-in.
   Passwords: scrypt with a random salt per user (users.json never holds a password).
   Sessions: a random token in an HttpOnly, SameSite=Strict cookie, kept in memory for 12 hours of inactivity;
   a server restart signs everyone out, which is fine for two editors.
   Brute force: 8 failed attempts per IP or per username in 15 minutes locks that key until the window passes. */
'use strict';

const crypto = require('node:crypto');

const COOKIE = 'px_admin';
const IDLE_MS = 12 * 60 * 60 * 1000;
const FAIL = { max: 8, windowMs: 15 * 60 * 1000 };
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const hashPassword = (password, salt = crypto.randomBytes(16).toString('base64')) =>
  new Promise((ok, no) => crypto.scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? no(err) : ok({ salt, hash: key.toString('base64') }))));

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'base64'), b = Buffer.from(user.hash, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

function createAuth({ store, secureCookies }) {
  const sessions = new Map(); // token → { username, seen }
  const fails = new Map();    // 'ip:…' | 'user:…' → [times]

  const users = () => store.read('users.json', []);
  const findUser = (username) => users().find((u) => u.username === String(username || '').trim().toLowerCase());

  const recent = (key) => (fails.get(key) || []).filter((t) => Date.now() - t < FAIL.windowMs);
  const locked = (...keys) => keys.some((k) => recent(k).length >= FAIL.max);
  const failed = (...keys) => keys.forEach((k) => fails.set(k, [...recent(k), Date.now()]));
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of fails) if (v.every((t) => now - t >= FAIL.windowMs)) fails.delete(k);
    for (const [k, s] of sessions) if (now - s.seen > IDLE_MS) sessions.delete(k);
  }, 60 * 1000).unref();

  async function login(username, password, ip) {
    const keys = [`ip:${ip}`, `user:${String(username).toLowerCase()}`];
    if (locked(...keys)) return { error: 'locked' };
    const user = findUser(username);
    // hash even for unknown users so the response time doesn't reveal which names exist
    const ok = user ? await verifyPassword(String(password), user) : (await hashPassword(String(password)), false);
    if (!ok) { failed(...keys); return { error: 'invalid' }; }
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

module.exports = { createAuth, hashPassword, generatePassword };
