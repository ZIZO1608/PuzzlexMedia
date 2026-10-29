/* PuzzleX — the editable content kept in DATA_DIR (a Docker volume, so edits survive updates):
     texts.json      { [arabic default text]: { ar, en } }   only the texts someone changed
     projects.json   { sectors: { key: { ar, en } }, projects: [ … ] }
     partners.json   [ { id, src, name } ]                    order = order in the partners puzzle
     settings.json   { phone, email, whatsapp, website, linkedin, instagram, x, facebook }
     testimonials.json [ { id, name, role, quote: { ar, en }, photo, images, rating, date, visible, featured } ]
                     order = order on the feedback page; featured ones (up to 6) also show on the home page
     users.json      [ { username, name, salt, hash } ]       see lib/auth.js
     messages.jsonl  one contact-form message per line
     uploads/        images added from the admin panel
   Writes go through a temp file + rename, one at a time, so a crash or two admins saving together
   can never leave half a file behind. */
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function createStore({ dataDir, root }) {
  const file = (name) => path.join(dataDir, name);
  const cache = new Map(); // name → { value, mtimeMs } (parsed JSON, and the file's time when it was read)
  let version = Date.now(); // bumped on every write; pages cache their output per version
  const mtimeOf = (name) => { try { return fs.statSync(file(name)).mtimeMs; } catch { return 0; } };
  let queue = Promise.resolve();

  // run file work one job at a time (single Node process, so this is enough)
  const serial = (job) => {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
  };

  // re-read when the file changed outside the server, e.g. tools/admin-user.js adding a user while it runs
  function read(name, fallback) {
    const mtimeMs = mtimeOf(name);
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value;
    let value = fallback;
    try { value = JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`${name} is not valid JSON — fix or remove it (${err.message})`);
    }
    if (hit) version = Date.now(); // changed on disk: pages built from the old copy must be rebuilt
    cache.set(name, { value, mtimeMs });
    return value;
  }

  async function writeNow(name, value) {
    await fsp.mkdir(dataDir, { recursive: true });
    const tmp = file(`${name}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    await fsp.writeFile(tmp, JSON.stringify(value, null, 1), 'utf8');
    await fsp.rename(tmp, file(name));
    cache.set(name, { value, mtimeMs: mtimeOf(name) });
    version = Date.now();
    for (const fn of listeners) fn(name);
  }
  const listeners = [];
  const onChange = (fn) => { listeners.push(fn); }; // fn(file name) after every successful write
  const write = (name, value) => serial(() => writeNow(name, value));
  // read-modify-write as one step, so concurrent edits of different keys don't overwrite each other
  const update = (name, fallback, fn) => serial(async () => {
    const next = await fn(structuredClone(read(name, fallback)));
    await writeNow(name, next);
    return next;
  });

  /* ---------- first start: seed from the files in the repo ---------- */
  function seed() {
    fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
    if (!fs.existsSync(file('projects.json'))) {
      fs.writeFileSync(file('projects.json'), JSON.stringify(seedProjects(root), null, 1));
    }
    if (!fs.existsSync(file('partners.json'))) {
      const partners = Array.from({ length: 48 }, (_, i) => {
        const id = `p${String(i + 1).padStart(2, '0')}`;
        return { id, src: `assets/partners/${id}.webp`, name: '' };
      });
      fs.writeFileSync(file('partners.json'), JSON.stringify(partners, null, 1));
    }
    if (!fs.existsSync(file('settings.json'))) {
      fs.writeFileSync(file('settings.json'), JSON.stringify(DEFAULT_SETTINGS, null, 1));
    }
    if (!fs.existsSync(file('texts.json'))) fs.writeFileSync(file('texts.json'), '{}');
    if (!fs.existsSync(file('testimonials.json'))) fs.writeFileSync(file('testimonials.json'), '[]');
  }

  // messages: append-only from the contact form; the admin can mark read / delete
  const MSG = 'messages.jsonl';
  async function readMessages() {
    let raw = '';
    try { raw = await fsp.readFile(file(MSG), 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    return raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  const appendMessage = (m) => serial(async () => {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.appendFile(file(MSG), JSON.stringify(m) + '\n', 'utf8');
  });
  const rewriteMessages = (fn) => serial(async () => {
    const list = fn(await readMessages());
    const tmp = file(`${MSG}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    await fsp.writeFile(tmp, list.map((m) => JSON.stringify(m)).join('\n') + (list.length ? '\n' : ''), 'utf8');
    await fsp.rename(tmp, file(MSG));
    return list;
  });

  return {
    dataDir, uploadsDir: path.join(dataDir, 'uploads'),
    // a file changed on disk (an import, a copy from another server) must show without a restart: pages ask for
    // the version before they read anything, so look for such changes here too
    get version() {
      for (const [name, hit] of cache) if (mtimeOf(name) !== hit.mtimeMs) read(name, hit.value);
      return version;
    },
    read, write, update, onChange, seed, readMessages, appendMessage, rewriteMessages,
  };
}

const DEFAULT_SETTINGS = {
  phone: '', email: '', whatsapp: '', website: 'https://www.puzzlexmedia.com',
  linkedin: '', instagram: '', x: '', facebook: '',
};

// projects.js is the original browser data file: run it once per language and keep both
function seedProjects(root) {
  const code = fs.readFileSync(path.join(root, 'projects.js'), 'utf8');
  const run = (lang) => vm.runInNewContext(`${code}\n;({ PROJECTS, SECTORS })`, { document: { documentElement: { lang } } });
  const ar = run('ar'), en = run('en');
  const pair = (a, e) => ({ ar: a ?? '', en: e ?? '' });
  return {
    sectors: Object.fromEntries(Object.keys(ar.SECTORS).map((k) => [k, pair(ar.SECTORS[k], en.SECTORS[k])])),
    projects: ar.PROJECTS.map((p, i) => {
      const q = en.PROJECTS[i];
      return {
        id: p.id, sector: p.sector, year: p.year || '',
        client: pair(p.client, q.client), title: pair(p.title, q.title), summary: pair(p.summary, q.summary),
        services: { ar: p.services, en: q.services },
        logo: `assets/partners/${p.logo}.webp`, colors: p.colors, cover: '', gallery: [],
      };
    }),
  };
}

module.exports = { createStore, DEFAULT_SETTINGS };
