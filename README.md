# 🌾 FarmDelve

[![CI](https://github.com/Artemis3753/farmdelve/actions/workflows/ci.yml/badge.svg)](https://github.com/Artemis3753/farmdelve/actions/workflows/ci.yml)

A single-player farming game with tiered dungeons and gear upgrading.

## 🚧 Status

In development. Three slices work end to end — **gear upgrading**, **inventory
and equipping**, and **farming**. You can plant a crop, wait for it to grow,
harvest it for produce and gold, refine the produce into an upgrade material,
and spend that material on a `+1` roll that can fail.

The dungeon screen runs combat in the browser. Arrow keys or WASD move one
tile at a time, monster packs aggro and chase, both sides auto-attack, and four
skills share a global cooldown: two build Rage, two spend it, and one of the
spenders leaves a bleed. A run can end in defeat but not yet in a clear, and
the screen does not call the two dungeon endpoints yet.

## 🤖 Working with Claude Code

[`CLAUDE.md`](CLAUDE.md) is the instruction file for Claude Code in this repo. The rule in it is to look up how WoW and Fellowship solved the same problem before offering options, and to put the comparison into the options: "Put the comparison into the options, then ask."
The "Stats" section of [`docs/design-backlog.md`](docs/design-backlog.md) compares the armor formula `armor / (armor + 1000)` with the banded diminishing returns used by WoW and Fellowship.
The repo has no hooks and no custom commands.

## 🏃 Running it locally

Built against **Node 26** and **PostgreSQL 17**; older versions are untested.
Create a database first, then a `server/.env` file with three keys:

```
DATABASE_URL=postgres://user@localhost:5432/farmdelve
PORT=3001
TIME_SCALE=10
```

`TIME_SCALE` divides every crop's growth time, so wheat takes 2 minutes instead
of 20 while developing. There is no fallback for any of these — the server
refuses to start rather than quietly connecting to the wrong database.

```bash
cd server
npm install
npm run db:reset   # drops, recreates and seeds every table
npm start

cd client
npm install
npm run dev
```

Then open http://localhost:5173.

## 🧱 Architecture

```
React + Vite  :5173
     │   /api/* proxied in dev, so there is no CORS in development
     ▼
Express       :3001
     │   pg
     ▼
PostgreSQL          15 tables
```

- `server/services/` — one file per feature. None of them know about `req` or
  `res`; they throw errors carrying a status code, and `index.js` translates.
- `server/db/` — `schema.sql` and `seed.sql`. No migration tool.
- `client/src/screens/` — one file per screen, switched by `useState` rather
  than a router.
- `client/src/combat/rules.js` — combat as a reducer with no randomness and no
  clock of its own. `Dungeon.jsx` dispatches a tick ten times a second, plus
  the key presses.

## 🔌 API

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | database reachable? |
| `GET` | `/api/templates` | static data — item names, crops, recipes, upgrade costs. Fetched once |
| `GET` | `/api/player` | everything that changes — gold, stacks, gear, plots |
| `POST` | `/api/gear/:gearInstanceId/upgrade` | rolls for `+1`. The roll is server-side |
| `PUT` | `/api/gear/:gearInstanceId/equip` | idempotent, so `PUT` rather than `POST` |
| `POST` | `/api/plots/:plotNumber/plant` | body `{ cropTemplateId }` |
| `POST` | `/api/plots/:plotNumber/harvest` | returns produce, seeds and gold |
| `POST` | `/api/craft/:recipeId` | spends ingredients, returns the result |
| `POST` | `/api/dungeon/enter` | body `{ tier }`. Closes any leftover run as failed, then starts a new one |
| `POST` | `/api/dungeon/:runId/complete` | body `{ cleared }`. An overtime clear counts but does not raise the best tier |

Every write runs in one transaction and either commits whole or rolls back
whole. A **409** means the request itself was fine but the state disagreed —
the plot is empty, the crop is not ready, the materials are short. A failed
upgrade roll is **not** a 409: the materials really were spent, so it commits
and returns `{ upgraded: false }`.

## ⚠️ Known limitations

- **No accounts.** Every request runs as player 1.
- **Not deployed.** Runs locally only, for now.
- **No migrations.** `schema.sql` drops and recreates everything, so
  `npm run db:reset` wipes the save.
- **Dungeon clears are self-reported.** The client says whether a run was
  cleared; the server only keeps the clock. Accepted for a portfolio game —
  a leaderboard built on these runs could be cheated.
- **Combat stays in the browser.** Nothing about a fight reaches the server
  yet, and there is no way to clear a run.
- The leaderboard is designed but not built.

## 🎯 Planned

The finish line is fixed in the Definition of Done at the end of
[`docs/design-backlog.md`](docs/design-backlog.md). What is left on it:

- 🧰 TypeScript on the server (in progress), Docker, and a public deployment on AWS
- 🏰 One complete dungeon run — tier 1, from entering to clearing, rewards and an upgrade
- 🏆 Leaderboard
- 🎨 Sprites for the hero and monsters, and a few sound effects
- 🧪 A playtest of the public URL

Deliberately not planned: dungeon tiers 2–10, the talent tree, the boss, and
the Crossbow and Watering Can specializations — all designed, none built.

## 🎨 Credits

Item, gear and zone icons come from [game-icons.net](https://game-icons.net),
made by **Lorc**, **Delapouite**, **Lucas** and **Irongamer**, and licensed
under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

They are recolored here, and seeds and crests are drawn onto backgrounds
that are not part of the originals — see
[`Icon.jsx`](client/src/components/Icon.jsx).
