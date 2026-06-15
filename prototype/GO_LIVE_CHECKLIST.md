# Layovered Visa Checker — Go-Live Checklist

Status as of launch. Tick through B and C; A is already confirmed.

---

## A. Already verified ✓
- [x] `/data/visa-data.json` returns **404** on the live site (dataset stays private).
- [x] `sitemap.xml` is live and lists all 280 pages.
- [x] Domain is consistent — CNAME, canonicals and sitemap all use `https://layovered.com`.
- [x] Generated pages contain only teaser fields; no documents/apply/ETA data in HTML.
- [x] App CTAs point to `download.html` (store redirect); email capture hidden behind the `ENABLE_EMAIL_CAPTURE` flag.
- [x] FAQPage + BreadcrumbList JSON-LD on every page; internal links wired.

---

## B. Do now (before/at launch)

### B1. Add web analytics — TOP PRIORITY ⚠️
There is currently **no analytics on the site**, so none of this is measurable yet.
- [ ] Pick one: **GA4** (free, full-featured) or **Cloudflare Web Analytics** (free, no cookie banner) or Plausible/Fathom (paid, simple).
- [ ] Add the snippet to the **generator template** (`scripts/gen-visa-pages.js`, in `<head>`) so all 280 pages are tracked — and to the main site pages.
- [ ] Re-run `node scripts/gen-visa-pages.js` and redeploy.
- [ ] Add **event tracking** on the key actions: `app_cta_clicked` (Open in app / Download), `passport_changed`, `visa_toggled`. These are your web→app conversion signals.

### B2. Google Search Console
- [ ] Verify the `layovered.com` property (Domain property via DNS TXT is best).
- [ ] Submit `https://layovered.com/sitemap.xml`.
- [ ] Use **URL Inspection → Request indexing** on ~5 priority pages to seed crawling:
  - `https://layovered.com/visa-free/india/`
  - `https://layovered.com/visa-free/india/with-us-visa/`
  - `https://layovered.com/visa-free/philippines/`
  - `https://layovered.com/visa-free/nigeria/`
  - `https://layovered.com/can-i-enter/india/thailand/`

### B3. Validate rich results
- [ ] Run one hub page and one country page through the **Google Rich Results Test** — confirm FAQ and Breadcrumb are detected with no errors.

### B4. Social preview
- [ ] Confirm `og-image.png` exists at the site root (the template references `/og-image.png`). If missing, add one or the share preview will be blank.
- [ ] Paste a page URL into a link preview debugger (e.g. opengraph.xyz) — check title/description/image render.

### B5. Quick manual spot-check on the live site
- [ ] Open a hub page on **mobile** — layout matches the prototype, loads fast.
- [ ] Change passport in the dropdown → navigates to that passport's page.
- [ ] Toggle a visa chip → navigates to the matching `/with-…-visa/` page.
- [ ] "Open in app" → lands on the correct app store for the device.
- [ ] Confirm the email-capture band is **absent** (hidden as chosen) and the routing teaser says "Get it in the app →".

---

## C. First 1–2 weeks (monitor)
- [ ] Search Console **Pages/Coverage**: watch pages move from "Discovered" → "Indexed". New programmatic pages take days to a few weeks.
- [ ] Watch for crawl errors, soft-404s, or "Duplicate, Google chose different canonical" warnings.
- [ ] Search Console **Core Web Vitals** + Mobile Usability: confirm no issues flagged.
- [ ] Confirm analytics is recording sessions on `/visa-free/` and `/can-i-enter/` paths.

---

## D. Trigger for Wave 2
Once Search Console **Performance** shows impressions accumulating (usually 2–4 weeks):
- [ ] Note which **passports** and **countries** are earning impressions/clicks.
- [ ] Generate Wave 2 (next ~25 passports + more country pages) **weighted toward proven demand**, not guesses.
- [ ] Re-run the generator with the expanded data and redeploy.

---

### Still pending (known, not blockers)
- Email capture: off until an ESP/public form endpoint is chosen, then set `CAPTURE_ENDPOINT` and flip `ENABLE_EMAIL_CAPTURE = true`.
- App deep links: currently store-redirect via `download.html`; upgrade to Branch/Firebase deferred deep links later to open the exact country in-app.
