# Poker Night

A mobile web app for a weekly home poker game: everyone tracks their own buy-ins on their phone,
chips are counted at the end, and the app works out who e-Transfers whom.

**Live demo:** [poker.alecgcumming.com](https://poker.alecgcumming.com) (made-up players; changes stay in your browser)

## What it does

- **Join from your phone.** Whoever starts the game is the banker; everyone else scans a QR code and taps their name.
- **Two-tap rebuys**, with your last amount pre-selected. Every phone updates within a few seconds.
- **Cash out** by entering each player's chips. Counts are rarely exact, so small gaps are fixed automatically:
  if chips count more than the buy-ins, winners give back the same percentage of their winnings; if less,
  the banker keeps the difference. Big gaps prompt a recount.
- **Settle up** through the banker only: losers send the banker, the banker pays winners. Each e-Transfer can be
  ticked off, and unpaid ones are remembered across nights.
- Installable to the home screen, dark mode, and one-handed use at the table.

## How it's built

- **Front end:** React + TypeScript (Vite), no UI framework.
- **API:** two Vercel Functions (`api/`) with the logic in `server/`.
- **Database:** Neon Postgres. Tables are created on first run (`server/schema.ts`).
- **Sync:** each phone applies its own changes instantly and polls a cheap version number every 3 seconds.
- **One set of rules:** every change is a typed action applied by a pure reducer (`src/lib/reducer.ts`) on the
  phone and mirrored in SQL on the server (`server/actions.ts`). A test plays two full nights through both and
  checks they end up identical (`server/server.test.ts`, run against an in-memory Postgres via PGlite).
- **Money** is integer cents throughout. The settle-up maths is in `src/lib/settle.ts`, with tests.

## Running it

```sh
npm install
npm run dev     # http://localhost:5173 is the demo; /g/dev uses a local database in .data/
npm test
```

To use a real database, copy `.env.example` to `.env.local` and fill in `DATABASE_URL` and `GROUP_CODE`.
