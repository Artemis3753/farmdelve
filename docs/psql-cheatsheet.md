# psql Cheatsheet

Commands that have actually come up while building FarmDelve, kept here so they
do not have to be rediscovered. Ordered by how often they get reached for.

The database is `farmdelve` on a local PostgreSQL 17 instance. The connection
string lives in `server/.env` as `DATABASE_URL` and is deliberately given no
fallback — connecting to the wrong database silently is worse than failing
immediately.

---

## Connecting

```bash
psql farmdelve                 # local database by name
psql "$DATABASE_URL"           # the exact string the server uses
```

The second form matters when something works in psql but not in the app: it
proves both are talking to the same database.

Inside psql:

| Command | What it does |
|---|---|
| `\q` | quit |
| `\?` | list backslash commands |
| `\h CREATE TABLE` | SQL syntax help for one statement |
| `\l` | list databases |
| `\x` | toggle expanded output — wide rows print as one field per line |
| `\timing` | toggle query timing |

---

## Rebuilding the database

```bash
cd server && npm run db:reset
```

Behind that script:

```bash
set -a && . ./.env && set +a \
  && psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/schema.sql \
  && psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed.sql
```

Three parts worth knowing:

- `set -a` marks every variable that follows for export, so sourcing `.env`
  puts `DATABASE_URL` into the environment; `set +a` turns that back off.
- `-v ON_ERROR_STOP=1` makes psql **stop at the first error**. Without it psql
  keeps running the rest of the file and the failure scrolls away.
- `&&` chains them, so seed data never loads onto a schema that failed.

`schema.sql` drops every table before creating it, so this is destructive by
design. That is only acceptable because there is no real data yet.

---

## Inspecting the schema

| Command | What it shows |
|---|---|
| `\dt` | list all tables |
| `\d crop_template` | one table: columns, types, defaults, constraints, indexes |
| `\d+ crop_template` | same plus storage and comments |
| `\di` | list indexes |
| `\dn` | list schemas |

`\d <table>` is the one to reach for after editing `schema.sql` — it prints
the table as the database actually understands it, which is the only version
that counts.

---

## Time, intervals, and growth

Crop growth is stored as a `planted_at` timestamp plus a `growth_time`
interval, and whether something is grown is **computed on read, never stored**.
These are the queries that settled how that works.

```sql
SELECT NOW();                             -- transaction start time
SELECT NOW(), clock_timestamp();          -- the two differ; see below
SHOW timezone;                            -- session timezone
SELECT NOW() AT TIME ZONE 'UTC';          -- what timestamptz stores underneath
```

`NOW()` returns the time the **transaction** started and does not move inside
it. `clock_timestamp()` is the real wall clock. Proving it needs an explicit
transaction, because psql otherwise commits after every statement:

```sql
BEGIN;
SELECT NOW(), clock_timestamp();
SELECT pg_sleep(3);
SELECT NOW(), clock_timestamp();          -- NOW() unchanged, clock moved
COMMIT;
```

That fixed `NOW()` is a feature here: harvesting several plots in one
transaction judges them all against the same instant.

Interval arithmetic, checked before choosing `INTERVAL` over an integer
seconds column:

```sql
SELECT INTERVAL '1 hour' / 4;             -- 00:15:00 — division works
SELECT INTERVAL '5 minutes' > INTERVAL '0 seconds';   -- t — comparison works
SELECT NOW() + INTERVAL '5 minutes' / 4 <= NOW();     -- the real shape
```

Division mattering is not academic: `TIME_SCALE` speeds growth up for demos by
dividing `growth_time`, and comparison is what makes
`CHECK (growth_time > INTERVAL '0 seconds')` legal.

Types shift twice in that last expression:

```
INTERVAL / number      -> INTERVAL
TIMESTAMPTZ + INTERVAL -> TIMESTAMPTZ
TIMESTAMPTZ <= TIMESTAMPTZ -> BOOLEAN
```

---

## Transactions

```sql
BEGIN;
-- ...
COMMIT;     -- or ROLLBACK;
```

psql runs in autocommit, so every statement is its own transaction unless
`BEGIN` says otherwise. Anything testing locking or `NOW()` stability needs the
explicit form.

---

## Breaking things on purpose

Reading code proves less than watching it fail. These are **planned, not yet
run** — written on 2026-08-31 along with the setup each one needs, because two
of the three do nothing at all if attempted directly, and an experiment that
produces no failure teaches the opposite of what it should.

**Row locking.** Deleting `FOR UPDATE` and re-running proves nothing — local
queries finish too fast to overlap. Add a delay between the `SELECT` and the
`UPDATE` in `spendStack`, then fire two requests at once:

```bash
curl -X POST localhost:3001/api/gear/1/upgrade &
curl -X POST localhost:3001/api/gear/1/upgrade &
```

**A CHECK violation.** `player_stack` forbids zero rows via
`CHECK (amount > 0)`, so spending a stack down to exactly nothing has to
`DELETE` rather than `UPDATE`. Reaching that branch means first arranging for
held to equal needed:

```sql
UPDATE player_stack SET amount = 1 WHERE stack_template_id = 1;
```

Then upgrading raises SQLSTATE `23514`.

**Failure must commit.** A failed upgrade still spends materials, so rolling
back on failure hands out free attempts. Swapping the commit for a rollback
makes that visible immediately, no setup required.

---

## Quick lookups while building

```sql
SELECT * FROM stack_template;                 -- item ids, needed for seed data
SELECT * FROM player_stack WHERE player_id = 1;
SELECT * FROM upgrade ORDER BY upgrade_level; -- cost table
```

Column names cross into the API as camelCase via `AS` aliases with double
quotes, which is worth remembering when a query works in psql but the server
returns `undefined`:

```sql
SELECT stack_template_id AS "stackTemplateId" FROM stack_template;
```

Without the quotes PostgreSQL folds the alias to lowercase and the camelCase
is lost.
