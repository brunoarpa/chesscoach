# EloChaser — Pre-Launch Checklist

Work top to bottom. Anything under **🚩 Blocker** must be true before promoting the
site publicly. The rest is strongly recommended. This handles real money, so the
cost of shipping a bug to thousands of users is much higher than to ten.

---

## 1. Stripe (money — highest risk) 🚩

- [ ] **Live mode keys** in production env (`STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` start with `sk_live_` / `pk_live_`, not `sk_test_`).
- [ ] **Webhook endpoint** registered in the Stripe dashboard → Developers → Webhooks, pointing at `https://<your-domain>/api/stripe/webhook`, subscribed to at least `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`. **Test it**: trigger a real (small) deposit and confirm the wallet credits and a `Transaction` row appears.
- [ ] **USD settlement currency added** to the platform Stripe account (Settings → Balances → add USD). The withdraw route fails with `balance_insufficient` without it — see `src/lib/stripe.ts`.
- [ ] **Stripe Connect (Express) enabled** for the platform; a real coach can complete onboarding and reach `payouts_enabled: true`.
- [ ] **Full payout dry-run**: one coach earns from a completed lesson, then withdraws ≥ $5.00, and the transfer lands. Confirm fees match (`processingFee` in `src/lib/fees.ts`).
- [ ] **Refund/clawback path** sanity-checked: resolve one DISPUTED lesson each way in admin and confirm balances move correctly.
- [ ] Decide and document **merchant of record / who bears chargebacks** and the **refund policy** shown to users.

## 2. Environment & secrets 🚩

- [ ] All prod env vars set on the host (Vercel project settings), not just in local `.env`.
- [ ] `AUTH_SECRET` is a strong random value (and **different** from any dev value).
- [ ] `AUTH_URL` and `NEXT_PUBLIC_APP_URL` point at the real production domain (https, no trailing slash).
- [ ] `CRON_SECRET` set and matches what the cron caller sends (see §4).
- [ ] `.env` is gitignored and has **never** been committed (verify: `git log --all --full-history -- .env` is empty).
- [ ] Google OAuth (`GOOGLE_CLIENT_ID/SECRET`) has the production redirect URI whitelisted in Google Cloud console.

## 3. Database (Neon) 🚩

- [ ] All migrations deployed to the prod DB (`prisma migrate deploy` ran; `prisma migrate status` is clean).
- [ ] **Point-in-time restore / backups enabled** on the Neon project (so a bad bug is recoverable).
- [ ] A **separate database/branch for staging** so manual testing never touches prod data. (Neon branches make this easy.)
- [ ] Connection pooling configured (Neon pooled connection string) — serverless + per-request clients can exhaust direct connections under load.

## 4. Cron / scheduled jobs 🚩

- [ ] `/api/cron/daily` is actually scheduled (e.g. Vercel `vercel.json` cron) and the caller sends `Authorization: Bearer <CRON_SECRET>`.
- [ ] Confirm it runs: lesson completion, no-show detection, slot generation, and data purge all depend on it. Without the cron, **lessons never complete and coaches never get paid.**
- [ ] Pick a sensible time and frequency. Daily means up to ~24h latency on completion/payout — decide if that's acceptable or run it more often.

## 5. Email (SendGrid)

- [ ] Sender identity / domain authentication verified in SendGrid (SPF/DKIM) so verification + reset emails don't spam-folder.
- [ ] `EMAIL_FROM` matches a verified sender.
- [ ] Real test: sign up → receive verification email → verify; request password reset → receive → reset.

## 6. Real-time & calls (Pusher / TURN)

- [ ] Pusher prod app credentials set; check the plan's concurrent-connection and message limits against expected load.
- [ ] TURN server (`NEXT_PUBLIC_TURN_*`) reachable, so audio calls work behind NATs/firewalls.

## 7. Legal / compliance 🚩

- [ ] `/terms` and `/privacy` contain real, reviewed content (not placeholder).
- [ ] Refund, dispute, and no-show policies are stated to users and match the code's behavior.
- [ ] Tax handling decided (you may have reporting obligations for coach payouts).
- [ ] Decide policy for minors — chess coaching attracts under-18 users; KYC (Stripe) is for coaches, not students.

## 8. Security

- [ ] At least one trusted `ADMIN` account exists; admin routes are gated (middleware + `requireAdmin`).
- [ ] Rate limits reviewed (deposit/withdraw/chat/signup) — present, but sanity-check the numbers for your scale.
- [ ] HTTPS enforced (default on Vercel).
- [ ] Run `npm audit`; triage the 5 moderate advisories (none necessarily blocking, but know what they are).

## 9. Monitoring & observability 🚩 (don't launch blind)

- [ ] Error tracking wired up (e.g. Sentry) for both server and client.
- [ ] Alert on **Stripe webhook failures** and on the `CRITICAL:` console errors the withdraw route logs (failed-but-unreconciled payouts).
- [ ] Uptime check pointed at **`/api/health`** (returns `{status:"ok"}`, or 503 if the DB is unreachable — alert on that).
- [ ] A way to see logs in prod.

## 10. Functional smoke test (do this manually before launch)

Walk every critical path once, end-to-end, on the real (or staging) site:

- [ ] Sign up (email + Google), verify email, set username.
- [ ] Deposit funds (Stripe test card `4242 4242 4242 4242` in test mode).
- [ ] Search/browse coaches; favourite one.
- [ ] Book a free trial → coach accepts → both join → lesson room (board + chat + call) works → it auto-completes via cron.
- [ ] Book a **paid** slot → verify funds reserve, then debit on completion, and coach earnings credit.
- [ ] No-show paths: coach no-show (student refunded) and student no-show (coach paid).
- [ ] Dispute a lesson → resolve it both ways in admin.
- [ ] Coach: set availability/timezone, set prices, onboard Stripe Connect, withdraw earnings.
- [ ] Leave a review; check it appears on the profile.
- [ ] Block a student; confirm pending requests cancel, funds release, and the slot frees.

## 11. Scale (for "a lot of people")

- [ ] Load-test or at least reason about: Neon connection limits, Pusher concurrency, and the once-daily cron under a backlog of lessons.
- [ ] Have a rollback plan (Vercel instant rollback + Neon PITR) and know who's on call for launch day.

---

### Automated checks currently in place
- `npm test` — unit tests for fee math, the lesson-payment ledger invariant, the coach-ELO formula, and booking availability.
- `GET /api/health` — DB-backed liveness probe for uptime monitoring.
- `npm run lint`, `npx tsc --noEmit` — clean.

These cover pure logic and the money helper, **not** the full DB-transaction flows or the UI — §10's manual walk is still required.
