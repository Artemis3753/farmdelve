# 🌾 FarmDelve

A single-player farming game with tiered dungeons and gear upgrading.

## 🚧 Status

In development. Three slices work end to end — **gear upgrading**, **inventory
and equipping**, and **farming**. You can plant a crop, wait for it to grow,
harvest it for produce and gold, refine the produce into an upgrade material,
and spend that material on a `+1` roll that can fail.

Combat and dungeons are designed on paper but have no code yet.

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
PostgreSQL          10 tables
```

- `server/services/` — one file per feature. None of them know about `req` or
  `res`; they throw errors carrying a status code, and `index.js` translates.
- `server/db/` — `schema.sql` and `seed.sql`. No migration tool.
- `client/src/screens/` — one file per screen, switched by `useState` rather
  than a router.

## 🔌 API

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | database reachable? |
| `GET` | `/api/templates` | static data — item names, icons, crops, recipes, upgrade costs. Fetched once |
| `GET` | `/api/player` | everything that changes — gold, stacks, gear, plots |
| `POST` | `/api/gear/:gearInstanceId/upgrade` | rolls for `+1`. The roll is server-side |
| `PUT` | `/api/gear/:gearInstanceId/equip` | idempotent, so `PUT` rather than `POST` |
| `POST` | `/api/plots/:plotNumber/plant` | body `{ cropTemplateId }` |
| `POST` | `/api/plots/:plotNumber/harvest` | returns produce, seeds and gold |
| `POST` | `/api/craft/:recipeId` | spends ingredients, returns the result |

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
- Combat, dungeons and the leaderboard are designed but not built.

## 🎯 Planned

- ⚔️ Real-time combat
- 🗡️ Three weapon specializations — Scythe, Crossbow, Watering Can
- 🏰 Dungeon tiers
- 🏆 Leaderboard
