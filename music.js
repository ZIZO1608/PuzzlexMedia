/* PuzzleX — background music, off until the visitor turns it on with the speaker button.
   The track fades in and out on its own, so each play starts while the last one is fading out
   and the loop never goes quiet. Once on, it carries on from the same spot on the next page and
   pauses while the tab is hidden. The file is only downloaded when the music is turned on.
   Uses audio, unlockAudio, ROOT from main.js. */

(function initMusic() {
  const btn = document.querySelector('.music-toggle');
  if (!btn) return;
  const KEY = 'puzzlex-music'; // 'on' once the visitor turned it on
  const AT = 'puzzlex-music-at'; // where in the track the last page stopped (this tab only)
  const SRC = ROOT + 'assets/audio/ambient.mp3?v=1';
  const VOLUME = 0.28;
  const OVERLAP = 3.5; // seconds of the track's own fade-out that the next play starts under
  const FADE_IN = 1.5, FADE_OUT = 0.6;

  let on = false;
  let buffer = null, loading = null;
  let out = null; // this playing session's volume, faded in and out
  let sources = [], starts = [], timer = 0;

  const read = (store, key) => { try { return store.getItem(key); } catch (e) { return null; } };
  const write = (store, key, value) => { try { store.setItem(key, value); } catch (e) { /* private mode: just not remembered */ } };

  const label = () => btn.setAttribute('aria-pressed', String(on));

  // an empty or failed answer is tried again a couple of times; offline, a later click tries again
  function load(tries = 3) {
    loading ||= fetch(SRC)
      .then((r) => { if (r.status !== 200) throw new Error(r.status); return r.arrayBuffer(); })
      .then((data) => audio.decodeAudioData(data))
      .then((decoded) => { buffer = decoded; })
      .catch(() => {
        loading = null;
        if (tries > 1) return new Promise((r) => setTimeout(r, 500)).then(() => load(tries - 1));
      });
    return loading;
  }

  // where in the track it is now, by the latest play that has started
  function position() {
    const now = audio.currentTime;
    const at = starts.filter((s) => s <= now).pop();
    return at === undefined ? 0 : (now - at) % buffer.duration;
  }

  // one play of the track from `offset`, starting at `when`; the next one is queued to start under its fade-out
  function queue(when, offset) {
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start(when, offset);
    sources.push(src);
    src.onended = () => { sources = sources.filter((s) => s !== src); };
    starts = [...starts.slice(-1), when - offset];
    const next = when + buffer.duration - offset - OVERLAP;
    timer = setTimeout(() => queue(next, 0), Math.max(0, next - audio.currentTime - 1) * 1000);
  }

  async function start() {
    unlockAudio();
    await load();
    if (!on || !buffer || out) return;
    if (audio.state !== 'running') { // no click on this page yet: begin on the first one
      audio.addEventListener('statechange', function wait() {
        if (audio.state !== 'running') return;
        audio.removeEventListener('statechange', wait);
        start();
      });
      return;
    }
    let offset = parseFloat(read(sessionStorage, AT)) || 0;
    if (offset > buffer.duration - OVERLAP - 1) offset = 0; // too close to the end: start over
    const t = audio.currentTime + 0.05;
    out = audio.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(VOLUME, t + FADE_IN);
    out.connect(audio.destination);
    queue(t, offset);
  }

  function stop() {
    if (!out) return;
    write(sessionStorage, AT, String(position()));
    clearTimeout(timer);
    const t = audio.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT);
    sources.forEach((s) => s.stop(t + FADE_OUT));
    const fading = out;
    setTimeout(() => fading.disconnect(), (FADE_OUT + 0.1) * 1000);
    out = null;
    sources = [];
    starts = [];
  }

  btn.addEventListener('click', () => {
    on = !on;
    write(localStorage, KEY, on ? 'on' : 'off');
    label();
    if (on) start(); else stop();
  });

  window.addEventListener('pagehide', () => { if (out) write(sessionStorage, AT, String(position())); });
  document.addEventListener('visibilitychange', () => {
    if (!on || !audio) return;
    if (document.hidden) audio.suspend();
    else audio.resume();
  });

  on = read(localStorage, KEY) === 'on';
  label();
  if (on) start();
})();
