# EloChaser

A full-stack marketplace where chess students find, book and pay coaches, then take lessons on a live shared board with voice chat. It also includes free improvement tools: a Stockfish game review and a puzzle trainer.

It ran in production at elochaser.com from April to September 2026 and is now offline. I built it solo and open-sourced it as a portfolio project.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL + Prisma · NextAuth v5 · Stripe + Stripe Connect · Pusher · WebRTC (PeerJS) · Stockfish (WASM) · Tailwind CSS v4 + shadcn/ui · Vitest · Sentry · Vercel

---

## Features

### For students
- **Coach search** with filters for rating, price, language and availability, plus SEO category pages (for example beginner or endgame coaches).
- **Booking** either for a scheduled timeslot from the coach's weekly availability or as an instant lesson, with free trial lessons.
- **Wallet**: deposit with Stripe. Funds are reserved when a lesson is requested and only charged once the lesson has happened.
- **Reviews, favourites, blocking and direct messages** with coaches.

### Live lessons
- **Shared, synchronized chessboard** over Pusher, with a move-variation tree (branches like chess.com), a position editor, and PGN/FEN import.
- **In-browser voice call** over WebRTC (PeerJS) with short-lived TURN credentials served by the backend and automatic reconnection.
- **Lesson chat**, a Stockfish eval bar, and a solo practice mode.

### For coaches
- Weekly availability templates that generate bookable timeslots in the **coach's own timezone** (DST-safe).
- Accept/decline flow with reasons, email notifications and 1-day / 1-hour reminders.
- **Earnings and payouts via Stripe Connect**, with the commission applied at withdrawal.
- A **behavior-based coach rating** (reviews, responsiveness, completed lessons, no-shows) that sets the search ranking.

### Free tools
- **Game review**: import a game from Chess.com or paste a PGN. Stockfish runs in the browser as WebAssembly, and each move is classified (brilliant, great, best, mistake, miss, blunder...) with an accuracy score and an evaluation graph.
- **Puzzle trainer**: tiered tactics ladders built from the open Lichess puzzle database, with hints, streaks and saved progress.
- **Blog** written in Markdown with per-post SEO metadata.

### Trust, safety and admin
- Admin dashboard to review lessons (including their chat), disputes, abuse flags, account recovery requests, Chess.com verification and direct messages.
- Anti-abuse: duplicate-card detection via Stripe card fingerprints, no-show tracking, caps on paid requests, and database-backed rate limiting.
- Email/password auth with email verification plus Google OAuth, and account suspension that still lets users log in to appeal.

---

## Engineering highlights

Some of the more interesting problems in the codebase:

- **Money correctness.** Every balance change (deposit, reservation, lesson payment, refund, payout) goes through a database transaction with guarded conditional updates (`updateMany ... where status = X`). Two concurrent requests or cron runs therefore can't double-pay or double-refund a lesson. Lesson settlement lives in a single helper, [`src/lib/lesson-ledger.ts`](src/lib/lesson-ledger.ts), and the database also enforces non-negative balances with CHECK constraints.
- **Lesson lifecycle driven by cron jobs.** A daily and a 15-minute Vercel cron move lessons through their states: they expire unanswered requests and release the reserved funds, detect no-shows after a grace period, complete lessons and pay the coach, send reminders, and purge old lesson data. Each task is isolated so one failure doesn't block the others.
- **Timezones.** Everything is stored in UTC. Slot generation happens in the coach's IANA timezone, and times are rendered in the viewer's local time on the client, which avoids server-side timezone bugs.
- **Realtime without a custom server.** Board state, chat and notifications use authenticated private Pusher channels, and the board is re-synced from the database so no moves are lost.
- **Game review math.** Move classification, accuracy and estimated rating are pure, dependency-light functions in [`src/lib/game-review.ts`](src/lib/game-review.ts), with unit tests.
- **Security.** A Content Security Policy, server-side input validation with Zod, rate limiting on sensitive endpoints, Stripe webhook signature checks, and cron endpoints authenticated with a shared secret.

---

## Project structure

```
src/
  app/            Next.js App Router pages and API routes
    api/          Stripe webhook + Connect, cron jobs, Pusher auth, TURN, lesson board sync, Chess.com import
    admin/        Admin dashboard
    lesson/       Live lesson room + practice mode
    review/       Game review
    puzzles/      Puzzle trainer
  components/     UI components (lesson, review, puzzles, dashboard, admin, shadcn/ui)
  lib/            Domain logic: ledger, fees, rating, game review, puzzles, auth, email, rate limiting
    actions/      Server actions (lessons, timeslots, messages, admin, auth...)
prisma/
  schema.prisma   Data model (users, lessons, transactions, payouts, timeslots, puzzles...)
  migrations/     SQL migration history
  import-lichess-puzzles.ts   Imports puzzles from the Lichess open database
content/blog/     Markdown blog posts
```

---

## Running locally

Requirements: Node.js 20+ and PostgreSQL.

```bash
npm install                  # also generates the Prisma client and copies the Stockfish WASM into /public
cp .env.example .env         # then fill in DATABASE_URL and AUTH_SECRET at minimum
npx prisma migrate dev       # create the database schema
npx tsx prisma/seed.ts       # create an admin user
npm run dev                  # http://localhost:3000
```

The core app runs with just a database and `AUTH_SECRET`. The integrations (Stripe, Pusher, SendGrid, Google OAuth, TURN, Sentry, Vercel Blob) each need their own keys in `.env`. See [`.env.example`](.env.example) for what each one does.

To load puzzles, download the [Lichess puzzle database](https://database.lichess.org/#puzzles) and run `npx tsx prisma/import-lichess-puzzles.ts <file> --commit`.

Run the tests with:

```bash
npm test
```

---

## License

[MIT](LICENSE)
