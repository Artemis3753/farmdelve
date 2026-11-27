# Combat rules test plan

Tests for `client/src/combat/rules.js`, the pure-JS combat rules module. The test
file is `client/src/combat/rules.test.js`; run it with `npm test` in `client/`.

## Who decided what

- **Seams were chosen by the author** on 2026-11-17: the initial layout
  (`createInitialState`, seam A), movement (`combatReducer` actions `tick`,
  `moveStart`, `moveStop`, seam B), aggro and chase (the monster side of
  `combatReducer`'s `tick`, seam C), monster attacks and defeat (seam D), the
  player's auto-attack, targets and kills (seam E), skills, Rage and the GCD
  (seam F), and the Whirling Slash channel (seam G, split from F because it adds a
  timed state, `channel`), and the Whirling Slash bleed (seam H, a second timed state,
  `bleed` on each monster), the dungeon clear (seam J, 2026-11-27), out-of-combat regen (seam K, 2026-11-27), and the two cooldowns, Market Price Rage and Tilling (seam L, 2026-11-27). The screen (`Dungeon.jsx`) is not a seam: it is a thin
  layer that dispatches actions and draws the state, and it was checked by hand in
  the browser.
- **Every case below except H13–H15 was approved by the author** before it was written, in ten
  rounds (nine on 2026-11-17, one on 2026-11-18): A1–A5 and B1–B7, then the movement rule change (B1, B5–B7
  edits, B8–B10), then aggro (C1–C7), then monster attacks (D1–D6, plus edits to A1,
  A5 and B7), then the player's attacks (E1–E9, plus edits to A1, A5 and B7), then
  skills (F1–F10, plus edits to A5 and B7), then Overhead Slam (F11–F18), then Brutal
  Swing (F19–F26), then the Whirling Slash channel (G1–G12, plus an edit to A5 for the
  new `channel` field), then the Whirling Slash bleed (H1–H12, plus edits to A1 for the new
  `bleed` field and to B7 for the new code paths). **H13–H15 were added by Claude after
  the mutation check found gaps in the order inside one tick and in the dead-player rule; the author has
  not reviewed them yet.** The other extensions after approval are in E6, which gained two
  more armor values to pin the rounding rule, in F5, F9, F26, G8 and G12, which gained one
  or two more assertions each to close gaps the mutation check found, and in H6 and H10,
  which gained a distance-2 case and an exact-zero-health case for the same reason.
  G8, G9 and G12 also had their expected hit points lowered (by the 50 of the bleed
  tick the new rule adds), because they cast Whirling Slash on a target in range.
- **J1–J5 were approved by the author** on 2026-11-27, together with the clear rules
  below.
- **K1–K5 were approved by the author** on 2026-11-27, together with the regen rules
  below. Adding regen broke one assertion in G6 ("no heal if no tick connected"), which
  used an empty corridor: with no monster at all the player is out of combat and regen
  stepped in. Claude moved it to a corridor with one aggroed monster 25 tiles away, so
  the player stays in combat and the assertion checks the channel alone again. The
  author has not reviewed that edit yet.
- **L1–L10 were approved by the author** on 2026-11-27, together with the cooldown rules
  below. Claude also added the two new state fields to A5 and the cooldown paths (and a
  state with both effects on) to B7, as earlier slices did, and gave L7 one more
  assertion, "an expired rift no longer counts", after the mutation check found that gap.
  The author has not reviewed those three edits yet.
- **The test code was written by Claude** from that list.
- **The rule changes were decided by the author**: a key press steps at once, the
  aggro rules, the attack rules, and the targeting rules below. Claude changed
  `rules.js` after the matching tests were red.

## What these tests are, and are not

- A1–A5 and B1–B7 are **characterization tests**: `rules.js` already existed, so
  they passed the first time they ran. They are not test-first development.
- B8–B10, C1–C7, D1–D6, E1–E9, F1–F26 and G1–G12 were **red before the implementation**,
  except C7, E4, E9, F2, F9, F13, F14 and G11, which also passed before the implementation
  because nothing moved, hit, could be selected or could be cast yet (an unknown skill
  is ignored), so "nothing overlaps", "nobody is hit without a target", "a defeated
  player cannot select", "a failed press does nothing", "a defeated player cannot cast",
  "a spender with under 1c does nothing", "a slam with no target or out of range does
  nothing" and "a player killed on a channel tick does not spin" held trivially. They earn their place through the mutation check below.
  F19, F21 and F24 were first red for the wrong reason: a crash in the test's own setup
  (a pack holds at most four monsters, and these cases need five or six). After the
  setup was fixed, "the skill does not exist" was checked as a breakage, and all of
  F19–F26 fail on it, so they do depend on the feature.
- H1–H10 and H12 were **red before the implementation**. H11 was not (nothing ticked a
  bleed yet, so "the channel comes first" held trivially). H13–H15 were written after the
  implementation, so they were never seen red; each is shown to depend on its rule by a
  breakage in the table below (H13 on a bleed ticking after the remembered skill, H14 on
  after the auto-attack, H15 on a defeated player still bleeding the monster).
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
- **Player health is 2000** (provisional; the backlog said 1000, raised on 2026-11-27 after the
  first hand-played 22-monster run died). It stops at 0, and the
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

- **Four skills so far:** Furious Thrust, the single-target builder on key 1, Brutal
  Swing, the area builder on key 2, Overhead Slam, the single-target spender on key 3,
  and Whirling Slash, the channeled area spender on key 4, which also puts a bleed on the
  primary target (see below).
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
  out of range): it is dropped and the GCD is not spent. Brutal Swing is the one
  exception: it has no unusable state (see below).
- **Within one tick:** monsters hit, then a remembered skill fires, then the
  auto-attack swings. A player killed by the monsters that tick casts nothing.
- **The Furious Thrust number is fitted to the backlog's anchor**: 80 per second from the
  skill plus 20 per second from the auto-attack is the base DPS of 100, which kills one
  1000-health rat in 10 seconds, matching the swarm phase in Tier-1 numbers. It is
  provisional until the area builder exists.
- **Overhead Slam** (decided 2026-11-17) needs the same things as Furious Thrust: a
  target inside range 1, a free GCD or the 3-tick window. It spends **all the whole
  points** held and needs at least 1c. Holding 2.5c spends 2c and keeps 0.5c. Damage
  before armor is `200 × n^0.6` for `n` points spent, rounded: 200, 303, 387, 459, 525
  for 1c to 5c. A remembered Slam reads the Rage held when it fires, not when the key
  was pressed. With under 1c, no target, or a target out of range, nothing happens
  (no damage, no Rage spent, no GCD).
- **Why the curve bends**: a cycle of `n` Furious Thrusts and one Slam takes `n + 1`
  GCDs, so damage per GCD is `(80n + slam(n)) / (n + 1)`. With this curve that is 140,
  154, 157, 156, 154 for 1c to 5c: the best use is around 3c, and holding for 5c is
  slightly worse. A straight line (WoW's Eviscerate shape, where 5c is the most
  efficient and 4c is only for avoiding overcap) would make 5c always right, which the
  spec forbids. The bend is a design choice with no WoW or Fellowship source behind it.
  The numbers are provisional, and the tier 3a and 5a talents that reward 5c may tilt
  the choice back toward 5c.
- **Effect on the anchor**: pressing only Furious Thrust is still 100 DPS. A 3c cycle
  gives about 157 per GCD plus 20 from the auto-attack, about 177 DPS.
- **Brutal Swing** (decided 2026-11-17) hits every enemy in the six tiles three wide and
  two rows ahead of the player, in the direction the player faces, up to 5 enemies. Each
  enemy hit takes 40 before armor and adds 0.5c (5 units) of Rage. 40 is half of Furious
  Thrust, the backlog's "AoE efficiency 0.5": two enemies equal one Furious Thrust in both
  damage and Rage. It needs no target and no range check, since the area is the range.
  **It is the one skill that always fires:** with nobody in the area it hits no one, makes
  no Rage and still spends the GCD (the author's choice, so that facing matters). When
  more than five stand in the area, the selected target comes first if it is in the area,
  then the nearest to the player, and equal distances go to the lower id. Enemies killed by
  the swing count for Rage, and the target moves on only if the target itself died.
  Pressing a direction key toward a blocked tile turns the player in place (B4, B10),
  which is how the player aims at monsters standing right next to them.
- **Whirling Slash** (decided 2026-11-17, numbers provisional) spends every whole point
  held and needs at least 1c. It needs no target and no range check, and it starts even
  with nobody in range. It channels for 0.7 s per point (7 ticks) and ticks every 0.7 s,
  so `n` points are exactly `n` ticks. Each tick hits every enemy within range 1,
  diagonals included, with no cap, for 90 before armor (40 until 2026-11-27), and the range is checked again on
  every tick: walking out of range wastes the tick, walking back resumes it. The player may
  walk during the channel and the auto-attack keeps swinging. The channel cannot be
  interrupted. When it ends, if at least one tick connected, the player heals 20 (never
  past full health). The channel holds the GCD until it ends (1c, 0.7 s, still holds the
  normal 1 s GCD), so no other skill can start in the meantime, and a press in the last 3
  ticks is remembered and fires after the final tick. Within one tick the order is:
  monsters hit, the channel ticks, the bleeds tick, a remembered skill fires, the
  auto-attack swings.
- **The Whirling Slash bleed** (decided 2026-11-18, numbers provisional): on the press, if
  the selected target is within range 1, it gets a bleed. With no target, or one out of
  range, no bleed is applied and the rest of the skill happens as before. The duration is
  4 s plus 2 s per point spent (1c 6 s, 3c 10 s, 5c 14 s), it ticks every 2 s for 50, and it
  ignores armor. Range is checked only when the bleed is applied: once it is on, it keeps
  ticking if the target or the player walks away. Applying it again to a bleeding target
  follows the pandemic rule: the new end is now plus the new duration plus the smaller of
  the time left and 30% of the new duration, and the next tick time is left as it was.
  The author chose the duration scaling, the moment of application (the press) and keeping the tick
  schedule on a refresh. Two consequences were derived, not chosen: a refresh that puts the end
  between ticks has no partial tick, and a bleed that kills a monster removes it like any
  other kill. The bleed ticks after the channel and before the remembered skill and the
  auto-attack, so a monster it kills cannot be hit by those on the same tick. The
  50 and the 2-second tick are Claude's recommendations (balance numbers are the author's to adjust
  later); 5c is 200 from the channel plus 350 from the bleed, against 525 for one Overhead Slam.
  The tier 2 talent that spreads the bleed is not built.

## Combat event rules (decided 2026-11-26)

The state only shows how things are now, so the screen cannot tell who was just hit, by
what, or who just died, and it needs that to pick an effect. The rules now also write down
what happened, the way the WoW combat log does next to the game state.

- **Shape** (the author chose one shape for every event, following WoW's shared fields):
  `{ seq, type, source, target, ability, amount }`. `type` is `cast`, `damage`, `heal` or
  `death`. `source` and `target` are `'player'` or a monster id. `ability` is
  `'autoAttack'`, `'bleed'` or a skill key. A death has only `seq`, `type` and `target`
  (like WoW's `UNIT_DIED`); a cast has no target or amount.
- **When it is cleared** (the author's choice): only at the start of a tick. Events from a
  key press stay until the next tick, so the screen cannot miss them if React handles two
  actions before it draws. `seq` never restarts, and the screen draws only events with a
  higher `seq` than the last one it drew, so it does not draw one twice.
- **Details** (Claude's proposals, approved with the cases): `cast` is recorded only when
  a skill really goes, and a Brutal Swing that hits no one still records it, since the
  swing is still drawn (like WoW's `SPELL_CAST_SUCCESS`). `amount` is the damage after
  armor; damage past the remaining health (WoW's `overkill`) is not recorded. Monsters that
  hit on the same tick record one event each, though health still drops once by the sum. A
  death comes right after the damage that caused it. The Whirling Slash heal records what
  was actually restored, and nothing when that is 0.

## Dungeon clear rules (decided 2026-11-27)

A tier 1 run is cleared on trash: killing the last of its monsters clears it (no boss).
The server pays the reward when the screen reports the clear, so the rules need a flag the
screen can watch, the same way it watches `defeated`.

- **Shape** (the author's choice): `cleared`, a boolean next to `defeated`.
- **Where it is set** (the author's choice): at the two places that remove a dead
  monster, `damageMonster` (auto-attack and every skill) and `bleedStep` (the bleed ignores
  armor, so it removes monsters itself). This is how `defeated` is set, where the player's
  health hits 0. It turns on the moment the last monster dies, on a tick or on a key press.
  The cost is that the same check lives in two places, so a new way to kill a monster must
  set it too.
- **After a clear** (the author's choice): nothing happens any more, like after a defeat.
  The reducer returns the same object, so no events follow the clear.
- A new fight is not cleared, even an empty corridor with no monsters: the movement tests
  use one.

## Out-of-combat regen rules (decided 2026-11-27)

The backlog set out-of-combat regeneration on 2026-09-30 at 20% per second, and it was
never built. The first hand-played 22-monster run showed why it is needed: with no
healing, damage only piles up. The author chose it over a heal-on-kill skill, the
potion, or plain number changes.

- **Out of combat** (the author's choice): no aggroed monster is alive. Sleeping packs
  do not count. Aggro never drops until a monster dies, so this needs no new state.
- **Rate** (the author's choice, against the backlog's 20%): 5% of maximum health per
  second, 10 a tick at 2000. It matches WoW's Recuperate (150% over 30 s). At 20% the
  walk between packs refilled health, so resting was never a choice; at 5% it costs run
  time, which the fastest-clear leaderboard makes a real trade.
- **When it starts** (the author's choice): on the next tick, with no delay.
- **Where in the tick:** right after aggro is pulled and before anything that kills. So a
  pack woken this tick stops regen this tick, and the tick a last monster dies does not
  regen yet; the next one does.
- **No events** (the author's choice): a +10 every tick would clutter the screen.
- Names (the author's): `REST_HEAL_PER_SECOND`, `regenStep`.

## Cooldown rules (decided 2026-11-27)

The spec note lists two cooldowns, Market Price Rage (5) and Tilling (6). The author chose
to build them before any balancing, since tuning an incomplete kit would be undone the day
the rest arrived.

- **Values** (from the spec note): Market Price Rage, +20% for 15 s, 60 s cooldown;
  Tilling, a rift for 15 s, 30 s cooldown, +10% damage taken inside it.
- **"Attack power +20%" is read as all player damage +20%.** Only the auto-attack uses
  attack power today; the skills deal fixed amounts, so the literal reading would boost
  auto-attacks alone.
- **No GCD** (the author's choice): neither uses the GCD, and both work during a channel.
  WoW took its burst cooldowns off the GCD in Shadowlands, because spending a GCD only to
  boost later presses felt bad.
- **Bleeds** (the author's choice): the multiplier is read when a bleed tick lands, not
  when the bleed is applied, as in WoW since 2014 (no snapshots).
- **Stacking** (the author's choice): multipliers from the two sources multiply,
  1.2 × 1.1 = 1.32. Whether WoW adds or multiplies here was not confirmed.
- **The rift** (the author's choice): fixed on the tile the player stood on, covering
  range 1 around it. A monster is checked where it stands when the damage lands.
- **Rounding** (Claude's choice): the multiplier goes in with armor, and the result is
  rounded once at the end.
- Both are ready at the start of a fight. An effect is on while the tick is below its end
  tick, so damage on the end tick itself is not boosted.
- Names: the state shape (an object per skill: `marketPriceRage`, `tilling`),
  `damageMultiplier` and `inRift` are the author's; `COOLDOWN_SKILLS`, `castCooldown`,
  `MARKET_PRICE_RAGE_MULTIPLIER`, `TILLING_MULTIPLIER` and `RIFT_RADIUS` are Claude's and
  not reviewed yet.

## Cases

### A. Initial layout — `createInitialState`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| A1 | One monster in pack 2 stands at x = 20, in the middle row, with its template hp and armor, not aggroed, carrying its template's attack damage and interval (in ticks) | Every later rule (aggro, damage) measures from where monsters stand and what they carry | Whether 10-tile spacing is a good design number |
| A2 | A pack of four fills four different tiles inside the corridor | Two monsters on one tile would hide one on screen and break hit checks | The exact formation shape |
| A3 | A second row in the same pack continues after the first row | Swarm and elite rows share a pack; restarting the slot count stacks them | Rows of different packs interleaved in the input |
| A4 | Packs 1 and 2 start at their own x; ids are unique | Ids tell two identical monsters apart; a pack must not inherit the previous pack's slot count | The real `/api/templates` response shape |
| A5 | The player starts at (0, 4) facing right, with 2000 of 2000 hp, not defeated, with no target, no Rage, no GCD running and nothing remembered | The first fight depends on the walking distance from the start and on the health pool | Anything about rendering |

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
| D1 | A monster hits the tick it reaches range, and not before (hp 2000 at tick 19, 1990 at tick 20) | Pins "first swing on contact" and that range 1 is what counts | Whether an immediate first hit feels fair |
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
| F7 | Rage stops at 5c | The bar has five cells | — (spending is F11–F17) |
| F8 | A kill by skill removes the monster and moves the target on | Skills end fights too | — |
| F9 | A defeated player cannot use skills, and a remembered skill does not fire on the tick the player dies | Nothing may keep happening to a dead player | — |
| F10 | The auto-attack keeps swinging during the GCD | The spec says the auto-attack costs no button and no GCD | — |
| F11 | Overhead Slam spends all whole points and deals 200, 303, 387, 459, 525 for 1c to 5c; it spends the GCD | The curve is the design decision of this slice; the values are hand-computed, and 387, 459 and 525 tell rounding from flooring and ceiling | Whether the curve feels right |
| F12 | 2.5c spends 2c, deals 303 and leaves 0.5c | The spec says leftover half points stay on the bar | Not tried by hand: Brutal Swing now makes half points in play, but the two skills were checked separately |
| F13 | With under 1c (0 or 0.5c) nothing happens, and the GCD is not spent | A failed press must not cost the player a second of GCD | — |
| F14 | With no target, or a target out of range, nothing happens and the Rage is kept | A failed press must not waste the points the player built | — |
| F15 | Armor cuts the damage and it is rounded: 3c vs 250 armor gives 310, 1c vs 100 gives 182, 2c vs 300 gives 233 | The Slam shares the armor rule; each value separates rounding from flooring or ceiling | — |
| F16 | A key press in the last 3 ticks of the GCD is remembered and spends the Rage held when it fires; with under 1c at that moment it is dropped; an earlier press is dropped | The queue must work for the spender, whose result depends on the Rage at fire time | — |
| F17 | A kill by Slam removes the monster, spends the Rage and moves the target on | Spenders end fights too | — |
| F18 | The auto-attack keeps swinging after a Slam | The auto-attack uses no button and no GCD | — |
| F19 | Brutal Swing facing right hits the six tiles three wide and two rows ahead (3 enemies inside, 5 around them untouched: 3 ahead, 2 to the side, behind, beside the player) and adds 1.5c | The shape is the skill; each outside spot is one way the area could be wrong by a tile | Anything beyond the one position |
| F20 | Facing up, down and left, a corner tile of the area is hit and the next tile out is not | The area must turn with the player; facing is the reason the skill is not a circle | Diagonal facing (the game only has four directions) |
| F21 | Each enemy hit makes 0.5c of Rage: 1 hit 0.5c, 2 hits 1c, 5 hits 2.5c, and Rage stops at 5c | Builders make the Rage the spenders use | — |
| F22 | Armor cuts each hit and it is rounded: 250 gives 32, 100 gives 36, 300 gives 31 | The same armor rule as every other hit | — |
| F23 | With nobody in the area the swing still happens: no damage, no Rage, the GCD is spent; the same with no monsters and no target | The author's rule: a miss costs the GCD, so facing matters | Feedback for the miss (none yet) |
| F24 | With six enemies in the area only five are hit: the target first when it is in the area, then the nearest, then the lower id | The cap is what makes the six tiles mean something | Targets standing on the same tile (monsters cannot share one) |
| F25 | A press in the last 3 ticks of the GCD is remembered and hits whoever is in the area when it fires; an earlier press is dropped | The queue must read the world when the skill fires | — |
| F26 | A kill by the swing removes every dead monster, counts them for Rage, and moves the target on only when the target died; a swing with no target selects nothing | Area kills must not break targeting | — |

### G. Whirling Slash channel — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| G1 | 3c spends all the Rage, deals nothing at once, then 90 at ticks 7, 14 and 21 and stops | The tick schedule is the skill: one tick per point, 0.7 s apart | — |
| G2 | 1c to 5c deal 90, 180, 270, 360, 450 in total; 5c has four ticks done at tick 34 and five at tick 35 | Duration and tick count must both scale with the points | Whether 90 per tick is a good number |
| G3 | The range is checked on every tick: a tick spent out of range is lost, and coming back resumes (two of three ticks hit) | The spec says walking away wastes ticks and walking back resumes them, with no separate rule | — |
| G4 | Every enemy within range 1 is hit, diagonals included, with no cap (eight around the player), and one at range 2 is not | "Every enemy in range 1" is the area; the ring is full, so the outer enemy cannot walk in | — |
| G5 | Armor cuts each tick and it is rounded: 250 gives 72, 100 gives 82, 300 gives 69 | Ticks share the one armor rule (the bleed will ignore it later) | The bleed |
| G6 | On completion it heals 20 if any tick connected, never past full health, not before the end, and not if no tick connected; one early tick is enough | The spec: the heal lands only if at least one tick connected | Whether 20 is a good number |
| G7 | It starts even with nobody in range (Rage spent, GCD held 35 ticks); under 1c nothing happens; 2.5c spends 2c, leaves 0.5c and ticks twice | An empty channel is the cost of bad positioning; the usual spender rules | — |
| G8 | The channel holds the GCD to its end: an early press is dropped, one in the last 3 ticks fires after the final tick, 1c holds 10 ticks not 7, and a remembered second Whirling Slash starts after the first one finishes | "Other skills not pressed during the channel" comes out of the GCD; the order of the last tick and the remembered skill matters | — |
| G9 | The player can walk during the channel, which keeps running | The spec: movement is allowed while channeling | — |
| G10 | Enemies killed by a tick are removed; the target moves on only when the target died; with no target nothing is selected | The same targeting rule as every other kill | — |
| G11 | A player killed on a channel tick does not spin, and a dead player stops channeling | Nothing may keep happening to a dead player | — |
| G12 | The auto-attack keeps swinging, and on a tick where both land the channel comes first (the auto-attack then hits the new target if the tick killed the old one) | The auto-attack uses no GCD; the order inside a tick is a rule | — |

G8, G9 and G12 cast on a target in range, so since the bleed their expected hit points include
the bleed ticks (their comments say how many).

### H. Whirling Slash bleed — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| H1 | Pressing with the target in range puts a bleed on it, timed from the tick of the press (1c at tick 0: ends 60, first tick 20; pressed at tick 3: 63 and 23) | The bleed is state with its own clock | — |
| H2 | The duration is 4 s plus 2 s per point: 1c 6 s, 3c 10 s, 5c 14 s | The author chose that more Rage means a longer bleed | Whether these numbers are good |
| H3 | 50 every 20 ticks, the last tick lands on the end, then the bleed is null and nothing more is dealt (5c: 450 + 350 in total) | Schedule and expiry | — |
| H4 | The bleed ignores armor while the channel tick beside it does not (armor 500: 60 + 3 × 50) | Backlog: bleeds ignore armor | — |
| H5 | Only the selected target is bled, even if others stand in range | The bleed goes to the primary target | — |
| H6 | No target, a target at distance 4 or 2, or a far target with another enemy near: nobody is bled and the channel still runs | The skill needs no target, the bleed does | — |
| H7 | After it is applied, the bleed keeps ticking when the target leaves the range | Range is checked only when applied | Whether that feels right to play |
| H8 | Refreshing in the last 30%: all the time left is carried over and the tick schedule is kept | The pandemic rule | — |
| H9 | Refreshing earlier: only 30% of the new duration is carried (5c +42 ticks, 1c +18); an end between ticks gives no partial tick | The pandemic cap, and integer ticks | — |
| H10 | A monster killed by a bleed tick (down to exactly 0 too) is removed, and the target moves on if it was the target | The same kill rules as every other hit | — |
| H11 | On a tick where the channel and a bleed both land, the channel comes first (seen through the heal) | The order inside a tick is a rule | — |
| H12 | A remembered Whirling Slash applies the bleed when it fires, counted from that tick | The queue reads the world when the skill fires | — |
| H13 | A bleed tick that kills the target comes before a remembered skill, which finds no target (Rage unchanged) | The order inside a tick | — |
| H14 | A bleed tick that kills the target comes before the auto-attack, which swings at the next target | The order inside a tick | — |
| H15 | A player killed on the tick of a bleed tick does not bleed the monster, and later ticks do nothing | Nothing may keep happening to a dead player | — |

### I. Combat events — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| I1 | A new fight starts with `events: []` and `nextEventSeq: 0` | The starting point of the numbering | — |
| I2 | A tick clears the last events; `seq` keeps counting up and never restarts | The screen tells new events from old ones by `seq` | — |
| I3 | An auto-attack records the damage left after armor (armor 250: 32) | `amount` is what the monster lost | — |
| I4 | Two monsters hitting on the same tick record one event each, in id order, while health drops by the sum | The screen must know who hit | — |
| I5 | A skill pressed between ticks records cast then damage; another action (walking) does not clear them, the next tick does | Key-press events must survive until drawn | Whether React really draws between actions |
| I6 | A Brutal Swing that hits no one records only the cast; a skill that cannot go (no target, out of range, no Rage) leaves the state unchanged | The whiff is still drawn; a failed press draws nothing | — |
| I7 | Brutal Swing and each Whirling Slash tick record one damage event per enemy hit; the channel press records only the cast | One effect per enemy | — |
| I8 | A bleed tick records damage from the player with ability `bleed`, ignoring armor (50 beside a channel tick of 72) | The bleed has its own effect | — |
| I9 | A kill records death right after the damage, by a hit or by a bleed; `amount` is not cut down to the health left | The death effect follows the hit | — |
| I10 | The Whirling Slash heal records the amount actually restored (20, or 10 from 990) after the tick's damage, and nothing at full health | No "+0" on screen | — |
| I11 | A player killed by a monster records death after the damage | The defeat effect | — |
| I12 | A skill remembered in the GCD records nothing when pressed, and cast and damage when it fires | The event belongs to the moment the skill goes | — |

### J. Dungeon clear — `combatReducer`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| J1 | A new fight starts with `cleared: false`, even an empty corridor | The starting point; the movement tests run in an empty corridor | — |
| J2 | An auto-attack that kills the last monster clears the run; killing one of two does not | The `damageMonster` path, on a tick | — |
| J3 | A bleed tick that kills the last monster clears the run; killing one of two does not | The `bleedStep` path | — |
| J4 | A skill key that kills the last monster clears the run at once, with no tick | The key-press path | — |
| J5 | Once cleared, a tick, moving, selecting and a skill all return the same object | Nothing may happen after the clear | — |

### K. Out-of-combat regen — `combatReducer`, `tick`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| K1 | With only sleeping monsters, health rises by 10 a tick (100 a second) | That regen happens, at the right amount, and that sleeping packs do not block it | Whether 5% feels right in a real run |
| K2 | While one aggroed monster is alive, health does not rise, even out of its reach | The out-of-combat test is aggro, not distance | — |
| K3 | Health stops at the maximum | Regen never overfills | — |
| K4 | On the tick a pack wakes up, health does not rise | Regen comes after aggro is pulled, not before | — |
| K5 | On the tick the last aggroed monster dies, health does not rise; it rises from the next tick | Regen comes before the steps that kill, not after | — |

### L. Cooldowns — `combatReducer`, `useSkill`

| ID | Behavior | Why it is needed | What it does not catch |
|----|----------|------------------|------------------------|
| L1 | A new fight starts with both cooldowns ready and neither effect on | The starting point | — |
| L2 | Market Price Rage lasts 150 ticks with a 600-tick cooldown, works during the GCD and a channel without touching either, and is ignored on cooldown | The off-GCD rule and the cooldown | — |
| L3 | With it on, the auto-attack hits 48 and Furious Thrust 96; through 250 armor, 77 | The multiplier reaches every hit, armor still applies | — |
| L4 | A bleed tick with it on deals 60; after it ends, the same bleed deals 50 | No snapshot: the tick reads the buff when it lands | — |
| L5 | Damage on the end tick is not boosted | The boundary | — |
| L6 | Tilling fixes a rift on the player's tile for 150 ticks with a 300-tick cooldown, without the GCD | Where the rift goes, and its timing | — |
| L7 | Only a monster inside the rift takes 10% more; the rift stays when the player walks off; an expired rift no longer counts | The rift is fixed, sized and timed | — |
| L8 | Brutal Swing, a channel tick and a bleed tick each check the rift per monster | Every damage path reads the rift | — |
| L9 | With both on, 106, or 84 through 250 armor | Multiply, and round once at the end | — |
| L10 | Each cooldown records a cast; one pressed on cooldown records nothing | The screen can draw the cast | — |

## Movement rule change (2026-11-17)

The author changed the rule from "the first step comes on the next tick" to "a key
press steps at once". Step spacing stays at 5 ticks, so mashing a key cannot beat
2 tiles per second. B1, B5 and B6 were updated (their expected values moved; the
rules they check did not), B7 gained the press paths, and B8–B10 are new. Adding
fields to monsters and to the state changed A1's expected object and A5.

## Mutation check

Each rule in `rules.js` was broken on purpose, one at a time, and the suite was
re-run to confirm a test fails. All 93 breakages in the first part of the table were
caught on the code before Overhead Slam (three of them are the rounding variants in one
row, so that part has 91 rows). The Overhead Slam slice added 21 more breakages, listed
after the table: 16 new rows and 5 re-runs of existing rows against the changed
`castSkill`. The Brutal Swing slice added 42 more: 35 new rows and 7 re-runs of existing
rows against the refactored hit code. The Whirling Slash slice added 41 more: 38 new
rows and 3 re-runs. The Whirling Slash bleed slice added 40 more (all new rows): 39 were caught
and one survived because it was dead code, which was removed (see below). Counting the 197 before
the bleed, all 236 breakages of live code were caught, and `rules.js` was restored after every run.
The combat events slice added 21 more (all new rows), and all were caught: 257 in total. The dungeon clear slice added 8 more (all new rows, listed last), and all were caught: 265 in total. The test lists in the first 91 rows
are from before the Slam, Swing, Whirling Slash and bleed tests existed, so they do not name
F11–F26, G1–G12 or H1–H15.

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

Added with Overhead Slam (16 new rows):

| Breakage | Caught by |
|----------|-----------|
| Slam base damage 200 → 199 | F11, F12, F15, F16, F18 |
| Slam curve exponent 0.6 → 0.7 | F11, F12, F15, F16, F18 |
| Slam curve exponent 0.6 → 0.5 | F11, F12, F15, F16, F18 |
| Slam curve rounded down | F11, F15, F16 |
| Slam curve rounded up | F11, F12, F15, F16, F18 |
| Slam curve not rounded | F15 (only through armor: the hit rounds again, so without armor it is invisible) |
| Points counted with round instead of floor | F12, F13, F16 |
| Points counted with ceil instead of floor | F12, F13, F16 |
| One point = 5 Rage units instead of 10 | F11, F12, F13, F15, F16, F18 |
| Slam allowed with 0 points | F13 |
| Slam needs 2 points | F11, F15 |
| Slam with under 1c is not refused | F13 |
| Slam spends no Rage | F11, F12, F16, F17 |
| Slam spends all Rage, half point included | F12 |
| Slam spends one point only | F11, F12, F16, F17 |
| Slam treated as a builder (80 damage, +1c) | F11, F12, F13, F15, F16, F17, F18 |

Re-runs against the changed `castSkill`, each still caught: Rage not capped (F7), Rage
gain 1c → 2c (F1, F5), Furious Thrust damage 80 → 79 (F1, F3–F6, F8, F10, F11, F13, F16),
no GCD on a cast (F3, F4, F5, F11, F16), and the range check removed (E5, F2, F14).

Added with Brutal Swing (35 new rows):

| Breakage | Caught by |
|----------|-----------|
| The skill does not exist | F19–F26 |
| The area skill goes through the single-target path | F19, F20, F21, F22, F23, F24, F26 |
| Area 2 rows → 1 row | F19, F20, F21, F24, F26 |
| Area 2 rows → 3 rows | F19, F20 |
| Area half-width 1 → 0 | F19, F20, F21, F24 |
| Area half-width 1 → 2 | F19, F20 |
| Cap 5 → 4 targets | F21, F24 |
| Cap 5 → 6 targets | F24 |
| Damage per target 40 → 41 | F19, F20, F22, F24, F25 |
| Damage per target 40 → 80 | F19, F20, F22, F24, F25 |
| Rage per target 0.5c → 1c | F19, F21, F24, F25, F26 |
| Rage per target 0.5c → 0 | F19, F21, F24, F25, F26 |
| Swing Rage not capped | F21 |
| Area starts at the player's own row (0 ahead) | F19, F23 |
| Area starts 2 rows ahead | F19, F21, F22, F24, F25, F26 |
| Area ends one row early (`<` instead of `<=`) | F19, F20, F21, F24, F26 |
| Area one column narrower (`<` instead of `<=`) | F19, F20, F21, F24 |
| Side check removed | F19, F20 |
| Facing ignored (always right) | F20 |
| Area behind the player instead of ahead | F19, F20, F21, F22, F24, F25, F26 |
| Side measured along the wrong axis | F19, F20, F21, F24, F26 |
| The area filter accepts every monster | F19, F20, F23, F25, F26 |
| Selected target not put first | F24 |
| Selected target put last | F24 |
| No distance ordering | F24 |
| Farthest first | F24 |
| Equal distances go to the higher id | F24 |
| The swing does not spend the GCD | F23 |
| The swing needs a target | F19, F20, F21, F22, F23, F24, F26 |
| The swing needs someone in the area | F23 |
| Target re-picked even when it survived | F26 |
| Target picked even when none was selected | F26 |
| Rage counts only the survivors | F26 |
| Rage counts every monster alive, not the ones hit | F19, F23, F24, F25, F26 |
| Only the first enemy in the area is hit | F19, F24, F26 |

Re-runs against the refactored hit code, each still caught: armor ignored (E6, F6, F15,
F22), armor constant 1000 → 500 (E6, F6, F15, F22), target never re-picked (E8, F8, F17,
F26), the new target is the first monster instead of the nearest (E8), a dead monster stays
on the field (E7, E8, F8, F17, F26), a hit edits a monster in place (B7, F4, F10, F16, F18,
F25) and the single-target range check removed (E5, F2, F14).

One breakage survived and was not a test gap: comparing ids when two enemies are equally
far. The monster list is always in id order and the sort keeps equal items in place, so the
comparison did nothing. It was removed as dead code, and the tie rule is still pinned by F24.

Added with Whirling Slash (38 new rows):

| Breakage | Caught by |
|----------|-----------|
| The skill does not exist | G1–G12 |
| The channel skill goes through the single-target path | G1–G12 |
| Tick interval 0.7 s → 0.5 s | G1, G2, G6, G7, G8, G11, G12 |
| Tick interval 0.7 s → 0.8 s | G1–G10, G12 |
| Damage per tick 90 → 91 (re-run 2026-11-27, when the tick rose from 40) | G1–G5, G7, G8, G9, G12, H3–H6, H8, H9, I7, I8, I10, L8 |
| Damage per tick 90 → 180 (re-run 2026-11-27) | G1–G5, G7, G8, G9, G12, H3–H6, H8–H10, I7–I10, L8 |
| Completion heal 20 → 21 | G6 |
| Completion heal 20 → 0 | G6 |
| Usable with 0 points | G7 |
| Needs 2 points | G2, G4, G5, G8, G10 |
| Points counted with round instead of floor | G7 |
| Points counted with ceil instead of floor | G7 |
| The channel spends no Rage | G1, G7, G8 |
| The channel spends all Rage, half point included | G7 |
| The channel spends one point only | G1, G7, G8 |
| Always one tick | G1, G2, G3, G6, G7, G8, G9, G12 |
| One tick too many | G1, G2, G6, G7, G8 |
| First tick after 1 tick instead of 7 | G1, G2, G6, G8, G11, G12 |
| Later ticks one tick late | G1, G2, G6, G8, G9, G12 |
| GCD fixed at 1 s | G7, G8, G9 |
| GCD only as long as the channel | G8 |
| GCD the shorter of 1 s and the channel | G7, G8, G9 |
| Range 1 → 0 | G1–G10, G12 |
| Range 1 → 2 | G4 |
| Heal only if the last tick connected | G6 |
| Never counts as connected | G6 |
| Always counts as connected | G6 |
| Counts as connected from the start | G6 |
| Heal not capped at full health | G6 |
| Channel ends one tick early | G1, G2, G3, G6, G7, G8, G9 |
| Channel never ends | G1, G2, G6, G7, G8 |
| A defeated player still spins | G11 |
| The channel does not move the target on | G10 |
| The channel ticks after the remembered skill fires | G8 |
| The channel ticks before the monsters hit | G11 |
| The channel ticks after the auto-attack | G8, G12 |
| The auto-attack is blocked while channeling | G12 |
| Walking cancels the channel | G9 |

Re-runs against the changed code, each still caught: armor ignored (E6, F6, F15, F22, G5),
a hit edits a monster in place (B7, F4, F10, F16, F18, F25, G1, G2, G8, G12), and a dead
monster stays on the field (E7, E8, F8, F17, F26, G10).

Two things about this batch. First, the checking script only looked for failed tests named
A to F, so the first run listed every breakage as surviving; the script was fixed to read
G tests and the batch was run again. Second, after that fix two breakages truly survived,
both about the order inside one tick: the channel ticking after the remembered skill, and
after the auto-attack. G8 gained a queued second Whirling Slash and G12 gained a tick
where the channel and the auto-attack land together, and both breakages are now caught.

This shows the suite notices these breakages. It does not show that the rules are
complete.

Added with the Whirling Slash bleed (39 caught rows, plus one that survived and was removed):

| Breakage | Caught by |
|----------|-----------|
| The channel applies no bleed | G8, G9, G12, H1, H2, H3, H4, H5, H7, H8, H9, H10, H12 |
| Base duration 4 s → 5 s | H1, H2, H3, H5, H8, H9, H12 |
| Base duration 4 s → 3 s | H1, H2, H3, H4, H5, H7, H8, H9, H12 |
| Per point 2 s → 3 s | H1, H2, H3, H5, H8, H9, H12 |
| Per point 2 s → 1 s | H1, H2, H3, H4, H5, H7, H8, H9, H12 |
| Tick interval 2 s → 1 s | G8, G9, G12, H1, H3, H4, H5, H7, H8, H9, H10, H12 |
| Tick interval 2 s → 3 s | G8, G9, G12, H1, H3, H4, H5, H7, H8, H9, H10, H12 |
| Tick damage 50 → 51 | G8, G9, G12, H3, H4, H5, H7, H8, H9 |
| Tick damage 50 → 40 | G8, G9, G12, H3, H4, H5, H7, H8, H9, H10, H14 |
| Armor applied to the bleed | H4 |
| Every enemy in range is bled | H5 |
| No range check on the target | H6 |
| Range check one tile too wide | H6 |
| First tick at the press instead of 2 s later | G8, G9, G12, H1, H3, H4, H5, H7, H8, H9, H10, H12 |
| End counted from tick 0 | H1, H12 |
| Pandemic carries nothing | H8, H9 |
| Pandemic carry uncapped | H9 |
| Pandemic always carries the full 30% | H8 |
| Carry ratio 30% → 50% | H9 |
| Carry ratio 30% → 20% | H8, H9 |
| A refresh resets the tick schedule | G8, H8 |
| Carry measured to the next tick instead of the end | H8 |
| Last tick dropped | H3, H4, H5, H7, H8 |
| The bleed is never removed | H3, H8, H9 |
| Removed one tick late | H3 |
| Removed one tick early | H3, H4, H5, H7, H8 |
| Bleed ticks before the channel | H11 |
| Bleed ticks after the remembered skill | H13 |
| Bleed ticks after the auto-attack | H13, H14 |
| A bleed kill does not move the target on | H10, H14 |
| A monster at exactly 0 hp stays | H10, H14 |
| Bleed only ticks while in range | H7 |
| A tick edits the monster in place | B7 |
| Applying edits the monster in place | B7 |
| A defeated player does not stop bleed ticks | H15 |
| Duration ignores the points spent | H1, H2, H3, H5, H8, H9, H12 |
| Duration counts one point too many | H1, H2, H3, H5, H8, H9, H12 |
| A monster with no bleed gets a bleed object on every tick | G12, H5 |
| A new monster has no bleed field instead of null | A1, H5, H6, H12 |

Combat events (2026-11-26):

| Breakage | Caught by |
|----------|-----------|
| A tick does not clear the events | I2, I5, I7, I8, I9, I10, I12 |
| `seq` does not go up | I2, I5, I12 |
| The first `seq` is 1 | I1, I2, I5, I12 |
| Only the first of several monster hits is recorded | I4 |
| A monster hit records the summed damage | I4 |
| The player's death is not recorded | I11 |
| Damage recorded before armor | I3, I8 |
| A monster killed by a hit records no death | I9 |
| The auto-attack records the wrong ability | I3 |
| A single-target cast is recorded before its checks | F2, F13, F14, I5, I6, I9, I12 |
| A single-target cast is not recorded | I5, I9, I12 |
| The area skill records no cast | I6, I7 |
| The channel records no cast | I7 |
| A channel tick records the wrong ability | I7, I8, I10 |
| A bleed tick records no damage | I8, I9 |
| A monster killed by a bleed records no death | I9 |
| Bleed events are dropped at the end of the step | I8, I9 |
| The heal records 20 instead of what was restored | I10 |
| A heal of 0 is recorded | I7, I8, I10 |
| Walking clears the events | I5 |
| Death recorded before the damage | I9 |

Dungeon clear (2026-11-27):

| Breakage | Caught by |
|----------|-----------|
| A new fight starts cleared | J1, and almost every test that ticks |
| A kill by a hit never clears | J2, J4, J5 |
| A kill by a hit always clears | J2 |
| A kill by a hit clears with one monster left | J2 |
| A kill by a bleed never clears | J3 |
| Any bleed tick clears, kill or not | J3, and the G, H and I tests that bleed |
| The bleed step drops the clear check | J3 |
| The reducer keeps running after a clear | J5 |

Out-of-combat regen (2026-11-27), all seven caught:

| Breakage | Caught by |
|----------|-----------|
| No regen at all | K1, K3, K5 |
| Regen even in combat | K2, K4, K5, and 12 tests in D–I that take damage |
| Any monster, even asleep, blocks regen | K1, K3, K5 |
| No cap at maximum health | K3 |
| A second's worth healed every tick | K1, K5 |
| Regen before aggro is pulled | K4, D5, D6, E9 |
| Regen after the steps that kill | K5, H11 |

Cooldowns (2026-11-27). On the first run 15 of 16 were caught; "an expired rift still
counts" survived, and L7 gained the assertion that closes it. All 16 are caught now:

| Breakage | Caught by |
|----------|-----------|
| Market Price Rage never boosts | L3, L4, L5, L9 |
| The buff is still on at its end tick | L5, L7, L8, and 20 tests in F and I |
| The rift boosts every monster while on | L7, L8 |
| An expired rift still counts | L7 |
| The rift follows the player | L7, L8 |
| Rift radius 2 | L7, L8 |
| The multipliers add | L9 |
| Rounded before armor | L9 |
| Bleed ticks ignore the multiplier | L4, L8 |
| The cooldown is never checked | L2, L6, L10 |
| A cooldown starts the GCD | L2, L3, L6, L7, L9 |
| Cooldowns wait for the GCD | L2 |
| No cast event | L10 |
| Tilling's cooldown is 60 s | L6 |
| The rift is not placed on the player | L6, L7, L9 |
| The buff lasts 10 s | L2, L5 |

The 40th breakage removed the line that stopped a bleed from ticking once its next tick time
is past its end. It survived because the line could never matter: when the next tick time is
past the end, the bleed has already been removed at the end tick. The line was deleted as dead
code, and "no partial tick" is pinned by H9 through the expiry.

On the first full run six breakages survived: that one and five that were real gaps. Range one
tile too wide (H6 now has a distance-2 case), a monster at exactly 0 health staying (H10 now
reaches exactly 0), the bleed ticking after the remembered skill (H13), after the auto-attack
(H14), and a defeated player not stopping bleed ticks (H15). The checking script first read the
vitest output the wrong way and reported every breakage as unparsable; it was fixed and the batch
was run again, and then once more on the final code, which is the table above.

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
(measured 1.0 s after the first cast); the auto-attack keeps its own timer. Mashing the
key casts once per GCD (0.98–1.01 s apart), with no double casts. While the slot lit only
after the GCD ended, pressing 0.15 s after it lit was 10–14% slower than mashing (1.10–1.14
s per cast), so the slot now lights 3 ticks early, when a press is accepted, and the two
match (about 1.0 s per cast).

Then Overhead Slam, checked on 2026-11-17 (key presses sent from the page, not typed):
slot 3 is dim with no Rage and lights when 1c is held; pressing 3 with 0 Rage does nothing
(no damage, no GCD); after three Furious Thrusts (3c) the rat went from 440 to 53, exactly
the 387 of the table, Rage fell to 0 and slot 3 dimmed again; the console showed no errors
or warnings after a reload. The half-point case (F12) and the queued Slam (F16) were not
tried in the browser at that point: Brutal Swing, which makes half points, did not exist
yet, and the queue is the same code path as Furious Thrust's. They were still not tried
by hand after Brutal Swing was added.

Then Brutal Swing, checked on 2026-11-17 (key presses sent from the page): six dashed tiles
mark the area, three wide and two ahead, and they swap to the other side when the player
turns left. With two rats beside the player, both inside the area, key 2 took 40 off the
target and filled one Rage cell. One hit would only make 0.5c, which does not fill a cell,
so both rats were hit. Turned away from the rats, key 2 hit nothing, left Rage unchanged and
still dimmed every slot for the GCD. The console showed no errors or warnings. Not tried in
the browser: more than five enemies in the area, since a pack has at most four and merging
two packs takes a long walk. F24 covers it.

Then Whirling Slash, checked on 2026-11-17 (key presses sent from the page): slot 4 is dim
with no Rage and lights at 1c; with two rats beside the player, three Brutal Swings made 3c;
key 4 then emptied the Rage and drew an outline around the eight tiles next to the player.
The target's health fell by 40 at 0.66, 1.32 and 2.03 seconds after the press (ticks 0.7 s
apart, within timer jitter) and 40 more at 1.53 and 3.54 seconds, which are the auto-attack
(2.0 s apart). The outline vanished at 2.03 seconds, and at the same moment the player's
health went from 860 to 880, the completion heal. Holding Up at 1.0 to 1.6 seconds moved
the player up two rows while the ticks kept landing. The console showed no errors or
warnings after a reload. Not tried by hand: walking out of range between ticks (G3), the
queued second channel, and dying mid-channel; tests cover them.

Then the Whirling Slash bleed, checked on 2026-11-18 (key presses sent from the page; the dot
on the tile is drawn by a small CSS rule and was only seen on screen, not tested): with two rats
beside the player and one clicked as the target, three Brutal Swings 1.15 s apart made 3c and key 4
then put the `tile-bleed` class on the target within 0.3 s. Over the next 12 s the target's health
fell by the channel ticks (40 each, 0.7 s apart), a bleed tick of 50 every 2 s and the auto-attack
(40 every 2 s): from 5.6 s to 11.6 s it lost 90 every 2 s, that is one bleed tick and one swing, and
the class was gone by 11.6 s (a 3c bleed ends at 10 s). A second cast with 2c put a small red dot in the top
right corner of the target tile, visible together with the target outline. The browser console showed
no errors or warnings. Not tried by hand: refreshing a bleeding target, a bleed that kills a
monster, and walking away from a bleeding monster; tests cover them.

Combat effects (2026-11-27, headless Chrome at 1200 × 1000, scale 1): the canvas sits on
the corridor's top-left corner at 848 × 448, tiles are 48 px, and a real mouse click
through the canvas still selects a monster. Furious Thrust drew a white flash and 80 on
the target, Brutal Swing flashed its six tiles and put 40 over both monsters, the player's
hit showed 10 in red, and a kill left a fading burst while the target moved to the next
monster. No console errors. Not checked: an effect staying on its tile while the camera
scrolls, and a high-density display.

## Not covered yet

- Ranged monsters hold their ground while they can reach the player. Today they chase
  and hit like melee monsters, a temporary stand-in.
- The rest of the skill kit: the tier 2 talent that spreads the bleed to a second target,
  Sprint, and key rebinding. The tier 1 talent that widens Brutal Swing to
  three rows.
- The talents that change Overhead Slam (tier 3a refund, tier 5a crit and 5b bleed bonus)
  and the Slam's interaction with Market Price Rage.
- The elite and ranged mechanics (spin, pools, volley).
- Run goals: clearing packs, the boss, rewards and the timer.
- The effect layer (`EffectLayer.jsx`) has no automated tests. Its "draw only a higher `seq`"
  rule and the last-known position of a dead monster were checked only by hand (below).
