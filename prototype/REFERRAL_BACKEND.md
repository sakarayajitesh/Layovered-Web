# Layovered — Referral Backend Spec

Builds on what you already have. Pairs with `REFERRAL_LOOP_SPEC.md` (product) and
`REFERRAL_COPY.md` (strings).

**You already have:** (1) daily search limit per user, (2) an API for searches remaining today.
**This adds:** referral storage, the accept/activation + reward logic, and a persistent
**bonus-search** pool that the remaining-searches API includes.

---

## 1. Data model

### `users` (extend the existing table)
| Column | Type | Notes |
|---|---|---|
| `referral_code` | varchar, unique | Short code for this user's link (e.g. 8 chars). Assign on signup. |
| `bonus_search_balance` | int, default 0 | **Persistent** searches earned from referrals. Does NOT reset daily. |
| `auth_provider` | enum(`google`,`apple`,`anonymous`) | Reward only when authenticated (not anonymous). |
| `primary_device_id` | varchar | For self-referral / same-device checks. |
| `referred_by_user_id` | fk users.id, nullable | Convenience denormalisation (source of truth = `referrals`). |

### `referrals` (new — one row per referral relationship)
| Column | Type | Notes |
|---|---|---|
| `id` | pk | |
| `referrer_user_id` | fk users.id | Who shared the link. |
| `referee_user_id` | fk users.id, nullable | Null until the new user authenticates. |
| `referee_device_id` | varchar | Captured at install for dedup. |
| `status` | enum(`pending`,`rewarded`,`rejected`) | Lifecycle (see §3). |
| `reject_reason` | varchar, nullable | `self_referral`, `same_device`, `not_authenticated`, `already_referred`, `cap_exceeded`. |
| `referrer_reward` | json, nullable | Snapshot of what was granted, e.g. `{type:"searches",value:5}`. |
| `referee_reward` | json, nullable | e.g. `{type:"searches",value:3}`. |
| `created_at` | ts | Install/attribution time. |
| `rewarded_at` | ts, nullable | When activation succeeded. |

**Constraints:** `UNIQUE(referee_user_id)` — a user can only be referred once. Index
`referrer_user_id`. Optional `device_user_map(device_id → user_id)` table (or reuse
`users.primary_device_id`) for the same-device check.

### `search_bonus_ledger` (new — audit trail for the bonus pool)
| Column | Type | Notes |
|---|---|---|
| `id` | pk | |
| `user_id` | fk users.id | |
| `delta` | int | `+5` / `+3` on reward, `-1` on a bonus search consumed, etc. |
| `reason` | enum(`referral_referrer`,`referral_referee`,`search_consumed`,`manual_adjust`) | |
| `referral_id` | fk referrals.id, nullable | Links the grant to its referral. |
| `balance_after` | int | `bonus_search_balance` after this entry (for reconciliation). |
| `created_at` | ts | |

> `bonus_search_balance` on `users` is the fast-read value; the ledger is the audit/source of
> truth. Keep them consistent in one transaction.

### `referral_config` (single row / app config — so rewards are changeable)
```
referrer_reward = { type: "searches", value: 5 }
referee_reward  = { type: "searches", value: 3 }
monthly_cap     = 10          // rewarded referrals per referrer per month
activation_event = "first_search"
```
The reward-grant code reads this config and **dispatches by `type`** — ship the `searches`
handler now; a `coupon` / `wallet_credit` handler can be added later without schema changes.

---

## 2. Search-allowance integration (with your existing limit)

- **Total searches remaining = `dailyRemaining` + `bonus_search_balance`.**
  (`dailyRemaining` = your existing daily limit − used today.)
- **Consume order:** on each routing search, decrement `dailyRemaining` first; only when daily
  hits 0, decrement `bonus_search_balance` (and write a `search_consumed` ledger entry).
- **Exhausted** = both are 0 → the app shows the out-of-searches sheet.
- **Extend your existing "searches remaining" API** to return all three:
```json
GET /searches/remaining
{ "dailyRemaining": 1, "bonusBalance": 8, "totalRemaining": 9 }
```

---

## 3. Referral lifecycle (the part you don't have yet)

**Step 1 — Code/link.** On signup, assign `users.referral_code`. The ChottuLink referral link
carries `referrerId = referral_code`. Expose it:
```
GET /referral/me  →  { referralCode, referralLink, bonusBalance, rewardedThisMonth, monthlyCap, rewardConfig }
```

**Step 2 — Attribute (on install via a referral link).** The app reads `referrerId` from the
deferred deep link and calls:
```
POST /referral/attribute   body: { referrerCode, deviceId, refereeUserId? }
```
Backend creates a `referrals` row with `status = pending` (referee_user_id may be null if the
new user is still anonymous / skip-login). Basic guards here: referrer exists; referee not
already referred; not the same device/user as the referrer (else create as `rejected`).

**Step 3 — Activate + reward (the trigger = first routing search).** Hook into your existing
search-consume flow. When a user runs a routing search, check: *does this user have a `pending`
referral, and is this their first search?* If yes, validate (see §4). On success, in **one
transaction**:
- `referrer.bonus_search_balance += 5`, ledger entry (`referral_referrer`)
- `referee.bonus_search_balance += 3`, ledger entry (`referral_referee`)
- `referrals.status = rewarded`, set `rewarded_at`, snapshot the reward values
- (optionally set `referee.referred_by_user_id`)

On failure → `status = rejected` with `reject_reason`; grant nothing.

**Step 4 — Display.** The counter/sheets read the extended `/searches/remaining` and
`/referral/me`.

---

## 4. Validation / anti-abuse (server-side, on activation)

Grant the reward only if ALL hold:
- **Authenticated:** `referee.auth_provider ∈ {google, apple}` — never for anonymous/skip-login.
- **New account:** referee account is genuinely new (e.g. created within the referral window),
  and `UNIQUE(referee_user_id)` ensures they're referred only once.
- **New device:** `referee_device_id` not already mapped to any existing user (especially the
  referrer) — kills the "different email, same phone" attack.
- **Not self-referral:** `referrer_user_id != referee_user_id`.
- **Under cap:** `count(referrals where referrer = X and status = rewarded and rewarded_at in current month) < monthly_cap`.
- **Idempotent:** the status transition + unique constraints prevent double-crediting.

If the referrer is over the monthly cap, you can still grant the **referee's +3** (welcome) and
skip the referrer's +5 — your call; record it in the snapshot.

---

## 5. Endpoints summary
| Endpoint | Purpose |
|---|---|
| `GET /referral/me` | The user's code/link + bonus balance + monthly count + reward config. |
| `POST /referral/attribute` | Record a pending referral on install (referrerCode + deviceId). |
| *(hook in search consume)* | On first search: run activation + reward, server-side. |
| `GET /searches/remaining` *(extend)* | Now returns `dailyRemaining`, `bonusBalance`, `totalRemaining`. |

---

## 6. Edge cases
- **Installs but never signs in:** referral stays `pending`; no reward. Optionally expire pending
  rows after N days.
- **Signs in later:** re-evaluate on their first search.
- **Fraud caught after reward:** add a negative `manual_adjust` ledger entry to claw back, and set
  `status = rejected`.
- **Config change (e.g. → ₹500 coupon):** only the grant handler changes; schema/flow stay the same.
