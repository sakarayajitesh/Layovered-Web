# Layovered — Referral App (Mobile): Jira Tickets

Paste-ready tickets for the **app developer** (iOS + Android). Covers the referral UI and client
logic. The dev only needs two docs: this file and **`REFERRAL_APP_GUIDE.md`** (how to build each
ticket, with all the exact copy inlined), plus `REFERRAL_APP_FLOW.svg` (the picture) and Figma.

**Depends on two other workstreams:**
- **Backend** — `REFERRAL_BACKEND_TICKETS.md`: `GET /referral/me`, `POST /referral/attribute`,
  extended `GET /searches/remaining`. The app consumes these.
- **Deep linking** — `DEEPLINK_SETUP_BRIEF.md` tickets **LAY-1 / LAY-2 / LAY-3** (ChottuLink SDK,
  Universal/App Links, deferred deep-link routing). The referral attribution rides on LAY-2/LAY-3.

**Designs already exist in Figma** (file "Layovered - ORIGINAL") — each ticket names its screen.

**Two rules everywhere:**
1. **Never hardcode "+5"/"+3".** Read reward numbers from `rewardConfig` (returned by `/referral/me`)
   and template all copy from them — so a future change to a ₹500 coupon needs no app update.
2. The app **never grants rewards** — it only displays state from the backend. Granting is server-side.

---

## EPIC — LAY-REFAPP: In-app referral experience

**Goal:** A user can invite friends from a clear Invite screen and from the "out of searches" moment;
a friend who installs via the link is attributed to the referrer; the search-counter and its states
make the limit (and how to earn more) visible; both sides see confirmation when a reward lands.

**Definition of done (epic):**
- Invite screen shows the user's link/QR/balance and shares a referrer-voice message.
- A real install via a referral link calls `POST /referral/attribute` with the right `referrerId`.
- The search page shows live counter / low / exhausted / returning states from `/searches/remaining`.
- The "out of searches" wall offers the invite and converts.
- Reward + welcome confirmations render; edge states (cap, pending, anonymous) handled.
- Analytics events fire: `invite_sent`, `referral_install` (+ the backend's `referral_activated`/`reward_granted` are reflected in UI).

**Order:** LAY-REFAPP-1 (counter API plumbing) → 2 (Invite screen) → 3 (share link gen) → 4 (attribute on install) → 5 (counter states) → 6 (out-of-searches wall) → 7 (explainer sheet) → 8 (confirmations + welcome) → 9 (edge states) → 10 (analytics).

---

## LAY-REFAPP-1 — Wire the searches API into the search page
**Type:** Task · **Est:** 0.5d · **Blocked by:** backend LAY-REF-7

**Scope**
- Call the extended `GET /searches/remaining` → `{ dailyRemaining, bonusBalance, totalRemaining }`.
- Hold these in app state for the Layovered-mode search screen; refresh after every routing search
  and on screen focus.

**Acceptance**
- The search screen has access to `totalRemaining` (= daily + bonus) at all times it's visible.
- Values refresh after a search completes and when returning to the screen.

---

## LAY-REFAPP-2 — Invite screen (referral hub)
**Type:** Task · **Est:** 1.5d · **Blocked by:** backend LAY-REF-4 · **Figma:** "Referral – Invite friends" / "(402)"

**Scope**
- Build the Invite screen from the Figma design.
- On open, call `GET /referral/me` → populate: title/subtitle, **balance row** ("Searches earned: {{balance}} · Rewards left this month: {{rewardedThisMonth}}/{{monthlyCap}}"), primary CTA "Share your invite link", secondary "Copy link" + "Show QR", and the fine print.
- All numbers (the "+3", "+5", "/10") come from `rewardConfig` — template them, do not hardcode.
- Exact copy: `REFERRAL_APP_GUIDE.md` §3.

**Acceptance**
- Screen matches Figma on both iOS + Android.
- Balance + monthly count + reward numbers all reflect the API/config (verified by changing config server-side).
- Copy-link copies the link; Show-QR renders a scannable QR of the link.

---

## LAY-REFAPP-3 — Generate the referral link + share sheet
**Type:** Task · **Est:** 1d · **Blocked by:** LAY-2 (ChottuLink SDK), LAY-REFAPP-2

**Scope**
- When the user taps **Share**, request a ChottuLink referral link carrying `referrerId = referralCode`
  + `~feature=referral` (per `DEEPLINK_SETUP_BRIEF.md` §3.3). Prefer the link returned by `/referral/me`
  if the backend builds it; otherwise build via the ChottuLink SDK.
- Open the native share sheet with the **prefilled, referrer-voice message** (exact text in
  `REFERRAL_APP_GUIDE.md` §4; the link auto-appended). Include the shorter Stories variant where space is tight.
- Fire the `invite_sent` analytics event on share.

**Acceptance**
- Shared link contains the correct `referrerId` and `~feature=referral`.
- The share message is the referrer-voice copy (not a branded blast), link appended.
- `invite_sent` fires once per share action.

---

## LAY-REFAPP-4 — Attribute the install (read referrerId → POST /referral/attribute)
**Type:** Task · **Est:** 1d · **Blocked by:** LAY-3 (deferred deep-link routing), backend LAY-REF-5

**Scope**
- On first open after a fresh install, read `referrerId` from the **deferred deep link** (the LAY-3 work).
- Call `POST /referral/attribute` with `{ referrerCode, deviceId, refereeUserId? }` —
  `refereeUserId` only if the user is already signed in; otherwise omit (backend keeps it pending).
- If the user signs in **later**, re-call attribute (or your sign-in flow notifies the backend) so the
  pending referral gets the `refereeUserId`.
- Make the call **idempotent-safe**: don't spam it on every open — fire once per install (guard with a local flag).
- Fire `referral_install` analytics with the `referrerId`/`~channel`.

**Acceptance**
- Installing via a referral link results in exactly one `attribute` call with the correct `referrerId` + `deviceId`.
- A user who installs anonymously then signs in later gets their referral linked (referee id reaches the backend).
- No duplicate attribute calls on subsequent app opens.

---

## LAY-REFAPP-5 — Search-counter chip + states (Layovered mode)
**Type:** Task · **Est:** 1.5d · **Blocked by:** LAY-REFAPP-1 · **Figma:** search screen with "2 LayOver searches left for today"

**Scope** (exact copy in `REFERRAL_APP_GUIDE.md` §6)
- **Counter chip** near the Layovered-mode toggle: "{{totalRemaining}} searches left today". Tappable → opens the explainer sheet (LAY-REFAPP-7) or Invite screen.
- **Low state (total == 1):** "1 search left today · invite a friend for +5 →" (the "+5" from config).
- **Returning / how-to-get-more banner:** when the page opens with low/0 searches, show a slim banner "Out of searches? Here's how to get more →" → Invite screen.
- **Exhausted (total == 0):** the next search attempt opens the out-of-searches wall (LAY-REFAPP-6).

**Acceptance**
- Chip shows the correct total and updates after each search.
- Low state renders at exactly 1 remaining with the invite nudge.
- Returning banner shows when opening with 0/low; tapping it opens Invite.
- At 0, attempting a search routes to the wall (not a dead error).

---

## LAY-REFAPP-6 — "Out of searches" wall (the hero placement)
**Type:** Task · **Est:** 1d · **Blocked by:** LAY-REFAPP-2 · **Figma:** "Referral – Out of searches (sheet)"

**Scope** (exact copy in `REFERRAL_APP_GUIDE.md` §7)
- When a user with `totalRemaining == 0` tries to search, present the wall:
  title "You're out of searches for today", body with the "+5 / +3" offer (from config),
  primary CTA "Invite a friend → +5 searches" → Invite/Share flow, secondary "Or come back tomorrow for 2 more".
- This is the highest-converting placement — match the Figma treatment exactly.

**Acceptance**
- Triggered only at `totalRemaining == 0`.
- Primary CTA leads into the share flow (LAY-REFAPP-3); reward numbers from config.
- Matches Figma on both platforms.

---

## LAY-REFAPP-7 — "How your searches work" explainer sheet
**Type:** Task · **Est:** 0.5d · **Figma:** "Referral – Know more (sheet)"

**Scope** (exact copy in `REFERRAL_APP_GUIDE.md` §8)
- Bottom sheet opened by tapping the counter chip: title "How your searches work", body explaining
  2/day + how invites earn more (numbers from config), CTA "Invite a friend" → Invite screen.

**Acceptance**
- Opens from the counter chip; CTA opens Invite; numbers from config; matches Figma.

---

## LAY-REFAPP-8 — Reward confirmation + referee welcome
**Type:** Task · **Est:** 1d · **Blocked by:** backend LAY-REF-6

**Scope** (exact copy in `REFERRAL_APP_GUIDE.md` §9)
- **Referrer toast** when a reward lands: "🎉 {{friend_name}} just joined and ran their first search — you earned +{{value}} searches!" Trigger off a fresh `/referral/me` (balance increased) or a push, whichever you implement.
- **Referee welcome:** new user who joined via a link sees "Welcome! {{friend_name}} invited you — run your first routing search to unlock +{{value}} bonus searches", and after their first search: "+{{value}} searches added."
- **Profile entry point:** ensure the "Invite friends" row on the profile/settings screen opens the Invite screen (design already placed in Figma).

**Acceptance**
- Referrer sees a confirmation after a reward without needing to dig into the Invite screen.
- A referred new user sees the welcome before, and the confirmation after, their first search.
- Profile "Invite friends" row navigates to the Invite screen.

---

## LAY-REFAPP-9 — Edge states (cap / pending / anonymous)
**Type:** Task · **Est:** 0.5d

**Scope** (exact copy in `REFERRAL_APP_GUIDE.md` §9)
- **Cap reached:** on the Invite screen, when `rewardedThisMonth >= monthlyCap`, show "You've earned this month's referral rewards ({{cap}}). Your invite link still works — rewards reset next month."
- **Pending:** optionally surface "{{friend_name}} joined — they'll need to run their first search for your +{{value}} to land."
- **Anonymous friend:** messaging that the friend must sign in (Google/Apple) for the reward to count.

**Acceptance**
- Invite screen reflects the cap state correctly (CTA still works, messaging changes).
- Pending/anonymous messaging shown where the data is available.

---

## LAY-REFAPP-10 — Analytics events
**Type:** Task · **Est:** 0.5d · **Blocked by:** LAY-REFAPP-3, 4

**Scope**
- Fire to GA4/Firebase: `invite_sent` (on share), `referral_install` (on deferred open with `referrerId`).
- Make sure these line up with the backend's `referral_activated` / `reward_granted` so the funnel
  and viral coefficient **K** can be computed end-to-end.

**Acceptance**
- Both client events fire with the relevant params (`referrerId`, `~channel`).
- A test referral shows invite_sent → referral_install in analytics, joining the backend's events into one funnel.

---

## Suggested sprint split
- **Sprint 1 (visible value fast):** LAY-REFAPP-1, 5, 6, 7 — the counter, its states, the out-of-searches wall, the explainer. These depend only on `/searches/remaining` and give users the most visible change first.
- **Sprint 2 (the loop):** LAY-REFAPP-2, 3, 4, 8, 9, 10 — Invite screen, share, attribution, confirmations, edge states, analytics. These need the referral endpoints + deep-link work (LAY-2/LAY-3).

> Heads-up on dependencies: LAY-REFAPP-4 (attribution) can't be fully tested until deep-link tickets
> **LAY-2/LAY-3** are done. Build the UI tickets (2, 5, 6, 7) in parallel so the app team isn't blocked.
