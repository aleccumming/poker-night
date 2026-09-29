# Poker Bank — plan and decisions

A dead-simple web app for our weekly home cash game: track buy-ins during the night,
count chips at the end, and show who e-Transfers whom. `poker-bank.html` is the
original prototype, kept for reference only.

## How the game works

- Cash games, 25¢/50¢ or 50¢/$1 blinds. Amounts can have cents (e.g. $47.75).
- One player per game is the **banker**. All money goes through them.
- Nobody pays during the night. Buy-ins are IOUs, settled by Interac e-Transfer after.
- Losers send the banker money; the banker sends winners money. No player-to-player payments.

## Decisions

| Topic | Decision |
|---|---|
| Wording | Never say "pot" on screen (in poker it means a single hand's pot). Say "on the table" for the night's total, or "total buy-ins". |
| Rebuy presets | $50 and $100, plus a custom amount. Player's last rebuy amount is pre-selected. |
| Chips count **more** than the total buy-ins | The gap comes out of the winners' winnings, **by the same percentage** for each winner (e.g. $12 short, winners up $40 and $20 → each gives back 20%: −$8 and −$4). Leftover cents go to the biggest winners. A winner can never end up losing. |
| Chips count **less** than the total buy-ins | The leftover goes to the banker (for managing the e-Transfers). |
| Sanity check | If the gap is more than the larger of $10 or 3% of the total buy-ins, suggest a recount, but always allow "Settle anyway". Tolerance is adjustable in Settings. |
| History | List of past games (date, total on the table, all paid?). No leaderboard, lifetime totals or rankings, ever. |
| Unpaid games | Nothing is ever deleted. A game stays open until every payment is ticked. A new game can still be started; the old one is listed in History as "2 unpaid" and a reminder banner ("Sep 22 still has 2 unpaid e-Transfers") shows on the start, table and settle screens until it's cleared. |
| No PIN | Friendly game: anyone with the group link can use every button. The link keeps strangers out. |
| Who's who | Each phone picks "Which one are you?" once (on trust, no accounts) and remembers it. |
| Starting & joining | Whoever taps **Start game** is seated and is the **banker** (tap a name to change it). Everyone else taps **Join** on their own phone. Anyone can still add someone who isn't on their phone. "Start with last game's players" copies last game's seats. |
| Rebuys | Your own row gets the big Rebuy button, and you can fix your own amounts. The **banker** can do this for anyone. |
| Ticking payments | The **sender** or the **banker** ticks off each e-Transfer. |
| Cash out | No "Busted" button or hint: people type 0. Undo pop-ups last 3.5 seconds. No copy buttons next to payment amounts (the banker's email/phone still has one). |
| Hosting | Vercel, on a subdomain like `poker.<portfolio-domain>` (portfolio itself is on GitHub Pages). |
| Portfolio / résumé link | The main address opens a **demo** with made-up players stored only in the visitor's browser. The real group uses a private link with a code, e.g. `/g/k7x2m9`. The portfolio links to the demo. |

## How it fits together

- **Front end:** Vite + React + TypeScript, a mobile-first web app (`src/`).
- **Server:** two small Vercel Functions (`api/state.ts`, `api/action.ts`) with the logic in `server/`.
- **Region:** Neon in AWS US West 2 (Oregon) and Vercel Functions in `pdx1` (Portland), next to each other and close to Vancouver. Set in `vercel.json`.
- **Database:** Neon Postgres. Tables are created automatically on first use (`server/schema.ts`).
- **Sync:** each phone asks "anything new?" every 3 seconds while the app is on screen (cheap: a version
  number is compared first). A phone's own changes show instantly and are sent in the background.
- **Shared rules:** `src/lib/reducer.ts` is the single description of every change. The server mirrors it in
  SQL (`server/actions.ts`); `server/server.test.ts` plays two whole nights both ways and checks they match.

## Demo (for the portfolio)

- The main address (`/`) is a demo: made-up players (two past nights and one in progress) built from real
  actions in `src/lib/demo.ts`, saved only in the visitor's browser, with a "Start over" link.
- It never talks to the server, isn't installable, and "which one are you" is remembered separately from
  the real group.

## Database tables (money stored in whole cents)

- `players`: id, name (unique, case-insensitive), etransfer_contact
- `games`: id, created_at, status (`live` → `cashout` → `settled`), banker_id, pot_cents
- `seats`: game_id, player_id, seat_order, chip_cents, cashout_cents
- `buyins`: id, game_id, player_id, amount_cents, created_at
- `payments`: id, game_id, from_id, to_id, amount_cents, paid_at
- `settings`: one row with tolerance_min_cents, tolerance_pct, preset_cents
- `meta`: a version number that goes up on every change

## Security

- The database password lives only on the server (Vercel environment variable `DATABASE_URL`).
- Nothing can be read or changed without the group code from the link (`GROUP_CODE`). Anyone who has the
  link can change anything, which is fine for a friendly game; keep the link in the group chat.
- If the link leaks: change `GROUP_CODE` in Vercel, redeploy, and post the new link.

## Build steps

1. ✅ Scaffold: Vite + React + TypeScript, styles from the prototype, money and settle maths with tests.
2. ✅ Table screen working locally (browser storage).
3. ✅ Start, Cash out, Settle up, History screens.
4. ✅ Neon + Vercel Functions: server, group link, near-live sync, self sign-up, players' own rebuys. Tested against the real Neon database (Oregon).
5. ✅ Invite screen (QR code), Settings, install helper (Android button, iPhone tip), app icon + per-group
   install manifest (the home-screen icon opens the group), demo at the main address.
6. Deploy to Vercel + subdomain. ← check in

## Dev setup notes

- Needs Node 22+. On the work laptop it is a portable install in
  `%LOCALAPPDATA%\Programs\node-v22.23.2-win-x64` (added to the user PATH; restart VS Code to pick it up).
- `npm install` once, then `npm run dev` to run locally, `npm test` to run all tests.
- Settings live in `.env.local` (see `.env.example`); restart `npm run dev` after changing it. Without `DATABASE_URL`, `npm run dev` uses a local test
  database in the `.data` folder, so everything works offline.
- Local group link: `http://localhost:5173/g/<GROUP_CODE>` (or `/g/dev` with no `.env.local`).
