# Combat rules test plan

Tests for `client/src/combat/rules.js`, the pure-JS combat rules module. The test
file is `client/src/combat/rules.test.js`; run it with `npm test` in `client/`.

## Who decided what

- **Seams were chosen by the author** on 2026-11-17: the initial layout
  (`createInitialState`, seam A), movement (`combatReducer` actions `tick`,
  `moveStart`, `moveStop`, seam B), aggro and chase (the monster side of
  `combatReducer`'s `tick`, seam C), monster attacks and defeat (seam D), the
  player's auto-attack, targets and kills (seam E), and skills, Rage and the GCD
  (seam F). The screen (`Dungeon.jsx`) is not a seam: it is a thin layer that
  dispatches actions and draws the state, and it was checked by hand in the browser.
- **Every case below was approved by the author** before it was written, in six
  rounds on 2026-11-17: A1–A5 and B1–B7, then the movement rule change (B1, B5–B7
  edits, B8–B10), then aggro (C1–C7), then monster attacks (D1–D6, plus edits to A1,
  A5 and B7), then the player's attacks (E1–E9, plus edits to A1, A5 and B7), then
  skills (F1–F10, plus edits to A5 and B7). No test is written outside the list. The
  extensions after approval are in E6, which gained two more armor values to pin the
  rounding rule, and in F5 and F9, which gained one more assertion each to close gaps
  the mutation check found.
- **The test code was written by Claude** from that list.
- **The rule changes were decided by the author**: a key press steps at once, the
  aggro rules, the attack rules, and the targeting rules below. Claude changed
  `rules.js` after the matching tests were red.

## What these tests are, and are not

- A1–A5 and B1–B7 are **characterization tests**: `rules.js` already existed, so
  they passed the first time they ran. They are not test-first development.
- B8–B10, C1–C7, D1–D6, E1–E9 and F1–F10 were **red before the implementation**,
  except C7, E4, E9, F2 and F9, which also passed before the implementation because
  nothing moved, hit, could be selected or could be cast yet, so "nothing overlaps",
  "nobody is hit without a target", "a defeated player cannot select", "a failed press
  does nothing" and "a defeated player cannot cast" held trivially. They earn their
  place through the mutation check below.
- Expected values are written by hand from the rules in
  [design-backlog.md](design-backlog.md) (nine tiles tall, 2 tiles per second,
  packs 10 tiles apart, aggro radius 5, auto-attack every 2 seconds, armor
  `armor / (armor + 1000)`), not computed with the constants from `rules.js`. A test
  that recomputes the answer the way the code does can never fail.
- The in-pack formation (`FORMATION`) is not in the backlog, only in `rules.js`.
  A2, A3 and C2 therefore check properties (no overlap, someone outside the radius)
  instead of exact positions, so they do not just copy the code.
- The monster templates in the test input use made-up damage values (10 and 20) and
  armor values (0, 250, 100, 300), so a test passes only if the code reads the
  template instead of hard-coding the seed.
- The player's damage numbers (40 per auto-attack every 2 seconds, 80 per Furious
  Thrust) and the 3-tick input window are provisional placeholders in the code. The tests pin the current values, so changing a balance number means
  updating the expected values on purpose.

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

## Monster attack rules (decided 2026-11-17)

- **Numbers come from the monster template** (`autoAttack`, `autoAttackSeconds`), set
  in the backlog's Tier-1 numbers: 10 / 20 / 20 / 10 every 2 seconds. Damage is fixed
  and the player has no armor yet.
- **The first swing lands the tick a monster reaches range 1**, then one swing every
  20 ticks per monster. Each monster has its own swing timer, so a pack does not hit
  in one burst.
- **The swing timer keeps running out of range.** A monster that just swung and
  catches up again still waits out its interval.
- **Player health is 1000** (provisional, from the backlog). It stops at 0, and the
  player is defeated. After that nothing moves, attacks or ticks, and the screen shows
  "Try again" with no penalty, as the backlog's Definition of Done says.
- Compared with WoW, from the Warcraft Wiki: auto-attacks run on an internal swing
  timer and stop when the target is out of range, then resume in range. Whether a mob's
  first swing is immediate or delayed was not found. No Fellowship source on enemy
  basic attacks was found; one beginner guide says death costs only time.

## Player attack and targeting rules (decided 2026-11-17)

- **Targeting is a choice**: the player clicks a monster to make it the primary target,
  and clicking it again clears it. Any monster can be selected at any distance; range
  only matters when swinging. The backlog's spec-note says "no target selected" is a
  real state and that targeting is not optional for the bleed-spreading build, which is
  why the nearest monster is not hit automatically.
- **Only the target is hit**, once its distance is within range 1 (diagonals included).
  The first swing lands the tick it is in range, then one swing every 20 ticks. The swing
  timer keeps running out of range, as it does for monsters.
- **Damage is 40 per hit** (attack power 10 × coefficient 4), reduced by the monster's
  armor with `armor / (armor + 1000)` and rounded to a whole number. All of these numbers
  are placeholders: the backlog fixes the formula but not the weapon speed or the
  auto-attack damage.
- **Within one tick, monsters hit first and the player swings last.** A monster about to
  die still lands its last hit, and a player killed that tick does not swing.
- **A monster at 0 health or below is removed.** If it was the target, the nearest
  monster that already has aggro becomes the new target (ties go to the lower id), and
  if none has aggro there is no target. Idle monsters are never picked, so killing one
  pack cannot wake another.
- The searches for WoW and Fellowship found nothing usable on target selection, so none
  of this is compared with them.

## Skill, Rage and GCD rules (decided 2026-11-17)

- **First slice: Furious Thrust only**, the single-target builder on key 1. The spender
  (Overhead Slam) and the area skills come in later slices, so Rage fills up to 5c and
  stays there for now.
- **Furious Thrust** needs the primary target inside range 1 (diagonals included), hits
  it for 80 before armor, and adds 1c of Rage. Skills cost no resource. Rage is stored in
  whole units (1c = 10, maximum 5c = 50), as the spec note says, so 0.5c never needs a
  float. Rage does not decay: the backlog has no rule for it yet.
- **The GCD is 1 second (10 ticks), fixed**, from the backlog. The auto-attack does not
  use it.
- **Input handling around the GCD:** a press when the GCD is over casts at once. A press
  in the last 3 ticks (0.3 s) of the GCD is remembered, the latest press wins, and it
  casts on the tick the GCD ends. An earlier press is dropped. WoW has the same idea in
  its spell queue window (0–400 ms, from a community guide); no Fellowship source on the
  GCD or input queue was found. Ticks are 0.1 s and the browser timer jitters, so without
  the window a slightly early press would be thrown away and a 1-second rotation would
  feel stiff.
- **A skill that cannot be used does nothing:** no damage, no Rage, no GCD. The same
  holds for a remembered skill that has become unusable when the GCD ends (no target, or
  out of range): it is dropped and the GCD is not spent.
- **Within one tick:** monsters hit, then a remembered skill fires, then the
  auto-attack swings. A player killed by the monsters that tick casts nothing.
- **The damage number is fitted to the backlog's anchor**: 80 per second from the skill
  plus 20 per second from the auto-attack is the base DPS of 100, which kills one
  1000-health rat in 10 seconds, matching the swarm phase in Tier-1 numbers. It is
  provisional until the spender and the area builder exist.

## Cases

### A. Initial layout — `createInitialState`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| A1 | One monster in pack 2 stands at x = 20, in the middle row, with its template hp and armor, not aggroed, carrying its template's attack damage and interval (in ticks) | Every later rule (aggro, damage) measures from where monsters stand and what they carry | Whether 10-tile spacing is a good design number |
| A2 | A pack of four fills four different tiles inside the corridor | Two monsters on one tile would hide one on screen and break hit checks | The exact formation shape |
| A3 | A second row in the same pack continues after the first row | Swarm and elite rows share a pack; restarting the slot count stacks them | Rows of different packs interleaved in the input |
| A4 | Packs 1 and 2 start at their own x; ids are unique | Ids tell two identical monsters apart; a pack must not inherit the previous pack's slot count | The real `/api/templates` response shape |
| A5 | The player starts at (0, 4) facing right, with 1000 of 1000 hp, not defeated, with no target, no Rage, no GCD running and nothing remembered | The first fight depends on the walking distance from the start and on the health pool | Anything about rendering |

### B. Movement — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| B1 | Holding a direction steps at once, then once every 5 ticks (x = 1, 2 after 5 ticks, 3 after 10, 5 after 20) | The pull timing in the backlog assumes 2 tiles per second | Whether 2 tiles per second feels right (marked provisional) |
| B2 | With no key held, only the tick counter moves | Idle time must pass without drifting | — |
| B3 | Corridor edges block the player, who still turns toward them | Walking out of the corridor would put the player in an invalid tile | — |
| B4 | A monster blocks the tile; the player turns and the step is not spent | The player must move the moment a blocker clears, and must not walk through monsters | — |
| B5 | The direction pressed last wins | Players change direction while holding keys | How the browser turns key events into actions (screen side) |
| B6 | Releasing the current direction stops; releasing another does not | Releasing an old key must not stop the player who still holds a newer one | Same as B5 |
| B7 | The reducer never modifies the state it receives, on the walking, blocked, pulling, chasing, attacking, dying, defeated, hunting, killing, queuing and queued-cast paths | React re-renders by comparing object identity; in-place edits leave the screen stale | Mutation inside objects the reducer never touches |
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
| C6 | A chasing monster stops within 1 tile of the player, diagonals included; a monster already diagonal stays put | Monsters must stop where they can hit, not push into the player | — |
| C7 | Chasing monsters never share a tile with each other or the player, including two monsters aiming at the same tile | Overlapping monsters would hide each other and break target counting | Monsters trapped behind others |

### D. Monster attacks and defeat — `combatReducer`, `tick`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| D1 | A monster hits the tick it reaches range, and not before (hp 1000 at tick 19, 990 at tick 20) | Pins "first swing on contact" and that range 1 is what counts | Whether an immediate first hit feels fair |
| D2 | After the first hit it hits every 20 ticks (990, 980 at tick 21, 970 at tick 41) | The backlog's damage budget assumes one hit per 2 seconds per monster | — |
| D3 | Each monster hits for its own damage (a 10 and a 20 together take 30) | Elites hit harder than swarm monsters | Damage reduction on the player, which does not exist yet |
| D4 | Arriving does not reset the swing timer: a monster that just swung waits out its interval | Without it, running away and back would dodge or refresh hits | — |
| D5 | Health stops at 0, the player is defeated, and exact or overkill damage both end at 0 | A negative health bar or a missed defeat would break the "try again" flow | What death costs (nothing, by design) |
| D6 | Once defeated, ticks, key presses and releases return the same state | Nothing may keep happening to a dead player | — |

### E. Player auto-attack, targets and kills — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| E1 | Selecting a monster targets it, selecting it again clears it, unknown ids are ignored, and distance does not matter | The spec has a "no target" state and the click must not break on stale ids | The click wiring on the screen |
| E2 | The target takes 40 on the first tick in range, then every 20 ticks (100 → 60 → 20 at tick 21) | The rotation will be built on top of this baseline damage | Whether 40 every 2 seconds is a good number |
| E3 | Only the target is hit, not the monster next to it | Auto-attack is single-target by design; splash would break the skills' purpose | — |
| E4 | With no target nobody is hit, even when a monster stands right there | Targeting must be a choice | — |
| E5 | A target is hit the tick it reaches range, not before, and the swing timer runs while it walks | Same timer rule as monsters, so running away cannot refresh a swing | — |
| E6 | Armor cuts the damage and the result is rounded: 0 → 40, 250 → 32, 100 → 36, 300 → 31 | Elites have armor, and fractions must not leak into health | Armor on the player's side |
| E7 | A monster at 0 health or below is removed (exactly 40, less than 40, and 41 survives) | Kills are how a fight ends | Rewards for a kill (not built) |
| E8 | When the target dies, the nearest monster with aggro becomes the target; ties go to the lower id; idle monsters are ignored; none means no target | A pack fight should not need a click per kill, and a kill must not wake the next pack | Choosing by facing or by threat |
| E9 | A defeated player cannot select targets, and a player killed this tick does not swing | Nothing may keep happening to a dead player | — |

### F. Skills, Rage and the GCD — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| F1 | Furious Thrust hits the target at once for 80 and adds 1c of Rage | Builders make the Rage that spenders will use, and the DPS anchor assumes one per GCD | Whether 80 is a good number |
| F2 | With no target, or a target out of range, nothing happens: no damage, no Rage, no GCD | A failed press must not cost the player a second of GCD | Feedback for the failed press (none yet) |
| F3 | During the GCD an early press (5 ticks before the end) does nothing; the cast works on the exact tick the GCD ends | The GCD paces the whole rotation | — |
| F4 | A press in the last 3 ticks is remembered and cast when the GCD ends; a press 4 ticks before the end is dropped; mashing the key casts once | Tick-sized timing and browser jitter would otherwise swallow slightly early presses | Whether 3 ticks (0.3 s) feels right |
| F5 | A remembered skill is dropped if it cannot be used when the GCD ends, the GCD is not spent, and the dropped press does not fire later | A stale press must not fire at a surprising moment | — |
| F6 | Armor cuts skill damage and the result is rounded: 0 → 80, 250 → 64, 100 → 73, 500 → 53 | Skills and auto-attacks share one armor rule | Bleeds, which ignore armor (not built) |
| F7 | Rage stops at 5c | The bar has five cells, and no spender exists yet | What spending does |
| F8 | A kill by skill removes the monster and moves the target on | Skills end fights too | — |
| F9 | A defeated player cannot use skills, and a remembered skill does not fire on the tick the player dies | Nothing may keep happening to a dead player | — |
| F10 | The auto-attack keeps swinging during the GCD | The spec says the auto-attack costs no button and no GCD | — |

## Movement rule change (2026-11-17)

The author changed the rule from "the first step comes on the next tick" to "a key
press steps at once". Step spacing stays at 5 ticks, so mashing a key cannot beat
2 tiles per second. B1, B5 and B6 were updated (their expected values moved; the
rules they check did not), B7 gained the press paths, and B8–B10 are new. Adding
fields to monsters and to the state changed A1's expected object and A5.

## Mutation check

Each rule in `rules.js` was broken on purpose, one at a time, and the suite was
re-run to confirm a test fails. All 93 breakages below were caught on the final code
(three of them are the rounding variants in one row, so the table has 91 rows), and
`rules.js` was restored afterwards.

Along the way, several breakages first appeared to survive. Some were mistakes in the
breaking script (a syntax error, or a pattern that did not apply), not real survivors.
Three were real, and each led to a stronger test: a second setup in C7 for two monsters
aiming at the same tile, rounding values in E6 (250 armor gives an exact 32, so rounding
was invisible), and a frozen state in B7 where the monster does not hit first (otherwise
the monster objects are already copies by the time the player's hit is applied). Four
more were checks that can never be false, and they were removed instead of tested: a
guard against a monster stepping onto the player's tile, an aggro check in the monster
attack step, a check for unknown skill ids in the reducer (the cast already refuses
them), and an explicit "clear the remembered skill" inside the cast, which the caller
already does. That last one had also been hiding a real gap, so F5 now checks that a
dropped press does not fire later.

| Breakage | Failed tests |
|----------|--------------|
| Pack spacing 10 → 9 | A1, A2, A4, B4, B10, C1, C3, C4, C5, C6, D1, E5 |
| Monster hp set to 0 | A1, A3 |
| Slot count restarts on every row | A3 |
| Slot count ignores the pack | A4, C2 |
| Player start x 0 → 1 | A5, B1, B2, B5, B6, B8, B9 |
| Step interval 5 → 4 ticks | B1, B9, C4, D1, E5 |
| Idle tick not counted | B1, B2, B5, B6, B9, C4, C5, D1, D2, D4, E2, E5, F3, F4, F5, F7, F10 |
| No corridor check | B3 |
| No monster check | B4, B10 |
| Blocked step is spent | B4, B10 |
| Blocked player does not turn | B3, B4, B10 |
| First key press wins | B5, B6 |
| Releasing any key stops | B6 |
| Key press does not step | B1, B5, B6, B8, B9, B10 |
| No step interval | B1, B5, B6, B9 |
| Reducer edits `state.tick` in place | B7, E5, F4 |
| Aggro radius 5 → 4 | C2, C3, C4, C5, C6, D1, E5 |
| Aggro radius 5 → 6 | C1, C3 |
| Distance measured as a sum instead of the larger difference | C3, C6, D3, E3 |
| Aggro per monster instead of per pack | C2 |
| Every pack is pulled | C2 |
| Pulling never sets aggro | C2, C3, C4, C5, C6, D1, E5 |
| Chase on every tick | C4, D1, E5 |
| Chase on every 4th tick | C4, D1, E5 |
| Leash 10 tiles from spawn | C4, C5, C6, D1, D4, E5 |
| Melee range 1 → 0 | C6, C7, D1, D2, D3, D5, D6, E2, E3, E5, E6, E7, E8, E9, F1, F3, F4, F5, F6, F7, F8, F9, F10 |
| Melee range 1 → 2 | C6, D1, E5 |
| Monsters ignore each other's tiles | C7 |
| Chase checks tiles against the list from before the beat | C7 |
| Chase edits a monster in place | B7 |
| Pull edits a monster in place | B7 |
| `aggro` missing from the initial state | A1, C1, C3 |
| Monster attack reach 1 → 2 | D1 |
| Monster attack reach 1 → 0 | D1, D2, D3, D4, D5, D6, E9, F9 |
| Monster first swing waits one interval | A1, D2, D3, D5, D6, E9 |
| Monster swing time compared with `>` instead of `>=` | D2, D4 |
| Monster swing time never advances after a hit | D2 |
| Monster swing interval 20 → 10 ticks | D2 |
| Every monster hits for 10 | D3 |
| Player health can go below 0 | D5 |
| Defeat only when health is below 0 | D5, D6, E9, F9 |
| Monster attack edits a monster in place | B7 |
| Player max health 1000 → 900 | A5, D1, D2, D3, D4 |
| Player attack reach 1 → 2 | E5 |
| Player attack ignores range | E5 |
| Player attack ignores the swing timer | E2, E5, F3, F4, F5, F7, F10 |
| Player swing time never advances | E2, F10 |
| Player swing interval 20 → 10 ticks | E2, F10 |
| Damage coefficient 4 → 3 | E2, E3, E5, E6, E7, F10 |
| Armor ignored | E6, F6 |
| Damage rounded down, rounded up, or not rounded (three variants) | E6, F6 |
| Armor constant 1000 → 500 | E6, F6 |
| Kill needs health below 0 | E7, F8 |
| Dead monster stays on the field | E7, E8, F8 |
| No automatic target after a kill | E8, F8 |
| Automatic target is the farthest, not the nearest | E8 |
| Automatic target tie goes to the higher id | E8 |
| Automatic target ignores aggro | E8 |
| Every monster takes the hit, not only the target | E3 |
| Auto-attack hits without a target | C6, C7, D2, D4, E4 |
| Selecting does not toggle | E1 |
| Selecting accepts unknown ids | E1 |
| Dead player still swings | E9 |
| Player swings before the monsters | E9, F9 |
| Player hit edits a monster in place | B7, F4, F10 |
| Selecting edits the state in place | B7, E1 |
| Target starts at monster 0 | A5, C6, C7, D2, D4, E1 |
| Monster armor not copied from the template | E6, F6 |
| No freeze after defeat | D6, E9, F9 |
| GCD 10 → 5 ticks | F3, F4, F5 |
| Queue window 3 → 2 ticks | F4 |
| Queue window 3 → 4 ticks | F4 |
| Every early press is remembered | F3, F4 |
| Press ignores the GCD | F3, F4, F5 |
| A press on the exact tick the GCD ends is refused | F1, F2, F3, F4, F5, F6, F8 |
| A press exactly 3 ticks before the end is dropped | F4 |
| Remembered skill fires one tick late | F4 |
| Remembered skill is never cleared | F4, F5 |
| A cast with no target spends the GCD | F2, F5 |
| An out-of-range cast spends the GCD | F2 |
| Rage gain 1c → 0.5c | F1, F5, F7 |
| Rage not capped | F7 |
| Rage cap 5c → 4c | F7 |
| Skill damage 80 → 70 | F1, F3, F4, F5, F6, F8, F10 |
| Remembered skill fires for a dead player | F9 |
| Remembered skill fires before the monsters hit | F9 |
| Remembering a skill edits the state in place | B7 |
| Rage starts at 1c | A5, F1, F5 |
| GCD starts running at tick 5 | A5, F1, F3, F4, F5, F6, F7, F8, F10 |
| A skill is remembered from the start | A5, E2, E3, E6, E7, F3, F4, F10 |
| Skill hits without a target | F2, F5 |

This shows the suite notices these breakages. It does not show that the rules are
complete.

## Checked by hand in the browser

Keyboard and timer wiring, the defeat screen, and the click-to-target screen have no
automated test. Checked by hand on 2026-11-17: walking, key release, window blur, Korean
input, console errors (author), monsters chasing and stopping beside the player, health
dropping by 20 every 2 seconds from two rats, health stopping at 0 with "You were
defeated" and "Try again", keys doing nothing afterwards, and "Try again" restoring full
health, the start position and a single timer. Then clicking a monster selects and
outlines it, clicking it again clears it, the target loses 40 every 2 seconds, and when a
rat dies after 25 hits the target moves to the other rat and the damage taken drops from
20 to 10 per 2 seconds. Then key 1: with no target it does nothing; with a target it hits
for 80, fills the first Rage cell and dims slot 1 for the GCD; a second press 0.5 s before
the GCD ends is dropped, and a press 0.2 s before it ends fires the moment the GCD ends
(measured 1.0 s after the first cast); the auto-attack keeps its own timer.

## Not covered yet

- Ranged monsters hold their ground while they can reach the player. Today they chase
  and hit like melee monsters, a temporary stand-in.
- The rest of the skill kit: Overhead Slam (spender), Brutal Swing (area builder, facing),
  Whirling Slash (channel and bleed), the two cooldowns, Sprint, and key rebinding. Rage
  has nothing to spend on yet.
- The elite and ranged mechanics (spin, pools, volley), and the out-of-combat health
  regeneration in the backlog.
- Run goals: clearing packs, the boss, rewards and the timer.
