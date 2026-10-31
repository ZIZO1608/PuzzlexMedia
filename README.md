# PuzzleX Media — website

Bilingual website (Arabic RTL at `/`, English LTR at `/en/`) for PuzzleX Media —
"نحن القطعة الناقصة في أحجيتك", *we are the missing piece in your puzzle*.

Plain HTML, CSS and JavaScript (GSAP 3.12.5, kept in `assets/vendor/`), served by a small Node server that also
handles the contact form. Ships as one Docker image.

## Deploy on a VPS (Docker)

```bash
git clone https://github.com/AhmadowMP3/PuzzlexMedia.git puzzlex
cd puzzlex
cp .env.example .env      # then edit .env (email settings, see below)
docker compose up -d --build
```

The site is now on port **8080**. Check it with `curl http://localhost:8080/healthz`.

**Domain + HTTPS:** put a reverse proxy in front (nginx, Caddy, Traefik or Cloudflare) that forwards
`www.puzzlexmedia.com` to `127.0.0.1:8080`, and set `TRUST_PROXY=1` in `.env`. With a proxy on the same
server, change the port line in `docker-compose.yml` to `"127.0.0.1:8080:8080"` so 8080 isn't public.
A minimal Caddy setup:

```
www.puzzlexmedia.com {
    reverse_proxy 127.0.0.1:8080
}
puzzlexmedia.com {
    redir https://www.puzzlexmedia.com{uri}
}
```

**Update after changes:** `git pull && docker compose up -d --build`

## Visitor statistics

`track.js` (added to every page by the server) sends page views, clicks on buttons and links, and time on
page to `/api/track`; the admin panel shows them under «الإحصائيات». Everything stays on this server in
`/data/analytics/YYYY-MM-DD.jsonl`, one file per day, deleted after `ANALYTICS_DAYS` (default 395). IP addresses
are never written: visitors are counted with a daily anonymous code. Visitors who press «موافق» in the
site's privacy banner also get a random visit id, so the panel can show each visit's path. Bots and
signed-in admins aren't counted. See `lib/analytics.js`.

Each click also keeps where it landed (the element and the spot inside it), so «خريطة النقرات» can open the
real page in the panel with a dot on every click, or one visitor's clicks in order. The country comes from
the IP at the moment of the visit (`lib/geo.js`, DB-IP's free data, downloaded into `/data/geo` and refreshed
monthly); the IP itself is not kept. With `CLARITY_ID` set, visitors who accept the banner are also recorded by
Microsoft Clarity (videos and heatmaps at clarity.microsoft.com).

## Contact form

Every message is appended to `/data/messages.jsonl` inside the container (a Docker volume, kept across
updates). To read them:

```bash
docker compose exec web cat /data/messages.jsonl
```

To also get each message by email, fill in `CONTACT_TO` and the `SMTP_*` settings in `.env` and run
`docker compose up -d`. If email fails, the message is still saved and the error is in `docker compose logs`.

Built in: required-field checks on both sides, a hidden spam-trap field, 5 messages per visitor per
10 minutes, 16 KB size limit.

## Admin panel (`/admin`)

At `/admin/` the team edits the site without touching code:

- **Texts**: every text on every page, Arabic and English side by side (including page titles, share
  descriptions and the texts drawn by the animations). Shared texts, such as the menu links, change everywhere at once.
- **Projects**: add, edit, delete and reorder projects; upload the cover and gallery images.
- **Partner logos**: the logos in the partners puzzle. The puzzle resizes itself (5×5 for up to 24, 7×7 for up to 48, 9×9 for up to 80).
- **Client feedback**: the feedback page (`/feedback.html`, «آراء العملاء» in the menu). Each review has a name, role /
  company, the quote in Arabic and English, an optional photo or partner logo, 1–5 stars, a date and up to 6 attached
  images (chat screenshots, the finished work) that open in a full-screen viewer. The page opens with the average rating
  and the count per star, and filters by 5 stars / 4 stars / with photos. Reviews marked «في الصفحة الرئيسية» (the first 6)
  also show in "What our clients say" on the home page. Hide one to take it off the site without deleting it; with none
  shown, the home section is left out and the page (still in the menu) says there are no reviews yet.
  **Excel**: «استيراد من Excel» takes an .xlsx or .csv (Excel, Google Sheets), one row per review; download the template
  from the same window (its second sheet explains every column). Pick the images in the same window and write each file's
  name in the photo / images columns. Every row is checked before anything is added (errors, warnings, duplicates of
  reviews already there), and nothing is saved until «حفظ التغييرات». «تصدير إلى Excel» downloads the current reviews in
  the same format, so they can be edited in bulk and imported back with «استبدال كل الآراء الحالية». Up to 500 reviews.
  **Order**: «⇅ ترتيب بالسحب» opens every review in a compact list: drag one by its ⋮⋮ handle (mouse or finger), press ⤒
  to send it to the top, or use Alt + ↑ / ↓. Rows that show on the home page carry a «في الرئيسية» badge. The feedback page
  and the home page follow this order once it's saved. Reviews are never shown with their date.
  **English**: reviews imported in Arabic only get their English from `content/reviews-en.json` when the server starts
  (matched by the Arabic name + text, so it works whatever ids the import gave them). Only empty English fields are
  filled; anything typed in the panel wins.
- **Blog** («المدونة»): articles in Arabic and/or English, each with a title, a short description (Google's snippet, with a
  preview of the result and a character count), the text (blank-line paragraphs, `##` / `###` headings, `-` / `1.` lists,
  `**bold**`, `[text](https://…)` links; a toolbar adds them and «معاينة» shows the result), an optional cover, a date and
  published / draft. An article shows in a language once it has a title and a text in it. The blog page (`/blog.html`)
  lists them newest first, the home page shows the latest three ("From the blog", left out with none), and each article
  has its own page (`/article.html?id=…`) drawn in full on the server, with BlogPosting schema, its own canonical,
  hreflang only for the languages it exists in, and a place in the sitemap. Three launch articles come with a fresh install
  (`content/articles-seed.json`, copied once into `articles.json`).
- **Contact & links**: phone, WhatsApp, email, website and social links (empty = left off the site: no "coming soon", no dead icon).
- **Messages**: the contact-form inbox, with read / unread and delete.

On every page: a round WhatsApp button bottom-left (once a number is set) that says hello in a bubble once per visit, and
a back-to-top jigsaw piece bottom-right whose outline draws itself as you read and turns lime at the end of the page.
On phones both step aside while the home page's service-request bar is on screen. The home page also has «اطلب خدمتك»
(right after the client feedback): pick services on four cards, and the button opens the contact form with them chosen
(`contact.html?services=…`).

Edits are saved in `/data` (the Docker volume) and show on the site immediately: `texts.json`, `projects.json`,
`partners.json`, `settings.json`, `testimonials.json`, `articles.json`, `invoices.json`, `uploads/`. On first start these are created from the files in the repo, so a fresh
install looks exactly like the code. Images are resized and converted to WebP in the browser before they're uploaded.

**Users** are kept in `/data/users.json` with hashed passwords only. Manage them with the included tool:

```bash
docker compose exec web node tools/admin-user.js add hussein "حسين"     # prints a generated password
docker compose exec web node tools/admin-user.js passwd hussein         # new generated password
docker compose exec web node tools/admin-user.js list
docker compose exec web node tools/admin-user.js remove hussein
```

Locally (without Docker) drop the `docker compose exec web` part. Everyone can change their own password in the panel.

Security: sessions are HttpOnly, SameSite=Strict cookies (12 hours idle); 8 wrong passwords in 15 minutes lock that
IP / username for 15 minutes; every change needs the panel's own header and same-origin requests; uploads must really
be JPG / PNG / WebP (SVG is refused); everything editors type is shown as text, never as HTML. The panel needs HTTPS in
production (the cookie is `Secure`); for plain-HTTP testing on another machine set `COOKIE_SECURE=0`.

**Backups**: everything the team edits is in the volume. Back it up with
`docker run --rm -v puzzlex-data:/data -v "$PWD":/backup alpine tar czf /backup/puzzlex-data.tgz -C /data .`

## Invoices & receipts (`/admin/#/invoices`)

«الفواتير والإيصالات» in the panel makes invoices (`INV-2026-0001`), payment receipts (`RCT-…`) and quotations (`QUO-…`),
in Arabic or English. The server gives the numbers (per type, per year) and works out every total in whole cents (fils for
KWD/BHD/OMR/JOD), so the stored and printed amounts never drift. A receipt «عن الفاتورة» pays that invoice: its paid amount,
balance and status (partial / paid) follow; «✓ مدفوعة» marks the rest as paid. A quotation becomes an invoice with one click.

- **PDF**: «تنزيل PDF» prints the A4 sheet (choose *Save as PDF*), so Arabic comes out exactly as on screen. The editor
  shows the sheet live as you type.
- **Sending**: every document has a private link, `/doc/<token>`, which the client opens read-only with its own
  «Download PDF» button (noindex, not in the sitemap). Send it with «واتساب» (the client's number, message in the
  document's language), «بريد من جهازي», or «إرسال من الموقع» when SMTP is set. «↻ رابط جديد» stops the old link.
- **بيانات الشركة**: name, address, tax number, bank details, default currency / tax / notes, logo and an optional stamp,
  printed on every document.

Stored in `DATA_DIR/invoices.json` (`lib/invoices.js`); the sheet is drawn by `invoice-doc.js` / `invoice-doc.css`,
shared by the panel (`admin/invoices.js`) and the client's page (`doc.html`, `doc-page.js`).

## User guide (PDF)

`user-guide/` holds the admin-panel user guide: `guide.ar.json` / `guide.en.json` (the text), `shots.mjs` (which
screens to capture) and `shots/` (the screenshots). To update it after the panel changes, run a demo copy of the site
on its own data (never the real data), re-capture, and rebuild:

```bash
DATA_DIR="$PWD/user-guide/demo-data" node server.js 5180      # demo copy (user-guide/demo-data is a copy of data/ + demo messages)
GUIDE_PASS=… node user-guide/tools/capture.mjs user-guide/shots.mjs --out user-guide/shots
node user-guide/tools/build.mjs user-guide/guide.ar.json --shots user-guide/shots --out "user-guide/out/PuzzleX Media – User Guide (AR).pdf" --preview user-guide/out/preview-ar
node user-guide/tools/build.mjs user-guide/guide.en.json --shots user-guide/shots --out "user-guide/out/PuzzleX Media – User Guide (EN).pdf" --preview user-guide/out/preview-en
```

Needs only Node and Chrome. `--preview` writes a PNG per page plus `overview.png` for checking the layout.

## Settings (`.env`)

| Name | What it does |
| --- | --- |
| `SITE_URL` | Public address used in share previews and the sitemap (default `https://www.puzzlexmedia.com`) |
| `TRUST_PROXY` | `1` behind a reverse proxy, so rate limits use the visitor's real IP and HTTPS is recognised (HSTS) |
| `INDEXNOW` | `1` on the live site only: submit changed pages to Bing & co. (see "Search engines and AI assistants") |
| `CSP_ENFORCE` | `0` to only report Content-Security-Policy violations instead of blocking them (enforced by default) |
| `HSTS_PRELOAD` | `1` adds `includeSubDomains; preload` to HSTS — only when every subdomain works on HTTPS |
| `AUTOREPLY_PER_HOUR` | Most contact-form confirmations sent per hour, site-wide (default 30; one per address per day) |
| `GOOGLE_SITE_VERIFICATION` | The code from Google Search Console's "HTML tag" method: adds its meta tag to every page |
| `CONTACT_TO` | Where contact messages are emailed |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Your mail provider's SMTP details |

## What the server does

- Serves the pages with Brotli/gzip compression and long caching for versioned assets (`?v=NN`)
- One address per page (each page also carries `<link rel="canonical">`): `puzzlexmedia.com` → `www.puzzlexmedia.com`
  (the host in `SITE_URL`), `/index.html` → `/`, `/about` → `/about.html`, all 301
- Security headers on every response; `Strict-Transport-Security` on HTTPS requests (this host only unless
  `HSTS_PRELOAD=1`) — behind a proxy that needs `TRUST_PROXY=1` so the server can see `X-Forwarded-Proto: https`
- `Content-Security-Policy`, enforced: inline scripts are allowed by hash, worked out per page; stylesheets and
  `<style>` only from the site's own files and Google Fonts (`style=""` attributes stay allowed for the CSS variables
  the animations use). Anything blocked is logged as `[csp] …`; `CSP_ENFORCE=0` switches back to report-only
- Admin sign-in: 5 wrong passwords per IP or username lock it for 15 minutes (doubling on repeat, 60 at most), each
  failure slows the next answer; passwords need 12+ characters (a mix of kinds under 16). The session cookie is
  `__Host-`, HttpOnly, Secure, SameSite=Strict
- Uploads: only real JPG/PNG/WebP (checked by their first bytes), 8 MB at most, random names, kept in `DATA_DIR/uploads`
  (outside the site folder) and served with `Content-Security-Policy: default-src 'none'; sandbox`
- 404 page in the right language; server files (`server.js`, `package.json`, …) are never served
- Fills in the share preview (title, description, canonical, and the cover as share image once uploaded) for each project: `project.html?id=…`
- `POST /api/contact`, `POST /api/csp-report`, `GET /healthz`, `robots.txt`, `sitemap.xml`, `llms.txt`
- Partner names as a screen-reader list under the logo puzzle

## Search engines and AI assistants (lib/seo.js)

Most crawlers, and nearly all AI crawlers, don't run JavaScript, so the server puts what matters into the HTML:

- The work page's project cards and each project page's title, client, summary, sector, services, year and uploaded
  images (the scripts then redraw them as before)
- schema.org data on every page: Organization (contact details and social links from the admin panel, when filled in),
  WebSite, the page itself with breadcrumbs, the service catalogue on the services page (read from the page, so
  admin edits are included), the project list on the work page, a CreativeWork per project and a BlogPosting per article
- `hreflang` ar / en / x-default (Arabic), `og:locale:alternate`, `max-image-preview:large`; `project.html` without a
  known `?id` is `noindex`
- `sitemap.xml`: every page in both languages, every project, and every published article in the languages it's written in
  (with its date); `robots.txt` points to it and keeps `/admin/` and `/api/` out
- `/llms.txt`: the company, services, projects and contact details as plain text for AI assistants, built from the
  live content (so it updates with the admin panel)

- IndexNow (`lib/indexnow.js`, on with `INDEXNOW=1`): every page is submitted to Bing / Yandex / Naver / Seznam / Yep a
  minute after an admin-panel save, and once after a deploy that changed the pages. The key is made on first start,
  kept in `DATA_DIR/indexnow.json`, and served at `/<key>.txt`; submissions are logged as `[indexnow] …` lines

Titles and descriptions are ordinary texts: edit them in the admin panel (Texts → «عناوين الصفحات ووصف المشاركة»).

**Google Search Console** (once, on the live site): add `https://www.puzzlexmedia.com/` as a URL-prefix property, choose the
"HTML tag" method, put its code in `GOOGLE_SITE_VERIFICATION` and restart, press Verify, then submit `sitemap.xml` under
Sitemaps and use URL Inspection on the home page and a blog article. Indexing and rankings themselves can't be promised.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Messages go to `./data/messages.jsonl`.

## Files

```
*.html, en/*.html     pages (Arabic / English)
styles.css            all styles (dark only)
main.js               shared helpers + the home-page puzzle hero
sections.js           home: values, partners puzzle, 3D piece pop-up
pages.js              inner pages, contact form, 404
extras.js             every page: back-to-top piece, WhatsApp greeting; home: service request, feedback slider, logo strip
blog.html, article.html   the blog (filled in by the server, lib/articles.js)
projects.js           project data (Arabic + English); also read by the server
loader.js, cursor.js
privacy.html          privacy policy (linked from the form and every footer)
assets/               icon, fonts, partner logos (WebP), share image, vendor/ (GSAP)
server.js             the web server (lib/: content, SEO, IndexNow, admin API, sign-in, storage)
admin/                the admin panel (/admin)
tools/admin-user.js   add / reset / remove admin users
Dockerfile, docker-compose.yml, .env.example
source-files/tools/make_en.py   rebuilds en/ from the Arabic pages
```

## Editing text

Change the Arabic page, add the new strings' English to the `EN` table in
`source-files/tools/make_en.py`, then run `npm run build:en` (needs Python). It lists anything it
can't translate. Text inside the scripts uses `T('عربي', 'English')`.
After editing CSS or JS, bump the `?v=NN` number in the pages so browsers fetch the new file.

## Still to fill in (admin panel)

- Phone, email, WhatsApp and social links (until then they are simply not shown)
- Project covers and galleries (until then each project shows a generated image marked "placeholder")
- Partner names (read out to screen-reader users instead of the logos)
- The privacy policy's retention period is general ("as long as needed, then deleted"): set a concrete one if you have it
