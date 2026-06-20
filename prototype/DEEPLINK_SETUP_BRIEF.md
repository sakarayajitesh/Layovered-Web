# Layovered — Deep Link & Attribution Setup Brief

Goal: deferred deep linking + install attribution, so web "Open in app" lands users on the
right screen after installing, we know which channel/creator/post drove each install, and
referral installs get credited to the referrer.

---

## 0. Why this matters (what it unblocks)

1. **Attribution** — know which channel, creator, or post drove each install. *Do this
   before the influencer push, or you can't tell which of the 5 creators actually worked.*
2. **Deferred deep linking** — a user taps "Open in app" on a country page, installs, and
   on first open lands on **that country's detail**, not the home screen.
3. **Referral** — when a friend installs via someone's referral link, the new install is
   credited to the referrer → this powers the referral loop reward.

---

## 1. Provider decision

- **Firebase Dynamic Links** — DEAD (shut down 25 Aug 2025, links now 404). Do not use.
- **Branch.io** — removed its free tier (24 Jul 2025); now a 30-day trial then **$499/mo**.
  Out of budget.
- **ChottuLink — Forever Free plan ✅ (our pick).** Free up to **25,000 MAU** (we're ~600),
  unlimited deep links, **full deferred deep link support**, all SDK platforms.

### The one catch, and the workaround
ChottuLink's own **attribution dashboard** is a paid feature (starts at the $39/mo Growth
plan). **We don't need it** — we already run GA4. Deferred deep linking *delivers the link's
params to the app after install*, so the app reads `~channel` / `~campaign` / `referrerId`
on first open and **logs them to GA4 + our backend itself**. That gives us attribution and
referral crediting for **$0**.

> Net: **ChottuLink Free + app-logs-params-to-GA4.** Upgrade to the $39 Growth tier later
> only if we want ChottuLink's built-in dashboard or a branded domain (`link.layovered.com`
> instead of `chottu.link/...`) — both nice-to-haves, neither essential.

---

## 2. What to set up (three parts)

### A. App side — mobile devs (the bulk of the work)
- Integrate the **ChottuLink SDK** in iOS + Android.
- Configure **Universal Links (iOS)** + **App Links (Android)** on layovered.com — host the
  `apple-app-site-association` and `assetlinks.json` files ChottuLink provides — so links
  open the app directly, or redirect to the store if not installed.
- Implement **deep-link routing**: on app open, read the params and navigate to the right
  screen (country detail from `passport` + `country`).
- Handle the **deferred** case: on first open *after a fresh install*, read the same params,
  route to the intended screen, **and log `~channel` / `~campaign` / `~feature` / `referrerId`
  to GA4 + our backend** (this is our attribution, replacing the paid dashboard).
- Confirm the free SDK passes our **custom params** through on a deferred open (standard
  deferred-deep-link behaviour, but verify).

### B. Link taxonomy — define once, use everywhere

| Param | Meaning | Example values |
|---|---|---|
| `~channel` | where the link was shared | `reddit`, `quora`, `instagram`, `creator_<name>`, `web-checker`, `homepage`, `waitlist` |
| `~campaign` | the push it belongs to | `launch`, `waitlist`, `evergreen` |
| `~feature` | what it links to | `visa-checker`, `country-detail`, `referral` |
| `passport`, `country` | for country deep links | `india`, `thailand` |
| `referrerId` | for referral links | the referring user's id |

### C. Web side — the generator (small change)
- Replace `APP_DEEPLINK_BASE` (currently `https://layovered.com/download.html`) with the
  **ChottuLink link base** (the `chottu.link` domain on the free plan).
- Update the "Open in app" href builder on country pages to append `passport`, `country`,
  `~channel=web-checker`, `~feature=country-detail`. ChottuLink then handles device
  detection, store redirect, and the deferred deep link.
- Re-run `gen-visa-pages.js` + redeploy. (Keep `download.html` for the plain nav "Download
  app" button, or route that through ChottuLink too.)

---

## 3. The three link types to create

1. **Web "Open in app" (per country)** — deferred deep link to the country detail;
   `~channel=web-checker`. *Built by the generator.*
2. **Channel / creator links** — one unique ChottuLink link per channel or creator
   (`~channel=creator_<name>`), shared in posts and given to each influencer. The app logs
   the channel to GA4 on install → installs-per-source in GA4. *Created in ChottuLink.*
3. **Referral links** — generated **in-app per user** with `referrerId` + `~feature=referral`.
   Deferred deep linking delivers `referrerId` to the new install → our backend credits the
   referrer and triggers the reward on activation. *App + referral loop.*

---

## 4. Attribution = GA4, not the paid dashboard
- The app fires a GA4 event on install carrying `~channel` / `~campaign` / `~feature` /
  `referrerId`, alongside the web `app_cta_clicked` events we already track.
- Result: install attribution by source, in the analytics we already run, for $0.

---

## 5. Acceptance criteria
- Tapping "Open in app" on a country page, on a phone **without** the app → install → app
  opens on **that country's detail** (deferred deep link works).
- On install, the link's `~channel` / `~campaign` / `referrerId` appear as a GA4 event and
  are recorded in our backend.
- A unique creator link's installs are distinguishable by `~channel` in GA4.
- Installing via an in-app referral link credits the **referrer** in our backend.
- The plain nav "Download app" install still works.

---

## 6. Sequencing & owners
- **Order:** do this **before** recruiting the 5 creators (so every creator install is
  measurable) and **before** building the referral loop (which depends on referral
  attribution).
- **Mobile devs:** ChottuLink SDK + Universal/App Links + deep-link routing + GA4 param
  logging (most of the work — tickets LAY-1, LAY-2, LAY-3).
- **Web:** the `APP_DEEPLINK_BASE` swap + link-builder tweak in the generator (LAY-4, small).
- **You (founder):** create the ChottuLink Free account, lock the `~channel` naming
  convention so attribution stays clean.

---

### References
- Firebase Dynamic Links deprecation FAQ — https://firebase.google.com/support/dynamic-links-faq
- ChottuLink — FDL alternatives / free tier — https://chottulink.com/blog/is-firebase-dynamic-links-the-best-top-alternatives-for-deep-linking/
