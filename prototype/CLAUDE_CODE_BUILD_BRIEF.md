# Layovered — Web Visa Checker: Build Brief for Claude Code

> Hand this whole file to Claude Code. It is self-contained. Goal: build a set of
> **statically pre-generated, SEO-optimised** visa-checker pages for the existing
> site. **No backend / no server for v1.**

---

## 0. TL;DR — what to build

A **Node generation script** that reads a **visa dataset (JSON)** plus an HTML
**template**, and writes out **static HTML pages** under `/visa-free/...` and
`/can-i-enter/...`. These are committed to the repo and served by the existing
GitHub Pages site. Each page embeds its own country list in the HTML at build
time (great for SEO). The interactive passport/visa selectors on each page simply
**navigate to the matching pre-built page** — they do **not** call an API.

Design reference (match it exactly): **`prototype/visa-checker-prototype.html`**
already in this repo. Same brand: orange `#ff4c00`, font *Plus Jakarta Sans*,
glass-card style, FontAwesome.

---

## 1. Architecture decision (read this before coding)

- **Static Site Generation (SSG), not SSR.** GitHub Pages cannot run a server, so
  pre-render everything to static HTML. This gives the **same SEO outcome** as SSR
  (Google receives complete HTML) with zero infrastructure.
- **One static page per published combination.** e.g. `/visa-free/india` and
  `/visa-free/india/with-us-visa` are each their own `.html` file with that combo's
  country list already in the markup.
- **Selectors navigate, they don't fetch.** Changing the passport or visa in the
  widget does `window.location = <matching pre-built URL>`. No client-side API.
- **Gated fields must NEVER appear in any static page.** Only the four teaser
  fields go into the HTML (see §5). Documents / apply links / ETA links live in the
  app only. (Embedding only teaser fields for the combos we choose to publish is an
  acceptable, public-data exposure.)
- **Out of scope for v1:** live API, arbitrary multi-visa combos, rate limiting,
  Cloudflare. Those are only needed if we later add free-form combo search on the
  web. If any client-side free-form state exists, tag it `noindex`.

---

## 2. Where the visa data comes from

The generator needs the visa dataset as its build-time input. Two ways to supply
it — **Option B is recommended** because Layovered already has APIs.

**Option A — local JSON (simplest for the first build).** A file
`data/visa-data.json` (schema below). Update data = edit file, re-run generator,
redeploy.

**Option B — pull from the existing Layovered API at build time (recommended).**
The generator calls our existing read API **server-side, during the build** (auth
via an env var), fetches the dataset, then generates the static pages. Benefits:
- **No manual re-uploads** — every build pulls the latest data automatically.
- The API is only ever called from the build machine, **never from the visitor's
  browser**, so it is not exposed by these pages.
- Data updates ship by simply **re-running the build** — schedule it nightly via a
  GitHub Action.

Claude Code: implement one `loadVisaData()` function supporting both paths — read
`data/visa-data.json` if present, else fetch from `process.env.VISA_API_URL` with
`process.env.VISA_API_KEY`. Ship a small **sample** `data/visa-data.json` (India +
a few countries) so the build runs before the real source is wired.

> **SECURITY — never publish the dataset.** The data file must **not** be served by
> the website. If `visa-data.json` sits in the deployed site folder, anyone can grab
> the whole dataset at `layovered.app/data/visa-data.json`. Prevent it:
> - Deploy via a GitHub Action that publishes **only the generated HTML** (the
>   `visa-free/` and `can-i-enter/` folders + `sitemap.xml`) — not `data/` or `scripts/`.
> - Add `data/` and `scripts/` to Jekyll `exclude` in `_config.yml`; `.gitignore` the
>   real data file (keep only the sample, or keep real data in a private location).
> - The only visa data that reaches the public is the **teaser fields embedded per
>   page** (one combo per page) — acceptable. Never expose the bulk file or any gated
>   field.

```json
{
  "visas": [
    { "code": "US", "name": "US visa", "slug": "us" },
    { "code": "SCHENGEN", "name": "Schengen visa", "slug": "schengen" },
    { "code": "UK", "name": "UK visa", "slug": "uk" },
    { "code": "CA", "name": "Canada visa", "slug": "canada" },
    { "code": "AE", "name": "UAE visa", "slug": "uae" }
  ],
  "passports": [
    {
      "code": "IN",
      "name": "India",
      "nationality": "Indian",
      "slug": "india",
      "countries": [
        {
          "code": "TH", "name": "Thailand", "slug": "thailand",
          "region": "Southeast Asia",
          "access": "visa_free",          // visa_free | voa | evisa | eta | required
          "durationDays": 60,
          "price": "Free",                // teaser only
          "unlockedBy": []                // e.g. ["US"] if only accessible with that visa
        }
        // ...more countries
      ]
    }
    // ...more passports
  ]
}
```

> The dataset (file or API response) carries **only teaser fields**. Do **not**
> include document lists or apply URLs — those stay in the app.

---

## 3. URLs & which pages to generate

Slugs lowercase, hyphenated. Generate from the data file:

| Template | URL pattern | Generate for |
|---|---|---|
| Passport hub | `/visa-free/[passport]` | every passport in data |
| Passport + visa | `/visa-free/[passport]/with-[visa]-visa` | **only** the 5 visas in `visas[]` (US, Schengen, UK, Canada, UAE) |
| Single country | `/can-i-enter/[passport]/[country]` | each passport × its countries |

**Wave 1 (build first):** the Tier-1 passports — `india, philippines, nigeria,
pakistan, bangladesh` — each: hub page + 5 visa-variant pages + their top ~50
country pages. **Skip** any page whose result set is empty or trivially small.

The script must be **idempotent**: re-running regenerates all pages from the data.

---

## 4. Page template (generalise the prototype)

Use `prototype/visa-checker-prototype.html` as the design + interaction reference.
Each generated page contains, top to bottom:

1. Nav (logo, About, Contact, orange "Download app" CTA).
2. Header: breadcrumb (`Home › Visa-free › [Nationality]`), tag pill, **H1**, subhead.
3. Checker widget: passport `<select>` (pre-selected to this page's passport) + visa
   chips (pre-toggled to this page's visa, if a variant page).
   - **On change → navigate** to the matching pre-built URL. If a target page
     doesn't exist (e.g. a multi-visa combo), fall back to the passport hub.
4. Summary line: "Your [Nationality] passport [+ visa] unlocks **N** destinations".
5. Results grid grouped by access type (Visa-free / Visa on arrival / eVisa-eTA),
   each country card showing **teaser fields only** + a locked "Documents & apply
   link → **Open in app**" row. Cards unlocked by the page's visa get an
   "Unlocked by your [visa] visa" tag.
6. Email capture (single field) — POST to a placeholder endpoint constant I'll wire
   to our ESP later (`CAPTURE_ENDPOINT = "/TODO"`).
7. Routing-waitlist teaser block.
8. SEO body + FAQ (content from §6).
9. Footer.

App CTAs / "Open in app" use a **deferred deep-link** placeholder constant
(`APP_DEEPLINK_BASE = "https://layovered.app/TODO"`) I'll replace with the real
Branch/Firebase link.

---

## 5. Teaser vs gated (enforce in code)

**Render in HTML (teaser):** country name, access type, stay duration, indicative
price, total unlocked count.
**Never in HTML (app-only):** documents required, apply / e-visa / ETA links,
step-by-step guidance.

---

## 6. SEO requirements (per page)

Render all of this statically:

- `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph +
  Twitter tags — from the templates in §7.
- **FAQPage** JSON-LD (from the visible FAQs) and **BreadcrumbList** JSON-LD.
- Internal links: hub ↔ its 5 visa variants ↔ its top ~10 country pages; country
  page → its passport hub. Descriptive anchor text, never "click here".
- Append every generated URL to **`sitemap.xml`**; keep `robots.txt` allowing them.
- Mobile-first, fast, minimal JS. `{{YEAR}}` = current year at build time.

---

## 7. Copy templates (use verbatim; `{{TOKENS}}` come from the data)

**Tokens:** `{{NATIONALITY}}` (e.g. Indian), `{{YEAR}}`, `{{TOTAL}}` (accessible
count), `{{VF}}` (visa-free count), `{{VOA}}`, `{{EV}}` (eVisa/eTA),
`{{EX1}}/{{EX2}}/{{EX3}}` (top 3 visa-free example country names), `{{VISA}}`
(variant pages), `{{VISA_UNLOCK}}` (extra countries that visa unlocks).

### Passport hub page

```
Title:  Visa-Free Countries for {{NATIONALITY}} Passport Holders ({{YEAR}})
Meta:   See every country {{NATIONALITY}} passport holders can enter visa-free or
        visa-on-arrival, with stay duration and cost. Add visas you hold to unlock
        more. Free.
H1:     Visa-Free Countries for {{NATIONALITY}} Passport Holders
```

Intro paragraph:
> Wondering where you can travel on a {{NATIONALITY}} passport without arranging a
> visa in advance? The free checker above shows all {{TOTAL}} destinations open to
> {{NATIONALITY}} citizens — {{VF}} visa-free, {{VOA}} visa-on-arrival and {{EV}} via
> eVisa or eTA — each with the permitted length of stay and indicative cost. Popular
> visa-free picks include {{EX1}}, {{EX2}} and {{EX3}}.

Body H2 + paragraph: `How far does a {{NATIONALITY}} passport get you?` followed by
the **unique regional line** per passport:

| Passport | Regional body line (use this one) |
|---|---|
| India | "Already hold a US, Schengen, UK, Canada or UAE visa? Several countries admit Indian passport holders on the strength of a visa they already have — add the visas you hold above to reveal those extra destinations." |
| Philippines | "As an ASEAN member, Filipino passport holders enjoy visa-free travel across much of Southeast Asia; add any US/Schengen/UK/Canada/UAE visa you hold above to unlock even more." |
| Nigeria | "As an ECOWAS member, Nigerian passport holders move visa-free across much of West Africa; a US/Schengen/UK/Canada/UAE visa you already hold unlocks several more — add yours above." |
| Pakistan | "Because visas are often the hardest part of travel on a Pakistani passport, a visa you already hold is especially valuable — several countries admit Pakistani holders carrying a US/Schengen/UK/Canada/UAE visa. Add yours above." |
| Bangladesh | "A visa you already hold can widen your options considerably — several countries admit Bangladeshi passport holders carrying a US/Schengen/UK/Canada/UAE visa. Add yours above." |

**Hub FAQ (6, tokenised — render all):**
1. *How many countries can {{NATIONALITY}} passport holders visit without a visa?* —
   "{{NATIONALITY}} citizens can currently reach {{TOTAL}} destinations without a
   prior visa — {{VF}} visa-free, {{VOA}} on arrival and {{EV}} via eVisa or eTA.
   Run the checker above for the live, full list."
2. *Which countries are visa-free for {{NATIONALITY}} citizens?* — "Popular visa-free
   destinations include {{EX1}}, {{EX2}} and {{EX3}}, among others. The checker shows
   all {{VF}} visa-free countries with the stay allowed for each."
3. *Does a US or Schengen visa give {{NATIONALITY}} passport holders extra access?* —
   "Yes. A valid US, Schengen, UK, Canada or UAE visa can unlock visa-free or
   visa-on-arrival entry to several additional countries. Add your visa in the
   checker to see exactly which destinations open up."
4. *What is the difference between visa-free and visa-on-arrival?* — "Visa-free means
   you need no visa at all. Visa-on-arrival means you obtain it at the airport or
   border on landing, sometimes for a fee. Both are shown above with cost and stay."
5. *Do I need to apply for anything before I fly?* — "Fully visa-free countries need
   nothing in advance; eVisa and eTA countries require a short online application
   before departure. Open any country in the Layovered app for the exact documents
   and the official application link."
6. *Is this list up to date?* — "Visa data is maintained from IATA-grade sources, but
   government rules can change at short notice. Always confirm your specific trip's
   requirements in the Layovered app before booking."

### Passport + visa variant page

```
Title:  Where Can {{NATIONALITY}} Passport Holders Go With a {{VISA}} Visa? ({{YEAR}})
Meta:   Holding a {{VISA}} visa on a {{NATIONALITY}} passport unlocks extra visa-free
        and visa-on-arrival countries. See your full list with duration and cost — free.
H1:     Visa-Free Countries for {{NATIONALITY}} Passport Holders With a {{VISA}} Visa
```

Intro:
> A valid {{VISA}} visa can open doors a {{NATIONALITY}} passport alone cannot. The
> checker above shows all {{TOTAL}} destinations you can enter — including
> {{VISA_UNLOCK}} extra countries unlocked specifically by your {{VISA}} visa — each
> with the allowed stay and indicative cost.

Variant FAQ (render at least these 2 + reuse hub #4/#5):
1. *Which countries can {{NATIONALITY}} passport holders enter with a {{VISA}} visa?* —
   "A valid {{VISA}} visa unlocks {{VISA_UNLOCK}} additional destinations, on top of
   those already open visa-free. The checker marks each with an 'unlocked' tag."
2. *Does the {{VISA}} visa need to be currently valid?* — "Yes. Countries that admit
   you on the strength of a {{VISA}} visa generally require it to be valid. Check the
   specific country's rule in the Layovered app before you travel."

### Single-country page (`/can-i-enter/[passport]/[country]`)

```
Title:  Can {{NATIONALITY}} Passport Holders Enter {{COUNTRY}}? Visa, Cost & Duration ({{YEAR}})
Meta:   {{COUNTRY}} entry rules for {{NATIONALITY}} passport holders: visa type,
        allowed stay and cost. See documents and apply links in the Layovered app.
H1:     Can {{NATIONALITY}} Passport Holders Enter {{COUNTRY}}?
```
Body: one short paragraph stating the access type, duration and price (teaser), then
the locked "documents & apply link → open in app" CTA, then links back to the
passport hub and 3–5 sibling country pages.

---

## 8. Acceptance criteria

- Running `node scripts/gen-visa-pages.js` regenerates all Wave-1 pages as static
  HTML; `view-source` shows the full country list text in the markup.
- **No** gated fields (documents/apply/ETA) appear in any generated HTML or JS.
- Changing passport/visa in the widget navigates to the correct pre-built URL;
  missing combos fall back to the passport hub.
- Each page has a valid `<title>`, meta description, canonical, OG tags, and valid
  FAQPage + BreadcrumbList JSON-LD (test in Google Rich Results).
- All generated URLs are in `sitemap.xml`; `robots.txt` allows them.
- Pages visually match `prototype/visa-checker-prototype.html`.
- A committed sample `data/visa-data.json` lets the whole thing build with no real
  data yet; `loadVisaData()` also supports fetching from `VISA_API_URL` at build time.
- The dataset is **not** in the deployed output — requesting `/data/visa-data.json` on
  the live site returns 404. Only the generated HTML + sitemap are published.

---

## 9. Suggested file layout

```
data/visa-data.json            # sample now, real export later
scripts/gen-visa-pages.js      # the generator (idempotent)
templates/                     # page + card partials, or inline in the script
visa-free/<passport>/index.html
visa-free/<passport>/with-<visa>-visa/index.html
can-i-enter/<passport>/<country>/index.html
sitemap.xml                    # appended
```

---

## 10. Paste-ready prompt for Claude Code

> Read `prototype/visa-checker-prototype.html` and `prototype/CLAUDE_CODE_BUILD_BRIEF.md`
> in this repo. Build the static visa-checker page generator exactly as the brief
> specifies: a Node script `scripts/gen-visa-pages.js` with a `loadVisaData()`
> function that reads `data/visa-data.json` if present, else fetches from
> `process.env.VISA_API_URL` (auth `VISA_API_KEY`) at build time — include a small
> India sample `data/visa-data.json`. Generate static HTML pages for **Wave 1**
> (passports: india, philippines, nigeria, pakistan, bangladesh) — hub pages, the 5
> visa-variant pages each, and their top ~50 country pages — matching the prototype's
> design and brand. Embed only the teaser fields in HTML, never the gated fields. Make
> selectors navigate between pre-built pages (no browser-facing API). Add per-page
> title/meta/canonical/OG, FAQPage + BreadcrumbList JSON-LD, internal links, and append
> all URLs to `sitemap.xml`. Ensure the data file and scripts are excluded from the
> deployed site (Jekyll `exclude` + a deploy step that publishes only the generated
> HTML), so `/data/visa-data.json` is never reachable on the live site. Use placeholders
> for the app deep link and email-capture endpoint. The script must be idempotent. Show
> me how to run it, then run it on the sample data and list the files it created.

---

### Notes for me (founder) — what I still owe
- Export the real `data/visa-data.json` from the app (only teaser fields).
- Replace `APP_DEEPLINK_BASE` and `CAPTURE_ENDPOINT` placeholders.
- After Wave 1 indexes, decide Wave 2 passports from Search Console demand.
