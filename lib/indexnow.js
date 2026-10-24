/* PuzzleX — IndexNow: tells Bing (and through it ChatGPT search), Yandex, Naver, Seznam and Yep that pages changed,
   so they re-read them within minutes instead of waiting for their next crawl.
   - The key is made on first start and kept in DATA_DIR/indexnow.json; the site serves it at /<key>.txt,
     which is how the search engines check the submission really comes from this site.
   - Every page is submitted (a few dozen URLs) a minute after an admin-panel save, and once after a deploy that
     changed the pages. On only when INDEXNOW=1, so a copy running on someone's computer never submits the live site.
   https://www.indexnow.org/documentation */
'use strict';

const crypto = require('node:crypto');

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const QUIET_MS = 60 * 1000;          // wait for a minute without saves, so a burst of edits is one submission
const AFTER_START_MS = 30 * 1000;    // after a deploy, give the proxy time to route to the new server first
const CONTENT = new Set(['texts.json', 'projects.json', 'partners.json', 'settings.json']);

function createIndexNow({ store, siteUrl, urls, signature, enabled }) {
  const STATE = 'indexnow.json';
  let state = store.read(STATE, {});
  const key = process.env.INDEXNOW_KEY || state.key || crypto.randomBytes(16).toString('hex');
  const host = new URL(siteUrl).host;
  let timer = null;

  const remember = async (patch) => { state = { ...state, ...patch, key }; await store.write(STATE, state); };

  async function submit(reason) {
    const urlList = urls();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host, key, keyLocation: `${siteUrl}/${key}.txt`, urlList }),
        signal: AbortSignal.timeout(15000),
      });
      // 200 / 202: accepted. 403: key file not reachable yet; 422: URLs not on this host; 429: too often
      if (res.status !== 200 && res.status !== 202) {
        console.warn(`[indexnow] ${reason}: ${urlList.length} URLs refused (${res.status}) ${(await res.text()).slice(0, 200)}`);
        return false;
      }
      console.log(`[indexnow] ${reason}: ${urlList.length} URLs submitted (${res.status})`);
      await remember({ lastSignature: signature(), lastSubmitted: new Date().toISOString() });
      return true;
    } catch (err) {
      console.warn(`[indexnow] ${reason}: could not reach IndexNow (${err.message})`);
      return false;
    }
  }

  function schedule(reason) {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => submit(reason), QUIET_MS);
    timer.unref();
  }

  if (enabled) {
    if (state.key !== key) remember({}).catch((err) => console.error('[indexnow] could not save the key', err));
    store.onChange((name) => { if (CONTENT.has(name)) schedule(`${name} saved`); });
    // a deploy that changed the pages (or the first start) submits once; a plain restart doesn't
    setTimeout(() => { if (signature() !== state.lastSignature) submit('pages changed since last submission'); }, AFTER_START_MS).unref();
  }

  return {
    enabled,
    keyPath: `/${key}.txt`,
    key,
  };
}

module.exports = { createIndexNow };
