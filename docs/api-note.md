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
| — | **dungeon: enter / complete** | designed, not built |

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

`player` spreads `gold` and `highest_tier_cleared` at the top level.
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

**Designed 2026-09-14, not built yet.** The table below is deliberately blank.

```
___1  ___2
body  ___3
200   ___4
___5  ___6
note  ___7
```

```
___8  ___9
body  ___10
200   ___11
___12 ___13
note  ___14
```

### Blanks to fill

| Blank | What it decides |
|:--:|---|
| `___1` `___8` | method for each — both change state |
| `___2` `___9` | path. The four verb-shaped paths above set the pattern |
| `___3` `___10` | what the client is allowed to name |
| `___4` `___11` | what comes back. The rule the others follow: **ship what changed**, so the client need not refetch |
| `___5` `___12` | the rejection codes. Candidates discussed: tier out of reach, a run that already ended, a run id that does not exist, a malformed body |
| `___6` `___13` | the reason strings for those |
| `___7` `___14` | the why. Two are worth writing down — the server never sees the fight, and overtime is derived rather than stored |

### What is already settled

From `design-backlog.md` §1 and the 2026-09-14 session:

- The server knows a run's **start and end, nothing in between**.
- Entry is gated on `highest_tier_cleared + 2`.
- A leftover `ongoing` run is closed as `failed` when the next run starts,
  with `end_time = LEAST(now(), start_time + time_limit)`.
- **Resuming a run is not built** — blocking the cheese would rebuild the
  mid-run saving that was rejected on 2026-09-11.
- Overtime clears still count as `cleared`, but **do not raise**
  `highest_tier_cleared`.
- Rewards wait on tier numbers, so the endpoints land without them.

---

## Not built

- The remaining dungeon tables — `monster_template`, `dungeon_drop`, and
  whatever the boss needs.
- Accounts and login (`design-backlog.md` §4).
