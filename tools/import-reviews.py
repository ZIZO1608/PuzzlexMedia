"""Import the Khamsat reviews export (an .xlsx) into the site's client feedback.

  pip install openpyxl
  python -I tools/import-reviews.py Khamsat_Reviews_Adnan_Masry.xlsx [data-dir]

Each review becomes one entry in <data-dir>/testimonials.json (default: data/), its client photo, embedded in
the sheet, a PNG in <data-dir>/uploads/. Running it again adds only the reviews not imported before (the
entry's id comes from the Khamsat review number), so a newer export can be imported over an older one.
Below 4 stars come in hidden, half stars round down (the site shows whole stars); both can be changed
from the admin panel afterwards. The newest reviews come first; the six newest, longest five-star ones
are marked for the home page.
"""
import hashlib
import json
import os
import re
import sys

import openpyxl

HEADER_ROW = 4  # the column titles; the reviews start on the row below
NAME, STARS, QUOTE, SERVICE, DATE, LINK = 0, 3, 5, 6, 7, 9  # columns, from 0
HOME = 6
ARABIC = re.compile(r'[؀-ۿ]')


def tidy_name(name):
    # the sheet keeps the dot of "Noor M." on the wrong side, as it appeared in a right-to-left page
    name = ' '.join(str(name or '').split())
    return name[1:] + '.' if name.startswith('.') else name


def by_language(text):
    return {'ar': text, 'en': ''} if ARABIC.search(text) else {'ar': '', 'en': text}


def main(xlsx, data_dir):
    sheet = openpyxl.load_workbook(xlsx).active
    photos = {img.anchor._from.row + 1: img._data() for img in sheet._images}  # sheet row (from 1) → PNG bytes

    path = os.path.join(data_dir, 'testimonials.json')
    try:
        with open(path, encoding='utf8') as f:
            current = json.load(f)
    except FileNotFoundError:
        current = []
    known = {t['id'] for t in current}
    uploads = os.path.join(data_dir, 'uploads')
    os.makedirs(uploads, exist_ok=True)

    added = []
    for row_no, row in enumerate(sheet.iter_rows(min_row=HEADER_ROW + 1, values_only=True), HEADER_ROW + 1):
        quote = str(row[QUOTE] or '').strip()
        if not row[NAME] or not quote:
            continue
        number = re.search(r'/reviews/(\d+)', str(row[LINK] or ''))
        uid = format(int(number.group(1)) % 0xFFFFFFFF, '08x') if number else hashlib.sha1(f'{row[NAME]}{quote}'.encode()).hexdigest()[:8]
        if uid in known:
            continue
        known.add(uid)

        photo = ''
        if row_no in photos:
            data = photos[row_no]
            name = hashlib.sha256(data).hexdigest()[:24] + '.png'  # the same picture twice is kept once
            with open(os.path.join(uploads, name), 'wb') as f:
                f.write(data)
            photo = f'/uploads/{name}'

        stars = int(float(row[STARS] or 0))
        date = row[DATE].strftime('%Y-%m-%d') if hasattr(row[DATE], 'strftime') else ''
        service = str(row[SERVICE] or '').strip()[:200]
        added.append({
            'id': uid,
            'name': by_language(tidy_name(row[NAME])[:200]),
            'role': by_language(service) if service else {'ar': '', 'en': ''},
            'quote': by_language(quote[:1200]),
            'photo': photo, 'images': [], 'rating': stars, 'date': date,
            'visible': stars >= 4 or stars == 0, 'featured': False,
        })

    # the home page shows the first six marked ones; keep any already chosen, else pick from the new ones
    if not any(t.get('featured') for t in current):
        best = sorted((t for t in added if t['rating'] == 5), key=lambda t: (t['date'][:7], len(t['quote']['ar'] or t['quote']['en'])), reverse=True)
        for t in best[:HOME]:
            t['featured'] = True

    added.sort(key=lambda t: t['date'], reverse=True)
    everything = added + current
    if len(everything) > 500:
        sys.exit(f'{len(everything)} reviews: the site keeps 500 at most. Nothing was written.')
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf8') as f:
        json.dump(everything, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)

    hidden = [t for t in added if not t['visible']]
    print(f'Added {len(added)} reviews ({len(added) - len(hidden)} shown, {len(hidden)} hidden), {len(everything)} in all.')
    for t in hidden:
        print(f"  hidden: {t['name']['ar'] or t['name']['en']} — {t['rating']} stars")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'data')
