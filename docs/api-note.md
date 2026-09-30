# API note

Every endpoint the server answers, in one format. The README carries a
one-line table for readers; this file is the working copy — request bodies,
response shapes and every rejection reason spelled out.

Read from `server/index.js` and `server/services/*.js` on 2026-09-14.
**If the two ever disagree, the code is right and this file is stale.**

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | is the database reachable |
| `GET` | `/api/templates` | balance-patch data, fetched once |
| `GET` | `/api/player` | everything that changes |
| `POST` | `/api/gear/:gearInstanceId/upgrade` | rolls for +1 |
| `PUT` | `/api/gear/:gearInstanceId/equip` | idempotent |
| `POST` | `/api/plots/:plotNumber/plant` | |
| `POST` | `/api/plots/:plotNumber/harvest` | |
| `POST` | `/api/craft/:recipeId` | |
| `POST` | `/api/dungeon/enter` | body `{ tier }`; closes a leftover run first |
| `POST` | `/api/dungeon/:runId/complete` | body `{ cleared }`; the client asserts it |

## Shared rules

- There is **no login yet**. `index.js` holds `PLAYER_ID = 1` and every
  request is that player's. `design-backlog.md` §4 defers Google OAuth.
- Errors come back as `{ reason }`, sometimes `{ reason, details }`. A 500 is
  always `{ reason: 'internal_error' }` with the cause logged server-side
  only — pg messages can carry table structure or connection details.
- Services throw errors carrying `.status`; `index.js` translates that into
  the HTTP code. No `.status` means a bug or a pg failure, so it becomes 500.
- A non-integer URL segment is answered with **the same 404 as a missing
  row**. Letting `'abc'` reach pg raises `22P02`, which would be reported as
  a 500 — a bad request, not a broken server.
- **409 is a rejection the code decided on; 500 is a failure nobody planned.**
- **Every field in a response is camelCase, never the snake_case the column
  is named.** The read services alias in SQL (`highest_tier_cleared AS
  "highestTierCleared"` — the double quotes are what keep the capitals);
  the write services destructure in JS instead. So a `jq` filter written
  from the column name comes back `null`, and `jq` will not tell you the
  key was missing rather than empty.

---

## Reads

### `GET /api/health`

```
body  none
200   { status: 'ok', now }
500   { status: 'error' }
```

> Answers only if Express and PostgreSQL are both up and the connection
> between them is open. The time comes from the database because it is the
> one value that cannot be faked by hardcoding.
>
> The only endpoint whose error shape is `{ status }` rather than `{ reason }`.

### `GET /api/templates`

```
body  none
200   { stacks, gear, upgrades, crops, recipes }
500   internal_error
```

> Same answer for everyone, so it takes no player id and is meant to be
> fetched once and cached.

### `GET /api/player`

```
body  none
200   { ...player, gear, equipped, stacks, plots }
404   player_not_found
500   internal_error
```

`player` spreads `gold` and `highestTierCleared` at the top level.
`equipped` is an object keyed by slot, not an array.

> The 404 cannot happen while `PLAYER_ID` is hardcoded, but returning
> `undefined` fields would be less honest. This is the one place that builds
> the error by hand instead of calling `serviceError`.

---

## Gear

### `POST /api/gear/:gearInstanceId/upgrade`

```
body  none
200   { upgraded,
        gear:   { gearInstanceId, upgradeLevel },
        stacks: [ { stackTemplateId, amount }, ... ] }
404   gear_not_found
409   already_max_level        details { upgradeLevel }
      insufficient_materials   details from spendStack
500   internal_error
```

> The roll is server-side, so the only thing the client can name is which
> item — and that fits in the URL, which is why the body is empty.
>
> **A failed roll is still 200 with `upgraded: false`.** "The roll missed" and
> "the request was refused" are different layers.
>
> POST rather than PATCH: two presses must spend twice, and PATCH would mean
> the client naming the result.

### `PUT /api/gear/:gearInstanceId/equip`

```
body  none
200   { slot, gearInstanceId }
404   gear_not_found
500   internal_error
```

> Idempotent, which is what PUT is for. The slot is not sent — the server
> reads it from `gear_template`, because which slot an item goes in belongs
> to the definition, not to the instance.

---

## Farm

### `POST /api/plots/:plotNumber/plant`

```
body  { cropTemplateId }
200   { plot:      { plotNumber, cropTemplateId, plantedAt, readyAt },
        seedStack: { stackTemplateId, amount } }
400   invalid_body
404   plot_not_found | crop_not_found
409   plot_occupied
      insufficient_materials   details from spendStack
500   internal_error
```

> Two things are the client's to name — which plot and which crop — so one
> rides in the URL and one in the body.
>
> `readyAt` is computed by the server and shipped back; letting the client
> add `plantedAt + growthSeconds` would put the growth rule in two places.
>
> A missing body leaves `req.body` undefined in express 5, so it is read with
> `?.` — a malformed request is 400, not 404.

### `POST /api/plots/:plotNumber/harvest`

```
body  none
200   { plot:   { plotNumber, cropTemplateId: null, plantedAt: null },
        stacks: [ ... ],
        gold,
        gained: { gold, crop, seeds } }
404   plot_not_found
409   plot_empty | not_ready
500   internal_error
```

> `stacks` and `gold` are balances; `gained` is what this harvest added. The
> client could subtract, but **the seed count is a die the server rolled** —
> the same place `upgraded` holds in the upgrade response.
>
> The empty plot is shaped like the plant response on purpose, so one client
> path handles both.

### `POST /api/craft/:recipeId`

```
body  none
200   { stacks: [ { ingredient }, { crafted } ] }
404   recipe_not_found
409   insufficient_materials   details from spendStack
500   internal_error
```

> The recipe decides what goes in and what comes out, so the recipe id is all
> the client has to say.

---

## Dungeon

The server knows a run's **start and end, nothing in between**. There is no
progress endpoint, so nothing here can tell you how far into a run a player is.

### `POST /api/dungeon/enter`

```
body  { tier }
200   { runId, tier, startTime, timeLimitSeconds }
400   invalid_body
404   player_not_found
409   tier_too_high            details { highestTierCleared }
500   internal_error
```

> Unlike every other write endpoint, nothing rides in the URL — at this point
> the run does not exist yet, so there is nothing to point at.
>
> **A leftover `ongoing` run is closed as `failed` in the same transaction**,
> with `end_time = LEAST(now(), start_time + time_limit)`. Each candidate lies
> in a different case: `now()` alone turns a run reopened three days later into
> a three-day run, and `start_time + time_limit` alone puts `end_time` in the
> future when the player comes back inside the limit. So a player is never
> blocked by their own abandoned run, and at most one `ongoing` row exists.
>
> **Resuming is deliberately not built.** Storing pack progress is cheap, but
> blocking the cheese that follows — close the browser at a bad pull, reopen at
> full health — needs health, cooldowns and positions too, which is the
> mid-run saving rejected on 2026-09-11.
>
> `timeLimitSeconds` is seconds, matching `growthSeconds` in `/api/templates`.
> A raw `INTERVAL` reaches the client as `{ minutes: 5 }` and makes it unpack
> an object. `TIME_SCALE` is **not** applied — the dungeon is fought in real
> time, so a five-minute limit compressed to thirty seconds is not a demo of
> anything.

### `POST /api/dungeon/:runId/complete`

```
body  { cleared }          boolean, and only true or false
200   { status, overtime, highestTierCleared }
400   invalid_body
404   run_not_found
409   run_already_ended       details { status }
500   internal_error
```

> **The client asserts the clear; the server never sees the fight.** Cheating
> the leaderboard is a known limitation, accepted on 2026-08-24 — this is a
> portfolio game, not a live one, and the note belongs in the README rather
> than in a validation layer that cannot work.
>
> `cleared` is rejected unless it is exactly `true` or `false`. The string
> `"false"` is truthy in JavaScript, so without that check a failed run would
> be recorded as a clear and could raise the player's best tier.
>
> **`overtime` is computed in SQL, never stored** — `now() > start_time +
> time_limit`, compared against the run's own tier. Storing it would mean
> keeping two answers to one question in sync by hand.
>
> **Overtime still counts as `cleared` but does not raise
> `highestTierCleared`.** The two live on separate lines for that reason. If an
> overtime clear moved the bar, a player could climb to tier 10 without ever
> beating the timer, and the limit would only shave rewards instead of gating
> progress — the same split WoW makes by handing back a lower keystone.
>
> `highestTierCleared` comes back `null` when nothing moved, and the new value
> otherwise. `GREATEST` in SQL keeps a lower tier from lowering the record,
> and keeps read-compare-write from becoming three steps with a gap in them.

**Rewards are not here yet.** Gold and crests per tier are unsettled
(`design-backlog.md` §2, *Drop details*), so completing a run changes status
and the best tier and nothing else.

---

## Not built

- Reading monster data. `monster_template` and `monster_pack` are seeded
  with provisional tier-1 values, but no endpoint serves them yet.
- The remaining dungeon tables — `dungeon_drop`, and whatever the boss
  needs. Drop rules are still open.
- Rewards on the completion response.
- Accounts and login (`design-backlog.md` §4).
