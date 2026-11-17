# Combat rules test plan

Tests for `client/src/combat/rules.js`, the pure-JS combat rules module. The test
file is `client/src/combat/rules.test.js`; run it with `npm test` in `client/`.

## Who decided what

- **Seams were chosen by the author** on 2026-11-17: the initial layout
  (`createInitialState`, seam A) and movement (`combatReducer` actions `tick`,
  `moveStart`, `moveStop`, seam B). The screen (`Dungeon.jsx`) was left out on
  purpose: it does not dispatch anything yet, so there is nothing to test there.
- **The case list below was approved by the author** on 2026-11-17, all 12 cases.
  No test is written outside this list.
- **The test code was written by Claude** from that list. The production code in
  `rules.js` was not changed for the tests.

## What these tests are, and are not

- They are **characterization tests**: `rules.js` already existed, so every test
  passed the first time it ran. This is not test-first development, and nothing
  here should be described as TDD.
- Expected values are written by hand from the rules in
  [design-backlog.md](design-backlog.md) (nine tiles tall, 2 tiles per second,
  packs 10 tiles apart), not computed with the constants from `rules.js`. A test
  that recomputes the answer the way the code does can never fail.
- The in-pack formation (`FORMATION`) is not in the backlog, only in `rules.js`.
  A2 and A3 therefore check properties (no overlap, inside the corridor) instead
  of exact positions, so they do not just copy the code.

## Cases

### A. Initial layout — `createInitialState`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| A1 | One monster in pack 2 stands at x = 20, in the middle row, with its template hp | Every later rule (aggro, damage) measures from where monsters stand and how much hp they have | Whether 10-tile spacing is a good design number |
| A2 | A pack of four fills four different tiles inside the corridor | Two monsters on one tile would hide one on screen and break hit checks | The exact formation shape |
| A3 | A second row in the same pack continues after the first row | Swarm and elite rows share a pack; restarting the slot count stacks them | Rows of different packs interleaved in the input |
| A4 | Packs 1 and 2 start at their own x; ids are unique | Ids tell two identical monsters apart; a pack must not inherit the previous pack's slot count | The real `/api/templates` response shape |
| A5 | The player starts at (0, 4) facing right | The first fight depends on the walking distance from the start | Anything about rendering |

### B. Movement — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| B1 | Holding a direction gives 2 tiles per second (x = 2 after 10 ticks, 4 after 20) | The pull timing in the backlog assumes this speed | Whether 2 tiles per second feels right (marked provisional) |
| B2 | With no key held, only the tick counter moves | Idle time must pass without drifting | — |
| B3 | Corridor edges block the player, who still turns toward them | Walking out of the corridor would put the player in an invalid tile | — |
| B4 | A monster blocks the tile; the player turns and the step is not spent | The player must move the moment a blocker clears, and must not walk through monsters | Monsters moving (not implemented yet) |
| B5 | The direction pressed last wins | Players change direction while holding keys | How the browser turns key events into actions (screen side) |
| B6 | Releasing the current direction stops; releasing another does not | Releasing an old key must not stop the player who still holds a newer one | Same as B5 |
| B7 | The reducer never modifies the state it receives | React re-renders by comparing object identity; in-place edits leave the screen stale | Mutation inside objects the reducer never touches |

## Mutation check

Each rule in `rules.js` was broken on purpose, one at a time, and the suite was
re-run to confirm a test fails. All 14 breakages were caught, and `rules.js` was
restored afterwards.

| Breakage | Failed tests |
|----------|--------------|
| Pack spacing 10 → 9 | A1, A2, A4, B4 |
| Monster hp set to 0 | A1, A3 |
| Monster row set to 0 | A1, A2, A4, B4 |
| Slot count restarts on every row | A3 |
| Slot count ignores the pack | A4 |
| Player start x 0 → 1 | A5, B1, B2, B5, B6 |
| Step interval 5 → 4 ticks | B1 |
| Idle tick not counted | B1, B2 |
| No corridor check | B3 |
| No monster check | B4 |
| Blocked step is spent | B4 |
| First key press wins | B5, B6 |
| Releasing any key stops | B6 |
| Reducer edits `state.tick` in place | B7 |

This shows the suite notices these breakages. It does not show that the rules are
complete.

## Not covered yet

- Keyboard and timer wiring in `Dungeon.jsx` (not built).
- Aggro, auto-attack and damage (not built). These are the first places where a
  real red-then-green cycle can be done.
