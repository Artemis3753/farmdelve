# 🌾 FarmDelve

[![CI](https://github.com/Artemis3753/farmdelve/actions/workflows/ci.yml/badge.svg)](https://github.com/Artemis3753/farmdelve/actions/workflows/ci.yml)

A single-player browser game where the farm feeds the dungeon: grow crops,
refine them into upgrade materials, push your gear to `+1`, `+2`, … and take
it into a timed dungeon run.

## 🚧 Status

In development. Working end to end, from the screen to the database:

- **Farming** — plant a crop, wait for it to grow, harvest produce and gold
- **Crafting** — refine produce into an upgrade material
- **Gear upgrading** — spend materials on a `+1` roll that can fail
- **Inventory and equipping**
- **Guest players** — every browser gets its own save without signing up

The dungeon screen runs combat in the browser only. Arrow keys or WASD move
one tile at a time, monster packs aggro and chase, both sides auto-attack, and
four skills share a global cooldown: two build Rage, two spend it, and one of
the spenders leaves a bleed. A run can end in defeat but not yet in a clear,
and the screen does not call the two dungeon endpoints yet.

## 🏃 Running it locally

### With Docker

Needs only Docker with Compose. Copy `.env.example` to `.env` at the repo
root and set a password — letters and digits only, since it goes into a
connection URL.

```bash
cp .env.example .env
docker compose up --build
```

Then open http://localhost:3001. One image serves both the built client and
the API; PostgreSQL runs in a second container whose port is not published to
the host. The schema and seed load only on the first start, while the data
volume is empty — after changing `schema.sql`, `docker compose down -v` starts
over.

### Without Docker

Built against **Node 26** and **PostgreSQL 17**; older versions are untested.
Create a database first, then a `server/.env` file with three keys:

```
DATABASE_URL=postgres://user@localhost:5432/farmdelve
PORT=3001
TIME_SCALE=10
```

`TIME_SCALE` divides every crop's growth time, so wheat takes 2 minutes instead
of 20 while developing. `DATABASE_URL` and `TIME_SCALE` have no fallback —
the server refuses to start rather than quietly connecting to the wrong
database. `PORT` falls back to 3001.

```bash
cd server
npm install
npm run db:reset   # drops, recreates and seeds every table
npm run build      # compiles TypeScript into dist/
npm start          # runs dist/index.js

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
  `res`; they throw a `ServiceError` carrying a status code, and `app.ts`
  turns it into the response.
- `server/app.ts` builds the Express app and `server/index.ts` only starts
  listening, so the HTTP tests can send requests to a fresh app without
  opening a port.
- `server/db/` — `schema.sql` and `seed.sql`. No migration tool.
- `client/src/screens/` — one file per screen, switched by `useState` rather
  than a router.
- `client/src/combat/rules.js` — combat as a reducer with no randomness and no
  clock of its own. `Dungeon.jsx` dispatches a tick ten times a second, plus
  the key presses.

The server is TypeScript under `strict`. `tsconfig.json` type-checks
everything, tests included, without emitting; `tsconfig.build.json` extends it,
leaves the tests out and builds into `dist/`. Each query declares the shape of
its rows (`pool.query<{ slot: string }>`) — a compile-time promise, not a
runtime check. The client stays JavaScript.

Outside development, Express also serves the built client from `client/dist`,
so the pages and `/api` share one origin and there is still no CORS. The
`Dockerfile` builds the client and the server in separate stages and keeps
only their output and the production dependencies in the final image.

GitHub Actions runs on every pull request: the client is built, linted and
tested, and the server is built, type-checked and tested against a PostgreSQL 17
service container. `main` only accepts a pull request once both jobs pass.

## 🔌 API

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | database reachable? |
| `GET` | `/api/templates` | static data — item names, crops, recipes, upgrade costs. Fetched once |
| `POST` | `/api/guest` | creates a guest player and sets its cookie |
| `GET` | `/api/player` | everything that changes — gold, stacks, gear, plots |
| `POST` | `/api/gear/:gearInstanceId/upgrade` | rolls for `+1`. The roll is server-side |
| `PUT` | `/api/gear/:gearInstanceId/equip` | idempotent, so `PUT` rather than `POST` |
| `POST` | `/api/plots/:plotNumber/plant` | body `{ cropTemplateId }` |
| `POST` | `/api/plots/:plotNumber/harvest` | returns produce, seeds and gold |
| `POST` | `/api/craft/:recipeId` | spends ingredients, returns the result |
| `POST` | `/api/dungeon/enter` | body `{ tier }`. Closes any leftover run as failed, then starts a new one |
| `POST` | `/api/dungeon/:runId/complete` | body `{ cleared }`. An overtime clear counts but does not raise the best tier |

Every write that touches more than one row runs in one transaction and either
commits whole or rolls back whole. A **409** means the request itself was fine
but the state disagreed — the plot is empty, the crop is not ready, the
materials are short. A failed upgrade roll is **not** a 409: the materials
really were spent, so it commits and returns `{ upgraded: false }`.

Every route below `/api/guest` in the table needs the `farmdelve_guest`
cookie. Without a valid one the answer is **401** `{ reason: 'guest_not_found' }`,
and the client then calls `POST /api/guest` once and retries. That cookie
holds a random UUID, is `HttpOnly` and `SameSite=Lax`, and is `Secure` when
`NODE_ENV` is `production`. One IP address can create five guests an hour;
the sixth gets a **429**. Each new guest starts from the same database
function, `create_player()`, that the seed uses for its development player.

## ⚠️ Known limitations

- **No accounts.** A save belongs to a browser cookie, so clearing cookies
  or switching browsers starts a new guest, and the old save cannot be
  recovered.
- **Old guests are not cleaned up yet.** Guests unseen for 30 days are meant
  to be deleted once a month, by a job that comes with the deployment.
  `last_seen_at` is already updated on every request to a route that needs
  the cookie.
- **Not deployed yet.** Runs locally only until the AWS deployment is done.
- **No migrations.** `schema.sql` drops and recreates everything, so
  `npm run db:reset` wipes the save.
- **Dungeon clears are self-reported.** The client says whether a run was
  cleared; the server only keeps the clock. Accepted for a portfolio game —
  a leaderboard built on these runs could be cheated.

## 🎯 Planned

The finish line is fixed in the Definition of Done at the end of
[`docs/design-backlog.md`](docs/design-backlog.md). What is left on it:

- ☁️ A public deployment on AWS
- 🏰 One complete dungeon run — tier 1, from entering to clearing, rewards and an upgrade
- 🏆 Leaderboard
- 🎨 Sprites for the hero and monsters, and a few sound effects
- 🧪 A playtest of the public URL

Deliberately not planned: dungeon tiers 2–10, the talent tree, the boss, and
the Crossbow and Watering Can specializations — all designed, none built.

## 🤖 Working with Claude Code

[`CLAUDE.md`](CLAUDE.md) holds one rule for Claude Code in this repo: before
offering options on a combat or stat decision, look up how WoW and Fellowship
solved the same problem, and put that comparison into the options. The "Stats"
section of [`docs/design-backlog.md`](docs/design-backlog.md) is an example —
it compares the armor formula `armor / (armor + 1000)` with the banded
diminishing returns those two games use.

The repo has no hooks and no custom commands.

## 🎨 Credits

Item, gear and zone icons come from [game-icons.net](https://game-icons.net),
made by **Lorc**, **Delapouite**, **Lucas** and **Irongamer**, and licensed
under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

They are recolored here, and seeds and crests are drawn onto backgrounds
that are not part of the originals — see
[`Icon.jsx`](client/src/components/Icon.jsx).
