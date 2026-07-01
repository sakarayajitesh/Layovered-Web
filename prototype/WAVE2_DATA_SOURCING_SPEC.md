# Layovered — Wave-2 SEO: Passport Data Sourcing Spec

**For:** the data analyst.
**Goal:** add new nationalities' visa data to `data/visa-data.json` so the page generator
(`scripts/gen-visa-pages.js`) automatically builds a full SEO page set for each — with **zero code
changes**. Just add the data in the exact shape below and add the slug to the build list.

---

## 1. What each new passport produces (once the data is added)

For every passport you add, the generator builds:
- 1 hub page — `/visa-free/<slug>/`
- up to 5 "with-visa" combo pages — `/visa-free/<slug>/with-<visa>-visa/`
- up to 90 country pages — `/can-i-enter/<slug>/<country>/`

So each new passport ≈ **60–95 new pages**, all internally linked, SEO-complete.

---

## 2. Priority order (source these first)

Chosen for large diaspora + high visa-search demand + lower competition (the pattern that made
Nigeria/Pakistan break out). Do them top-down:

1. Sri Lanka
2. Nepal
3. Egypt
4. Kenya
5. Ghana
6. Indonesia
7. Vietnam
8. Ethiopia

> Validate against Search Console before/after: whatever passports/countries already show
> impressions should be prioritised. Real demand beats this guess.

---

## 3. The exact JSON shape

`data/visa-data.json` has two top-level keys: `visas` (already defined — **do not change**) and
`passports` (an array — **append** new ones here).

### 3a. A passport object

```json
{
  "code": "LK",
  "name": "Sri Lanka",
  "nationality": "Sri Lankan",
  "slug": "sri-lanka",
  "countries": [ /* array of country objects — see 3b */ ]
}
```

| Field | Type | Rule |
|---|---|---|
| `code` | string | ISO-2 country code of the passport (e.g. `LK`). Uppercase. |
| `name` | string | Country name (e.g. `Sri Lanka`). |
| `nationality` | string | Adjective form used in copy (e.g. `Sri Lankan`, `Nepali`, `Egyptian`). Get this right — it appears in every title/heading. |
| `slug` | string | URL slug, lowercase, hyphenated (e.g. `sri-lanka`). Becomes `/visa-free/sri-lanka/`. |
| `countries` | array | One object per destination the passport can reach — see below. |

### 3b. A country object (inside `countries`)

```json
{
  "code": "TH",
  "name": "Thailand",
  "slug": "thailand",
  "region": "ASIA",
  "access": "visa_free",
  "unlockedBy": [],
  "stay": "60 days",
  "price": "Free"
}
```

| Field | Type | Rule |
|---|---|---|
| `code` | string | ISO-2 of the destination (e.g. `TH`). |
| `name` | string | Destination display name (e.g. `Thailand`). |
| `slug` | string | lowercase-hyphenated (e.g. `thailand`, `cape-verde-islands`). |
| `region` | string | One of: `ASIA`, `AFRICA`, `EUROPE`, `AMERICAS`, `CARIBBEAN`, `OCEANIA`, `MIDDLE EAST`. (Used for grouping.) |
| `access` | string | **Controls the badge + copy.** Exactly one of: `visa_free`, `voa` (visa on arrival), `evisa`, `eta`. (`eta` is treated as visa-free.) |
| `unlockedBy` | array of strings | Which held-visa unlocks this destination. Empty `[]` for base access. Use the visa **codes** from the `visas` block: `US`, `SCHENGEN`, `UK`, `CA`, `AE`. A country can be unlocked by more than one, e.g. `["US","SCHENGEN"]`. |
| `stay` | string | Optional. Human-readable max stay, e.g. `"30 days"`, `"90 days"`, `"6 months"`. Omit if unknown. |
| `price` | string | Optional. Indicative cost, e.g. `"Free"`, `"$35"`, `"₹2000"`. Omit if unknown. |

**Only include destinations the passport can actually reach** (visa_free / voa / evisa / eta, or
unlocked by a held visa). Do **not** add "visa required" countries — they're excluded from pages anyway.

### 3c. How `unlockedBy` works (important)

- A country with `"unlockedBy": []` is reachable on the passport **alone** — it appears on the hub page.
- A country with `"unlockedBy": ["SCHENGEN"]` is reachable **only if** the person holds a Schengen
  visa — it appears on the `/with-schengen-visa/` combo page (and boosts that page's unlock count).
- A country can be **both**: if it's visa-free anyway, leave `unlockedBy` empty. Only set `unlockedBy`
  for access the passport does **not** already have without the visa.

---

## 4. After adding the data (one tiny build step — for the dev, not the analyst)

In `scripts/gen-visa-pages.js`, add the new slugs to the build list:

```js
const WAVE1 = ['india', 'philippines', 'nigeria', 'pakistan', 'bangladesh',
               'sri-lanka', 'nepal', 'egypt' /* … */];
```

Then `node scripts/gen-visa-pages.js` + commit + push. That's it — pages, sitemap, internal links
all generate automatically.

---

## 5. Quality checklist (per passport, before shipping)

- [ ] `nationality` reads correctly in a title (e.g. "Visa-Free Countries for **Sri Lankan** Passport Holders").
- [ ] Every `access` value is one of the four allowed strings (typos = broken badge).
- [ ] `unlockedBy` codes match the `visas` block exactly (`US`/`SCHENGEN`/`UK`/`CA`/`AE`).
- [ ] No "visa required" destinations included.
- [ ] Slugs are unique, lowercase, hyphenated, and URL-safe.
- [ ] Spot-check 3 country pages after generating: badge, stay, and cost look right.

---

## 6. Reference — an existing passport to copy the shape from

Open `data/visa-data.json` and look at the `india` entry. Mirror that structure exactly for each
new passport. The 5 existing passports (India, Philippines, Nigeria, Pakistan, Bangladesh) are your
working template.
