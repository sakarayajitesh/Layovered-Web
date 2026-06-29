# Layovered — Referral Copy & Microcopy

Ready-to-implement strings for every referral touchpoint. Pairs with `REFERRAL_LOOP_SPEC.md`.

**Voice:** warm, clear, peer-to-peer — never salesy. **Templated to the reward config** (don't
hardcode "5"/"3" — read from `referrer_reward` / `referee_reward`, so if the reward later becomes
a ₹500 coupon the copy adapts). Strings below show the current **searches** reward.

---

## 1. Invite screen (the referral hub)
- **Title:** Invite friends, get free searches
- **Subtitle:** You get 2 routing searches a day. Invite a friend and you both get more — they
  get **+3** to start, and you get **+5** every time a friend runs their first search.
- **Balance row:** Searches earned: **{{balance}}**  ·  Referral rewards left this month:
  **{{remaining}}/10**
- **Primary CTA:** Share your invite link
- **Secondary:** Copy link  ·  Show QR
- **Fine print:** Rewards apply once your friend signs in with Google/Apple and runs their first search.

## 2. Prefilled share message (WhatsApp / share sheet)
Short, benefit-first, with the link auto-appended:
> I've been using Layovered to find way cheaper flights — it routes you through countries your
> passport can enter visa-free. Use my link and we both get bonus searches 👉 {{link}}

**Shorter variant (for tight spaces / Stories):**
> Cheaper flights using your passport's visa-free countries ✈️ we both get bonus searches: {{link}}

## 3. ⭐ "Out of searches" wall (the killer placement)
- **Title:** You're out of searches for today
- **Body:** Want more right now? Invite a friend — you'll get **+5 searches** the moment they run
  their first search (and they get **+3** to start).
- **Primary CTA:** Invite a friend → +5 searches
- **Secondary:** Or come back tomorrow for 2 more.

## 4. Post-saving share prompt (after a strong result)
- **Title:** Nice find — you saved ₹{{amount}} on this route.
- **Body:** Know someone who'd love this? Share Layovered — you both get bonus searches.
- **CTA:** Share & earn +5 searches

## 5. Reward-earned toast (to the referrer)
> 🎉 {{friend_name}} just joined and ran their first search — you earned **+5 searches**!

## 6. Referee welcome (new user who joined via a link)
- **On open:** Welcome! {{friend_name}} invited you — run your first routing search to unlock
  **+3 bonus searches**.
- **After first search:** +3 searches added. Happy hunting ✈️

## 7. Edge states
- **Cap reached:** You've earned this month's referral rewards (10). Your invite link still works —
  rewards reset next month.
- **Pending (friend installed but not yet activated):** {{friend_name}} joined — they'll need to
  run their first search for your +5 to land.
- **Anonymous/skip-login friend:** Your friend needs to sign in (Google/Apple) for the reward to count.

---

## 8. Search counter & nudges (flight search page, Layovered mode on)
- **Counter chip:** "{{n}} searches left today"  (n = daily remaining + referral bonus)
- **Low (1 left):** "1 search left today · invite a friend for +5 →"
- **Returning / out-of-searches banner:** "Out of searches? Here's how to get more →"
- **Tap-the-counter explainer (sheet):**
  - Title: "How your searches work"
  - Body: "You get 2 routing searches a day. Invite a friend and you both earn more — +5 for you, +3 for them, every time a friend runs their first search."
  - CTA: "Invite a friend"

## Notes for the build
- Every reward number is read from the **reward config** — these strings are templates, not hardcoded.
- Keep the share message in the **referrer's own voice** ("I've been using…") — it converts far
  better than a branded "Check out Layovered!" blast.
- The **"out of searches" wall (#3)** is the highest-converting placement — give it the best
  visual treatment.
- Keep emoji light (one per string max) to stay on-brand and avoid looking spammy.
