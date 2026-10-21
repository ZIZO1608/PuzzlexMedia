#!/usr/bin/env node
/* PuzzleX — manage admin panel users (stored hashed in DATA_DIR/users.json).
     node tools/admin-user.js add <username> "<display name>" [password]   new user; prints a generated password if none given
     node tools/admin-user.js passwd <username> [password]                  reset a password (signs that user out on restart)
     node tools/admin-user.js remove <username>
     node tools/admin-user.js list
   On the VPS:  docker compose exec web node tools/admin-user.js list
   A password given on the command line ends up in the shell history: prefer letting the tool generate one. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashPassword, generatePassword } = require('../lib/auth');

const DATA_DIR = path.resolve((process.env.DATA_DIR || path.join(__dirname, '..', 'data')).replace(/^~(?=$|[\\/])/, require('node:os').homedir()));
const FILE = path.join(DATA_DIR, 'users.json');

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };
function write(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
const fail = (msg) => { console.error(msg); process.exit(1); };

(async () => {
  const [cmd, rawName, ...rest] = process.argv.slice(2);
  const username = String(rawName || '').trim().toLowerCase();
  const list = read();
  if (cmd === 'list') {
    if (!list.length) console.log('no users');
    for (const u of list) console.log(`${u.username}\t${u.name}\tcreated ${u.created || '?'}${u.changed ? `\tpassword changed ${u.changed}` : ''}`);
    return;
  }
  if (!/^[a-z][a-z0-9._-]{1,31}$/.test(username)) fail('username: 2–32 characters, a–z 0–9 . _ - (starting with a letter)');
  if (cmd === 'add') {
    const [name, given] = rest;
    if (list.some((u) => u.username === username)) fail(`${username} already exists — use passwd to reset the password`);
    const password = given || generatePassword();
    if (password.length < 10) fail('password: at least 10 characters');
    list.push({ username, name: name || username, ...(await hashPassword(password)), created: new Date().toISOString() });
    write(list);
    console.log(`added ${username}\npassword: ${password}`);
  } else if (cmd === 'passwd') {
    const u = list.find((x) => x.username === username);
    if (!u) fail(`no user ${username}`);
    const password = rest[0] || generatePassword();
    if (password.length < 10) fail('password: at least 10 characters');
    Object.assign(u, await hashPassword(password), { changed: new Date().toISOString() });
    write(list);
    console.log(`new password for ${username}: ${password}\n(restart the server to sign out their open sessions)`);
  } else if (cmd === 'remove') {
    if (!list.some((u) => u.username === username)) fail(`no user ${username}`);
    write(list.filter((u) => u.username !== username));
    console.log(`removed ${username} (restart the server to end their open session)`);
  } else {
    fail('usage: add <username> "<display name>" [password] | passwd <username> [password] | remove <username> | list');
  }
})().catch((e) => fail(e.message));
