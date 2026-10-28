/* PuzzleX admin — reading and writing simple Excel files without a library.
   An .xlsx file is a zip of XML files. Reading takes the first sheet's cells as rows of text (dates typed as
   dates come back as Excel day numbers; the caller converts them). Writing makes a workbook of plain text
   sheets: bold lime header row, frozen, right-to-left when asked, with drop-down lists for chosen columns.
   CSV ("Save as CSV" in Excel or Google Sheets) is read too. Uses DecompressionStream, in every current browser. */
'use strict';

const XLSX = (() => {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /* ---------- reading ---------- */
  // the zip's table of contents is at its end; each entry is stored as is or deflated
  function unzip(buf) {
    const dv = new DataView(buf);
    let end = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('zip');
    const files = new Map();
    let p = dv.getUint32(end + 16, true);
    for (let n = dv.getUint16(end + 10, true); n > 0; n--) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
      const nameLen = dv.getUint16(p + 28, true);
      files.set(dec.decode(new Uint8Array(buf, p + 46, nameLen)), {
        method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), at: dv.getUint32(p + 42, true),
      });
      p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }
    return async (name) => {
      const f = files.get(name);
      if (!f) return null;
      const start = f.at + 30 + dv.getUint16(f.at + 26, true) + dv.getUint16(f.at + 28, true);
      const data = new Uint8Array(buf, start, f.size);
      if (f.method === 0) return dec.decode(data);
      if (f.method !== 8) throw new Error('zip');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
  }

  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const all = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
  // the text of a shared or inline string: its <t> runs, without phonetic hints
  const textOf = (node) => (node ? all(node, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('') : '');
  const colIndex = (ref) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  async function readXlsx(buf) {
    const read = unzip(buf);
    let path = 'xl/worksheets/sheet1.xml';
    const [book, rels] = await Promise.all([read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels')]);
    if (book && rels) {
      const first = all(parse(book), 'sheet')[0];
      const id = first && (first.getAttributeNS(REL, 'id') || first.getAttribute('r:id'));
      const rel = all(parse(rels), 'Relationship').find((r) => r.getAttribute('Id') === id);
      if (rel) { const t = rel.getAttribute('Target'); path = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`; }
    }
    const [sheet, strings] = await Promise.all([read(path), read('xl/sharedStrings.xml')]);
    if (!sheet) throw new Error('sheet');
    const shared = strings ? all(parse(strings), 'si').map(textOf) : [];
    const rows = [];
    for (const row of all(parse(sheet), 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const cells = [];
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r');
        const v = all(c, 'v')[0];
        const type = c.getAttribute('t');
        cells[ref ? colIndex(ref) : cells.length] = type === 's' ? shared[Number(v && v.textContent)] ?? ''
          : type === 'inlineStr' ? textOf(all(c, 'is')[0]) : v ? v.textContent : '';
      }
      rows[Number.isInteger(r) && r >= 0 ? r : rows.length] = Array.from(cells, (x) => x ?? '');
    }
    return Array.from(rows, (r) => r || []);
  }

  // quoted fields may hold commas and line breaks; the separator is whichever of , ; tab the header uses most
  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    const head = text.split(/\r?\n/, 1)[0];
    const sep = [',', ';', '\t'].reduce((a, b) => (head.split(b).length > head.split(a).length ? b : a));
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') field += ch;
        else if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // rows of text from an .xlsx or .csv file; the old binary .xls isn't supported
  async function read(file) {
    if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv') return readCsv(await file.text());
    const buf = await file.arrayBuffer();
    const sig = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (sig[0] === 0xd0 && sig[1] === 0xcf) throw new Error('الملف بصيغة Excel القديمة (.xls) — احفظه من Excel بصيغة .xlsx ثم أعد المحاولة');
    if (sig[0] !== 0x50 || sig[1] !== 0x4b) throw new Error('هذا ليس ملف Excel (.xlsx) ولا CSV');
    try { return await readXlsx(buf); } catch { throw new Error('تعذّرت قراءة ملف Excel — احفظه من جديد بصيغة .xlsx وأعد المحاولة'); }
  }

  /* ---------- writing ---------- */
  const CRC = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  // a zip with every file stored as is (no compression needed for a few KB of XML)
  function zip(files) {
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const [path, text] of Object.entries(files)) {
      const name = enc.encode(path), data = enc.encode(text), crc = crc32(data);
      const head = (size, sig) => {
        const dv = new DataView(new ArrayBuffer(size));
        dv.setUint32(0, sig, true);
        return dv;
      };
      const local = head(30, 0x04034b50);
      [[4, 20], [6, 0x0800], [8, 0], [10, time], [12, date], [26, name.length], [28, 0]].forEach(([at, v]) => local.setUint16(at, v, true));
      [[14, crc], [18, data.length], [22, data.length]].forEach(([at, v]) => local.setUint32(at, v, true));
      const entry = head(46, 0x02014b50);
      [[4, 20], [6, 20], [8, 0x0800], [10, 0], [12, time], [14, date], [28, name.length]].forEach(([at, v]) => entry.setUint16(at, v, true));
      [[16, crc], [20, data.length], [24, data.length], [42, offset]].forEach(([at, v]) => entry.setUint32(at, v, true));
      parts.push(local, name, data);
      central.push(entry, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, x) => s + x.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, Object.keys(files).length, true);
    end.setUint16(10, Object.keys(files).length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); // not allowed in XML
  const colName = (i) => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

  // sheet: { name, rows: [[text or number]], rtl, widths: [chars], lists: { columnIndex: ['a', 'b'] } }
  function sheetXml({ rows, rtl, widths = [], lists = {} }) {
    const cell = (v, r, c) => {
      if (v === '' || v == null) return '';
      const ref = `${colName(c)}${r + 1}`, style = r === 0 ? 1 : 2;
      return typeof v === 'number'
        ? `<c r="${ref}" s="${style}"><v>${v}</v></c>`
        : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    };
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const data = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`).join('');
    const checks = Object.entries(lists).map(([c, values]) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(Number(c))}2:${colName(Number(c))}1000"><formula1>"${esc(values.join(','))}"</formula1></dataValidation>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${data}</sheetData>${checks.length ? `<dataValidations count="${checks.length}">${checks.join('')}</dataValidations>` : ''}</worksheet>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7FF00"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function write(sheets) {
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': STYLES,
    };
    sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
    return zip(files);
  }

  function download(blob, filename) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  return { read, write, download };
})();
