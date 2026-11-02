/* PuzzleX — videos, GIFs, sound and PDFs for a project's gallery. A GIF becomes a short silent MP4 (a fraction of the size,
   stamped like any video); sound is re-encoded to M4A with its metadata removed, and needs no mark. The panel sends the file as it is; it's saved to a temporary
   file (never kept in memory), stamped with assets/watermark.png here on the server, and only the stamped copy
   reaches /uploads, so no file without the watermark is ever public. Stamping a video can take minutes, longer than
   a proxy will hold a request open: an upload answers at once with a job id and the panel asks how the job is going.
   One job runs at a time, so a few uploads can't starve the site of CPU. Jobs live in memory: a restart loses them. */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { PDFDocument, degrees } = require('pdf-lib');

const WATERMARK = path.join(__dirname, '..', 'assets', 'watermark.png');
const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const VIDEO_MAX = 500 * 1024 * 1024;
const PDF_MAX = 50 * 1024 * 1024;
const AUDIO_MAX = 50 * 1024 * 1024;
const VIDEO_SIDE = 1920; // the long side of the stored video
const VIDEO_TIMEOUT = 2 * 3600 * 1000;
const JOB_KEEP = 3600 * 1000; // how long a finished job can still be asked about

// the mark's size and margin on a frame or page; admin/admin.js stampImage keeps the same proportions for images
const markSize = (w, h) => ({ width: Math.max(w * 0.2, Math.min(w, h) * 0.28), margin: Math.min(w, h) * 0.03 });

// what the file really is, by its first bytes: never by its name or the type the browser reports
function sniff(head) {
  const text = (from, to) => head.subarray(from, to).toString('latin1');
  if (text(0, 5) === '%PDF-') return 'pdf';
  if (text(0, 4) === 'GIF8') return 'gif';
  if (text(0, 3) === 'ID3' || text(0, 4) === 'OggS' || text(0, 4) === 'fLaC' || (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE')) return 'audio';
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'audio'; // MP3 or AAC with no tags
  if (text(4, 8) === 'ftyp' && /^M4[AB] /.test(text(8, 12))) return 'audio';
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return 'video'; // WebM
  if (['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(head.subarray(4, 8).toString('latin1'))) return 'video'; // MP4, MOV
  return null;
}

function run(args, { onStdout, timeout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    const timer = timeout ? setTimeout(() => child.kill('SIGKILL'), timeout) : null;
    if (onStdout) child.stdout.on('data', onStdout); else child.stdout.resume();
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-20000); });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

// ffmpeg with no output file prints what it read and exits with an error: that is the probe
async function probeVideo(file) {
  const { stderr } = await run(['-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-i', file]);
  const size = stderr.match(/Stream #.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!size) return null;
  const turned = Math.abs(Number((stderr.match(/rotation of (-?[\d.]+) degrees/) || [])[1] || 0)) % 180 === 90;
  const time = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return {
    width: Number(size[turned ? 2 : 1]), height: Number(size[turned ? 1 : 2]),
    seconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0,
  };
}

// a WebM or MP4 can hold nothing but sound (WhatsApp and phone recorders do this)
async function soundOnly(file) {
  const { stderr } = await run(['-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-i', file]);
  return /Stream #.*Audio:/.test(stderr) && !/Stream #.*Video:/.test(stderr);
}

async function encodeAudio(input, output) {
  const { code, stderr } = await run(['-y', '-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-i', input,
    '-vn', '-sn', '-dn', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-f', 'mp4', output], { timeout: VIDEO_TIMEOUT });
  if (code !== 0) {
    console.error('[media] ffmpeg failed:', stderr.slice(-1500));
    throw new UserError('تعذّرت قراءة الملف الصوتي — جرّب تصديره بصيغة MP3');
  }
}

async function stampVideo(input, output, poster, onPercent) {
  const info = await probeVideo(input);
  if (!info) throw new UserError('تعذّرت قراءة الفيديو — جرّب تصديره بصيغة MP4');
  const scale = Math.min(1, VIDEO_SIDE / Math.max(info.width, info.height));
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const w = even(info.width * scale), h = even(info.height * scale);
  const { width, margin } = markSize(w, h);
  // the top corner: a player's controls cover the bottom of the frame whenever it is paused
  const graph = `[0:v]scale=${w}:${h},setsar=1[base];[1:v]scale=${Math.round(width)}:-1[mark];`
    + `[base][mark]overlay=W-w-${Math.round(margin)}:${Math.round(margin)},format=yuv420p[out]`;
  let tail = '';
  const onStdout = (d) => {
    tail = (tail + d).slice(-400);
    const us = [...tail.matchAll(/out_time_us=(\d+)/g)].pop();
    if (us && info.seconds) onPercent(Math.min(99, Math.round(Number(us[1]) / 1e4 / info.seconds)));
  };
  // no metadata carried over (a phone's video holds where it was filmed); faststart so it plays while downloading
  const { code, stderr } = await run(['-y', '-hide_banner', '-nostdin', '-protocol_whitelist', 'file', '-i', input, '-i', WATERMARK,
    '-filter_complex', graph, '-map', '[out]', '-map', '0:a?', '-map_metadata', '-1', '-sn', '-dn',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats', output], { onStdout, timeout: VIDEO_TIMEOUT });
  if (code !== 0) {
    console.error('[media] ffmpeg failed:', stderr.slice(-1500));
    throw new UserError('تعذّرت معالجة الفيديو — جرّب تصديره بصيغة MP4');
  }
  // the still shown before it plays, cut from the stamped copy so it carries the mark too; the page copes without one
  const still = await run(['-y', '-hide_banner', '-nostdin', '-i', output, '-vf', 'thumbnail=90', '-frames:v', '1', '-q:v', '3', '-update', '1', poster]);
  if (still.code !== 0) console.warn('[media] no poster made:', still.stderr.slice(-300));
  return still.code === 0;
}

// page coordinates of the mark's corner for a page shown turned by `angle` (the mark stays upright for the reader)
function placeOnPage(box, angle, vx, vy) {
  if (angle === 90) return { x: box.x + box.width - vy, y: box.y + vx };
  if (angle === 180) return { x: box.x + box.width - vx, y: box.y + box.height - vy };
  if (angle === 270) return { x: box.x + vy, y: box.y + box.height - vx };
  return { x: box.x + vx, y: box.y + vy };
}

async function stampPdf(input, output, onPercent) {
  let doc, pages;
  try {
    doc = await PDFDocument.load(await fsp.readFile(input), { updateMetadata: false });
    pages = doc.getPages(); // a damaged file can load and only fail here
  } catch (err) {
    if (err.name === 'EncryptedPDFError' || /encrypted/i.test(err.message)) throw new UserError('ملف PDF محمي بكلمة مرور — أزل الحماية ثم ارفعه من جديد');
    console.error('[media] unreadable PDF:', err.message);
    throw new UserError('تعذّرت قراءة ملف PDF');
  }
  const mark = await doc.embedPng(await fsp.readFile(WATERMARK));
  pages.forEach((page, i) => {
    const box = page.getCropBox();
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    const viewW = angle % 180 ? box.height : box.width;
    const viewH = angle % 180 ? box.width : box.height;
    const { width, margin } = markSize(viewW, viewH);
    const height = width * (mark.height / mark.width);
    page.drawImage(mark, { ...placeOnPage(box, angle, viewW - width - margin, margin), width, height, rotate: degrees(angle) });
    onPercent(Math.round(((i + 1) / pages.length) * 90));
  });
  await fsp.writeFile(output, await doc.save());
}

// a problem the person uploading can act on: its message is shown in the panel
class UserError extends Error {}

function createMedia({ dataDir, uploadsDir }) {
  const tmpDir = path.join(dataDir, 'tmp');
  fs.rmSync(tmpDir, { recursive: true, force: true }); // what a stopped server left half done
  fs.mkdirSync(tmpDir, { recursive: true });
  const jobs = new Map();
  let queue = Promise.resolve();

  async function processJob(job, input) {
    const name = crypto.randomBytes(12).toString('hex');
    if (job.kind === 'video' && await soundOnly(input).catch(() => false)) job.kind = 'audio';
    const ext = { pdf: 'pdf', audio: 'm4a' }[job.kind] || 'mp4';
    const out = path.join(tmpDir, `${job.id}.out.${ext}`);
    const stillTmp = path.join(tmpDir, `${job.id}.out.jpg`);
    const onPercent = (n) => { job.percent = n; };
    try {
      job.status = 'working';
      await fsp.mkdir(uploadsDir, { recursive: true });
      if (job.kind === 'pdf') {
        await stampPdf(input, out, onPercent);
      } else if (job.kind === 'audio') {
        await encodeAudio(input, out);
      } else if (await stampVideo(input, out, stillTmp, onPercent)) {
        await fsp.rename(stillTmp, path.join(uploadsDir, `${name}.jpg`));
      }
      const final = `${name}.${ext}`;
      await fsp.rename(out, path.join(uploadsDir, final));
      Object.assign(job, { status: 'done', percent: 100, src: `/uploads/${final}` });
      console.log(`[media] ${job.who} added ${final}`);
    } catch (err) {
      if (!(err instanceof UserError)) console.error('[media] stamping failed:', err);
      Object.assign(job, { status: 'failed', error: err instanceof UserError ? err.message : 'تعذّرت إضافة العلامة المائية — حاول مرة أخرى' });
    } finally {
      await Promise.all([input, out, stillTmp].map((f) => fsp.rm(f, { force: true })));
      setTimeout(() => jobs.delete(job.id), JOB_KEEP).unref();
    }
  }

  return {
    // the request's body → a queued job. Returns the job, or throws a UserError / an error with status 413.
    async receive(req, who) {
      const id = crypto.randomBytes(12).toString('hex');
      const input = path.join(tmpDir, `${id}.in`); // no extension: ffmpeg goes by the content we have already checked
      let size = 0;
      const limit = new Transform({
        transform(chunk, _enc, done) {
          size += chunk.length;
          done(size > VIDEO_MAX ? Object.assign(new Error('too large'), { status: 413 }) : null, chunk);
        },
      });
      try {
        await pipeline(req, limit, fs.createWriteStream(input));
        const handle = await fsp.open(input);
        const { buffer } = await handle.read(Buffer.alloc(16), 0, 16, 0).finally(() => handle.close());
        const kind = sniff(buffer);
        if (!kind) throw new UserError('الملفات المقبولة: فيديو MP4 أو MOV أو WebM، أو GIF، أو صوت MP3 أو M4A أو OGG أو WAV، أو ملف PDF');
        if (kind === 'pdf' && size > PDF_MAX) throw new UserError('ملف PDF كبير جداً (الحد 50 ميغابايت)');
        if (kind === 'audio' && size > AUDIO_MAX) throw new UserError('الملف الصوتي كبير جداً (الحد 50 ميغابايت)');
        const job = { id, who, kind, loop: kind === 'gif', status: 'queued', percent: 0 };
        jobs.set(id, job);
        queue = queue.then(() => processJob(job, input));
        return job;
      } catch (err) {
        await fsp.rm(input, { force: true });
        throw err;
      }
    },
    job: (id) => jobs.get(id) || null,
    UserError,
    VIDEO_MAX,
  };
}

module.exports = { createMedia };
