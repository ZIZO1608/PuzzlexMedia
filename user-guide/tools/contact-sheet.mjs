// node contact-sheet.mjs <shotsDir> <out.png> [cols] [id ...] — the captured shots in a grid, with every callout box
// drawn on top (lime outline + key), so wrong selectors are easy to spot. Rendered by headless Chrome.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [dir, out, colsArg, ...ids] = process.argv.slice(2);
const cols = Number(colsArg) || 4;
const list = (ids.length ? ids : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
const W = 420;
const cells = list.map((id) => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  const boxes = Object.entries(m.boxes).map(([k, [x, y, w, h]]) =>
    `<div class="b" style="left:${(x / m.width) * 100}%;top:${(y / m.height) * 100}%;width:${(w / m.width) * 100}%;height:${(h / m.height) * 100}%"><span>${k}</span></div>`).join('');
  return `<figure><figcaption>${id} · ${Math.round(m.width)}×${Math.round(m.height)}</figcaption><div class="c"><img src="file:///${path.resolve(dir, m.image).replace(/\\/g, '/')}">${boxes}</div></figure>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#3a3d44;display:grid;grid-template-columns:repeat(${cols},${W}px);gap:12px;padding:12px;align-items:start;font:12px sans-serif}
figure{margin:0;background:#22252b;padding:6px;border-radius:6px}figcaption{color:#fff;padding:2px 0 6px}
.c{position:relative}.c img{display:block;width:100%}
.b{position:absolute;outline:2px solid #ff2fd0;outline-offset:0}.b span{position:absolute;top:-2px;left:-2px;background:#ff2fd0;color:#fff;font:bold 10px sans-serif;padding:0 3px}
</style>${cells}`;
const tmp = path.resolve(path.dirname(out), '_sheet.html');
fs.writeFileSync(tmp, html);
const rows = Math.ceil(list.length / cols);
execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files',
  `--screenshot=${path.resolve(out)}`, `--window-size=${cols * (W + 12) + 12},${rows * 520 + 40}`, `file:///${tmp.replace(/\\/g, '/')}`], { stdio: 'ignore' });
fs.rmSync(tmp);
console.log(out);
