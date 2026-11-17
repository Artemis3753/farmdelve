# Combat rules test plan

Tests for `client/src/combat/rules.js`, the pure-JS combat rules module. The test
file is `client/src/combat/rules.test.js`; run it with `npm test` in `client/`.

## Who decided what

- **Seams were chosen by the author** on 2026-11-17: the initial layout
  (`createInitialState`, seam A), movement (`combatReducer` actions `tick`,
  `moveStart`, `moveStop`, seam B), and aggro and chase (the monster side of
  `combatReducer`'s `tick`, seam C). The screen (`Dungeon.jsx`) is not a seam: it is
  a thin layer that dispatches actions, and it was checked by hand in the browser.
- **Every case below was approved by the author** before it was written, in three
  rounds on 2026-11-17: A1–A5 and B1–B7, then the movement rule change (B1, B5–B7
  edits, B8–B10), then aggro (C1–C7). No test is written outside the list.
- **The test code was written by Claude** from that list.
- **The rule changes were decided by the author**: a key press steps at once, and
  the aggro rules under "Aggro and chase rules". Claude changed `rules.js` after the
  matching tests were red.

## What these tests are, and are not

- A1–A5 and B1–B7 are **characterization tests**: `rules.js` already existed, so
  they passed the first time they ran. They are not test-first development.
- B8–B10 and C1–C7 were **red before the implementation**, except C7, which also
  passed before the implementation because nothing moved yet and so nothing could
  overlap. C7 earns its place through the mutation check below, and one extra setup
  was added to it after a mutation survived.
- Expected values are written by hand from the rules in
  [design-backlog.md](design-backlog.md) (nine tiles tall, 2 tiles per second,
  packs 10 tiles apart, aggro radius 5), not computed with the constants from
  `rules.js`. A test that recomputes the answer the way the code does can never fail.
- The in-pack formation (`FORMATION`) is not in the backlog, only in `rules.js`.
  A2, A3 and C2 therefore check properties (no overlap, someone outside the radius)
  instead of exact positions, so they do not just copy the code.

## Aggro and chase rules (decided 2026-11-17)

- **Pack-wide aggro**: one monster inside the radius pulls its whole pack. The dungeon
  places packs and the player pulls them, and the backlog's five-target arithmetic
  assumes a pack arrives together.
- **Radius 5, measured as a square** (the larger of the horizontal and vertical
  differences), the same ruler the backlog uses for "range N".
- **Chase at the player's speed**: one tile per 5 ticks, all chasing monsters on the
  same beat (tick divisible by 5). This adds no new balance number.
- **No leash**: once pulled, a monster follows to the end. A distance-from-player leash
  would almost never fire at equal speed, and a distance-from-spawn leash would forbid
  three-pack pulls unless it is 15 tiles or more, which the backlog treats as a
  costly option, not an impossible one.
- **Melee range 1**: a chasing monster stops when it is within one tile of the player,
  diagonals included.
- Compared with WoW and Fellowship, from community sources, not official documents:
  WoW's social aggro pulls only some mob types together, and instance trash generally
  does not leash; Fellowship pulls are described as aggroing a whole pack with area
  skills. No Fellowship source on leashing was found.

## Cases

### A. Initial layout — `createInitialState`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| A1 | One monster in pack 2 stands at x = 20, in the middle row, with its template hp, not aggroed | Every later rule (aggro, damage) measures from where monsters stand and how much hp they have | Whether 10-tile spacing is a good design number |
| A2 | A pack of four fills four different tiles inside the corridor | Two monsters on one tile would hide one on screen and break hit checks | The exact formation shape |
| A3 | A second row in the same pack continues after the first row | Swarm and elite rows share a pack; restarting the slot count stacks them | Rows of different packs interleaved in the input |
| A4 | Packs 1 and 2 start at their own x; ids are unique | Ids tell two identical monsters apart; a pack must not inherit the previous pack's slot count | The real `/api/templates` response shape |
| A5 | The player starts at (0, 4) facing right | The first fight depends on the walking distance from the start | Anything about rendering |

### B. Movement — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| B1 | Holding a direction steps at once, then once every 5 ticks (x = 1, 2 after 5 ticks, 3 after 10, 5 after 20) | The pull timing in the backlog assumes 2 tiles per second | Whether 2 tiles per second feels right (marked provisional) |
| B2 | With no key held, only the tick counter moves | Idle time must pass without drifting | — |
| B3 | Corridor edges block the player, who still turns toward them | Walking out of the corridor would put the player in an invalid tile | — |
| B4 | A monster blocks the tile; the player turns and the step is not spent | The player must move the moment a blocker clears, and must not walk through monsters | — |
| B5 | The direction pressed last wins | Players change direction while holding keys | How the browser turns key events into actions (screen side) |
| B6 | Releasing the current direction stops; releasing another does not | Releasing an old key must not stop the player who still holds a newer one | Same as B5 |
| B7 | The reducer never modifies the state it receives, on the walking, blocked, pulling and chasing paths | React re-renders by comparing object identity; in-place edits leave the screen stale | Mutation inside objects the reducer never touches |
| B8 | Pressing a direction steps at once, even if released before any tick | A quick tap used to do nothing, which felt unresponsive | Whether a tap should instead turn in place |
| B9 | Taps cannot beat the step interval: a tap 4 ticks later does nothing, one 5 ticks later steps | Without it, mashing the key would move faster than 2 tiles per second | — |
| B10 | Pressing toward a monster turns the player and does not spend the step | The immediate step must not walk through monsters or burn the interval | Walls (B3 covers them on the tick path) |

### C. Aggro and chase — `combatReducer`, `tick`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| C1 | A pack stays idle while the player is more than 5 tiles away | Otherwise monsters would attack from across the corridor | — |
| C2 | One monster inside the radius pulls its whole pack, and only its pack | Pulls are packs; chain pulling depends on the next pack staying asleep | — |
| C3 | Distance 5 is in, 6 is out, and the diagonal (5, 4) is in | Pins the square-radius rule, which a circle would break | — |
| C4 | An aggroed monster closes in one tile every 5 ticks | Chase speed equals player speed by design | The half-second delay before the first step |
| C5 | A monster keeps following more than 15 tiles from its spawn | Pins "no leash", the decision that keeps multi-pack pulls possible | Monsters that cannot reach the player |
| C6 | A chasing monster stops within 1 tile of the player, diagonals included; a monster already diagonal stays put | Monsters must stop where they can hit, not push into the player | Attacking (not built) |
| C7 | Chasing monsters never share a tile with each other or the player, including two monsters aiming at the same tile | Overlapping monsters would hide each other and break target counting | Monsters trapped behind others |

## Movement rule change (2026-11-17)

The author changed the rule from "the first step comes on the next tick" to "a key
press steps at once". Step spacing stays at 5 ticks, so mashing a key cannot beat
2 tiles per second. B1, B5 and B6 were updated (their expected values moved; the
rules they check did not), B7 gained the press paths, and B8–B10 are new. Adding
the `aggro` field to monsters also changed A1's expected object.

## Mutation check

Each rule in `rules.js` was broken on purpose, one at a time, and the suite was
re-run to confirm a test fails. All 32 breakages below were caught, and `rules.js`
was restored afterwards. Two breakages first appeared to survive: one was a mistake in
the breaking script (a syntax error), the other was real, and the second setup in C7
was added to catch it. A guard against the monster stepping onto the player's tile was
removed as dead code, since monsters stop at distance 1 and cannot reach that tile.

| Breakage | Failed tests |
|----------|--------------|
| Pack spacing 10 → 9 | A1, A2, A4, B4, B10, C1, C3, C4, C5, C6 |
| Monster hp set to 0 | A1, A3 |
| Slot count restarts on every row | A3 |
| Slot count ignores the pack | A4, C2 |
| Player start x 0 → 1 | A5, B1, B2, B5, B6, B8, B9 |
| Step interval 5 → 4 ticks | B1, B9, C4 |
| Idle tick not counted | B1, B2, B5, B6, B9, C4, C5 |
| No corridor check | B3 |
| No monster check | B4, B10 |
| Blocked step is spent | B4, B10 |
| Blocked player does not turn | B3, B4, B10 |
| First key press wins | B5, B6 |
| Releasing any key stops | B6 |
| Key press does not step | B1, B5, B6, B8, B9, B10 |
| No step interval | B1, B5, B6, B9 |
| Reducer edits `state.tick` in place | B7 |
| Aggro radius 5 → 4 | C2, C3, C4, C5, C6 |
| Aggro radius 5 → 6 | C1, C3 |
| Distance measured as a sum instead of the larger difference | C3, C6 |
| Aggro per monster instead of per pack | C2 |
| Every pack is pulled | C2 |
| Pulling never sets aggro | C2, C3, C4, C5, C6 |
| Chase on every tick | C4 |
| Chase on every 4th tick | C4 |
| Leash 10 tiles from spawn | C4, C5, C6 |
| Melee range 1 → 0 | C6, C7 |
| Melee range 1 → 2 | C6 |
| Monsters ignore each other's tiles | C7 |
| Chase checks tiles against the list from before the beat | C7 |
| Chase edits a monster in place | B7 |
| Pull edits a monster in place | B7 |
| `aggro` missing from the initial state | A1, C1, C3 |

This shows the suite notices these breakages. It does not show that the rules are
complete.

## Not covered yet

- Ranged monsters hold their ground while they can reach the player. Today they chase
  like melee monsters, a temporary stand-in.
- Auto-attack, damage and skills (not built).
- Keyboard and timer wiring in `Dungeon.jsx` has no automated test. It was checked by
  hand in the browser (walking, key release, window blur, Korean input, console).
