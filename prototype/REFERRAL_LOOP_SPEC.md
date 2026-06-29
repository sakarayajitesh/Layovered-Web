# Layovered — Referral Loop Spec

Goal: turn every user into a sharer, so seeded traffic and launch buzz **compound** instead
of leaking away. Pairs with the deep-link work (ChottuLink `referrerId`) and the waitlist.

---

## 0. TL;DR
- **Reward currency = extra routing searches.** You already cap routing at 2/day because it's
  expensive — that scarcity is the perfect, cost-aligned reward.
- **Two-sided**, and the reward triggers on **activation** (friend installs *and* runs their
  first search) — not on a bare install (gameable) and not on a booking (too rare to fire).
- **Killer placement:** the "you're out of searches today" wall → "Get +5 searches — invite a
  friend." The constraint itself drives the loop.
- Crediting runs on the ChottuLink deferred deep link (`referrerId`) → backend grants the reward.

---

## 1. Objective & north-star
- **North-star: viral coefficient K** = (invites sent per user) × (invite→activation rate).
  K approaching/above ~1 means the loop self-sustains. Track it from day one.
- Secondary: referral installs, referral→activation rate, searches granted (cost), and share
  rate at the "aha" moment.

## 2. The reward — extra routing searches
**Why this currency:** searches are scarce (2/day cap) and cost you money to run, so they're
genuinely valuable to users *and* the reward cost only grows for engaged, growth-driving users.
Perfect alignment.

**Starting economics (tune to your real per-search cost):**

| Who | Reward | When |
|---|---|---|
| Base (everyone) | 2 routing searches / day | — |
| **Referrer** | **+5 searches** (one-time) per *activated* friend | friend runs first search |
| **Referee (new user)** | **+3 searches** welcome bonus | on activation |
| Cap | max ~10 rewarded referrals / month (≈ +50 searches) | anti-abuse + cost control |

These are starting guesses — adjust once you know your cost per routing search and watch K.

**Make the reward configurable — do NOT hardcode "+5 searches".** Store it as config so you can
swap it (e.g. to a ₹500 coupon or wallet credit) without re-engineering:

```
referrer_reward: { type: "searches", value: 5 }
referee_reward:  { type: "searches", value: 3 }
cap_per_month: 10
activation_event: "first_routing_search"
```

The grant step **dispatches by `type`** — ship the `searches` handler now; design so `coupon` /
`wallet_credit` handlers can be added later without touching the rest.

**Track a per-user ledger:** rewarded-referrals this month (for the cap) + earned balance, so the
user can see "referrals remaining" / searches earned.

**Layered alternatives** (optional, later): a booking-fee waiver, a discount on the layover
tour, or early/priority access to new features. Keep searches as the primary lever.

## 3. The mechanic (two-sided, activation-triggered)
- Referrer (signed in) shares their unique link → friend installs → friend **activates**
  (signs in with Google/Apple **and** runs their first routing search) → **both** get credited.
- **Trigger = activation, not install.** Bare-install rewards get farmed with fake installs;
  booking is too rare to ever fire the loop. Activation = a real, authenticated user — hard to
  fake, fires often enough to compound.
- **Authenticated (Google/Apple) accounts only.** Anonymous / skip-login users don't trigger or
  earn rewards (see §8). If a referee skips login, hold the pairing **pending** until they sign in.
- Referee bonus is granted on activation too (an incentive to *complete*, not just install).

## 4. The killer placement — the "out of searches" wall ⭐
Because you cap routing at 2/day, every active user hits a wall. **That wall is the single best
referral placement.** Instead of a dead "come back tomorrow," show:

> "You're out of routing searches for today. Want more now? **Invite a friend → +5 searches.**"

This converts your cost constraint into your growth engine — the moment a user most wants more
searches is exactly when you ask them to invite someone. Make this the hero entry point.

## 4a. Search counter & states (the flight search page)
When **Layovered mode is ON**, show a live **search counter** so the limit is visible — that
visibility is what makes the referral offer land.

- **Counter chip** (near the Layovered-mode toggle): **"{n} searches left today"**, where
  `n = dailyRemaining + bonusBalance`. Tappable → opens the Invite screen / a short
  "how searches work + how to get more" explainer.
- **Low state (1 left):** chip reads "1 search left today" with an inline nudge "invite a friend for +5 →".
- **Exhausted (n = 0):** the next search attempt opens the **"out of searches" wall** (§4).
- **Returning / how-to-get-more nudge:** when a user opens the search page with 0 (or low)
  searches, show a slim banner — "Out of searches? **Here's how to get more** →" → Invite screen.
  This is the "tell them how to increase it when they come back" behaviour.

### Search-allowance model (backend)
- `dailyRemaining` — resets to the base **2** each day (pick local-midnight or a fixed UTC reset).
- `bonusBalance` — **persistent** searches earned from referrals (the ledger from §2); does **not**
  reset daily.
- **Searches left shown = `dailyRemaining + bonusBalance`.** On each routing search, decrement
  `dailyRemaining` first, then `bonusBalance`. Both at 0 → exhausted.
- Expose all three (`dailyRemaining`, `bonusBalance`, total) via the app API so the counter and
  states render.

## 5. Other entry points (the "aha" moments)
- **Right after a big saving** — when a search returns a cheap visa-free route, surface "Share
  this find / Invite a friend and you both get searches." Peak motivation to share.
- A persistent **"Invite friends"** item in the menu/settings (shows their reward balance).
- The **waitlist page** (pre-launch variant, §7).

## 6. The full flow (ties to ChottuLink)
1. User taps **Invite** → app requests a ChottuLink referral link carrying `referrerId` +
   `~feature=referral` (+ a QR + a prefilled share message).
2. Friend taps the link → installs → **deferred deep link** delivers `referrerId` to the app on
   first open (the dev's LAY-2/LAY-3 work).
3. Friend **activates** (runs first routing search / signs up).
4. Backend validates the activation event, then **grants +5 searches to the referrer and +3 to
   the referee**, and records the pairing.
5. Both users see a confirmation ("You earned +5 searches 🎉").

## 7. Pre-launch variant — "refer to skip the waitlist" (web, do this NOW)
This runs *before* the app referral and needs no app build — just the waitlist:
- After someone joins the waitlist, show: "Want in sooner? **Refer friends to move up the
  queue / unlock early access at 3 referrals.**"
- Mechanic: each referred signup moves them up, or unlocks early access at N referrals.
- Implementation: a referral-waitlist tool (e.g. a waitlist service) or a simple unique-link +
  Brevo tracking. Lower fidelity is fine — the point is pre-launch FOMO.

## 8. Anti-abuse controls (because the reward costs you money)
- Reward **only on validated activation**, server-side — never client-claimed.
- **Authenticated (Google/Apple) new accounts only.** Skip-login / anonymous users earn nothing —
  anonymous identity is ephemeral and trivially farmed. Hold the pairing **pending** until they auth.
- **Block same-device referrals.** Track a device ID / fingerprint; reject any referral whose
  referee device is already tied to an existing account (incl. the referrer). This kills the
  "different email, same phone" trick.
- **Referrer must be signed in** to earn/hold credits (anonymous balances are unreliable + gameable).
- **New device + new account** required for the referee; one reward per device/account.
- **Cap** rewarded referrals per referrer per month (config); rate-limit grants; flag spikes.

## 9. Metrics to instrument (GA4 + backend)
- `invite_sent`, `referral_install`, `referral_activated`, `reward_granted` (with searches count).
- **Viral coefficient K**, referral→activation funnel, share rate at the aha moment, and total
  searches granted (your cost).

## 10. Build requirements & owners
- **Dev (app):** "Invite" UI + share sheet + ChottuLink referral link generation; the **search-counter
  chip + states** on the Layovered-mode search page (counter / low / exhausted wall / returning
  nudge); reading `referrerId` on deferred open (LAY-2/LAY-3); confirmation UI.
- **Dev (backend):** the **search-allowance API** (`dailyRemaining` with a daily reset, persistent
  `bonusBalance`, decrement-and-expose total); referral records + **per-user ledger** (monthly count
  + balance); activation validation (authenticated first search); **config-driven** reward granting
  (type-dispatched so `searches` now / `coupon` later); caps + **auth & device** fraud checks; metrics events.
- **Reward plumbing:** ties into your existing search-rationing system (grant extra searches on
  top of the 2/day).
- **Founder (now):** the pre-launch waitlist referral (§7); decide the starting reward numbers.

## 11. Acceptance criteria
- A user can generate and share a referral link (+ QR) from the app.
- A friend who installs via the link and runs a first search → referrer gets +5 searches,
  referee gets +3, both see confirmation, pairing recorded.
- Bare installs grant nothing; **anonymous/skip-login referees grant nothing** (held pending until
  they authenticate); **same-device** and self-referrals rejected; caps enforced.
- Reward **type/value/cap are read from config** and can be changed (e.g. to a ₹500 coupon) without
  code changes; per-user ledger reflects the balance + monthly count.
- K and the referral funnel are visible in analytics.
- The "out of searches" wall shows the invite offer.

## 12. Phasing
- **Phase 0 (now):** waitlist "refer to skip the queue" (§7) — pre-launch, no app build.
- **Phase 1 (at routing launch):** in-app search-credit referral + the "out of searches" wall +
  deep-link crediting (needs dev LAY-3).
- **Phase 2 (later):** quarterly giveaway-referral burst (Going-style: "+entries per friend") to
  spike the list around milestones.

## 13. Decisions (locked)
1. **Reward:** +5 searches (referrer) / +3 (referee), cap 10 rewarded referrals/month — stored as
   **config** so it can be swapped (e.g. ₹500 coupon / wallet credit) later without re-engineering.
2. **Activation = the referee's first routing search** (not signup, not install).
3. **Auth/device guard:** authenticated (Google/Apple) **new** account on a **new** device only;
   no skip-login/anonymous; same-device self-referral blocked.
4. *Still open:* pre-launch waitlist referral tooling (dedicated tool vs simple link + Brevo) — Phase 0.
