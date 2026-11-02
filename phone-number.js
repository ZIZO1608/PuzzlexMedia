/* PuzzleX — WhatsApp numbers. One file for both sides: the contact form (pages.js) and the server (server.js) accept the
   same numbers and store them the same way, in the international form +9639XXXXXXXX. A number typed with + or 00 keeps its
   own country code; otherwise the one picked next to the field is used. Countries we know are also checked for length. */
'use strict';

(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.PhoneNumber = make();
})(typeof self !== 'undefined' ? self : this, () => {
  // code, Arabic name, English name, shortest and longest number after the code
  const COUNTRIES = [
    ['963', 'سوريا', 'Syria', 9, 9], ['971', 'الإمارات', 'UAE', 8, 9], ['966', 'السعودية', 'Saudi Arabia', 9, 9],
    ['974', 'قطر', 'Qatar', 8, 8], ['965', 'الكويت', 'Kuwait', 8, 8], ['973', 'البحرين', 'Bahrain', 8, 8],
    ['968', 'عُمان', 'Oman', 8, 8], ['962', 'الأردن', 'Jordan', 9, 9], ['961', 'لبنان', 'Lebanon', 7, 8],
    ['964', 'العراق', 'Iraq', 10, 10], ['970', 'فلسطين', 'Palestine', 9, 9], ['20', 'مصر', 'Egypt', 10, 10],
    ['967', 'اليمن', 'Yemen', 9, 9], ['90', 'تركيا', 'Türkiye', 10, 10], ['49', 'ألمانيا', 'Germany', 7, 12],
    ['44', 'بريطانيا', 'UK', 10, 10], ['1', 'أمريكا وكندا', 'US & Canada', 10, 10],
  ];
  const E164 = /^\+[1-9]\d{7,14}$/;
  // Arabic-Indic (٠–٩) and Persian (۰–۹) digits are ordinary on Arabic keyboards: read them as 0–9
  const latinDigits = (s) => String(s).replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));

  // the typed number as +XXXXXXXX, or '' if it can't be a real one
  function normalize(typed, dial = '') {
    const raw = latinDigits(typed).trim();
    if (/[^\d\s()+.-]/.test(raw) || raw.lastIndexOf('+') > 0) return '';
    const num = raw.replace(/[\s().-]/g, '');
    let full;
    if (num.startsWith('+')) full = num;
    else if (num.startsWith('00')) full = `+${num.slice(2)}`;
    else if (dial) full = `+${dial}${num.replace(/^0+/, '')}`; // the 0 people dial at home isn't part of the number
    else return '';
    const known = COUNTRIES.find((c) => full.startsWith(`+${c[0]}`));
    if (known) {
      const rest = full.slice(known[0].length + 1).replace(/^0+/, '');
      if (rest.length < known[3] || rest.length > known[4]) return '';
      full = `+${known[0]}${rest}`;
    }
    return E164.test(full) ? full : '';
  }

  return { COUNTRIES, latinDigits, normalize };
});
