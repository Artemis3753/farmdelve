# Design Backlog

Working document. Tracks what is decided, what is still open, and what is
deliberately out of scope. Updated as design sessions go.

Last updated: 2026-11-26

---

## 1. Decided

### Project

- Single-player. No multiplayer, no co-op.
- Real-time action combat (player presses skills, builds a rotation).
- Three weapon specializations: Scythe (melee), Crossbow (ranged),
  Watering Can (control / debuffs).
- Stack: React, Node.js/Express, PostgreSQL.
- Leaderboard ranked by fastest tier 1 clear (2026-11-26). It was "highest
  tier cleared" until the scope shrank to tier 1 only, which would tie
  everyone who clears it.
- No anti-cheat on the leaderboard — accepted as a known limitation.
  Not a commercial release.

### Farm (2026-08-25)

- Plant and harvest only. **No watering.**
- The player operates the farm directly, Stardew-style.
- Four starting crops, one per role:
  - Wheat — cash crop
  - Potato — healing potion material
  - Chili Pepper — damage potion material
  - Ironroot — gear upgrade material
- Growth times, fixed 2026-08-26: **Chili Pepper 5 min, Potato 5 min,
  Wheat 20 min, Ironroot 1 hour.** A short dungeon run refills potion
  materials; Ironroot, the upgrade material, runs on a slower clock.
  The earlier "longest 3–6 hours" estimate is retired.
- Every harvest also yields a small amount of gold. Dungeon completion is
  the main gold source.
- **Seeds are separate items from produce** (2026-08-25), Stardew-style:
  you plant a potato seed and harvest a potato.
- **The field is 5×5 = 25 plots** (2026-09-03). Four crops competing still
  leaves six plots each, and a field given over to Ironroot produces roughly
  one weapon's worth of upgrade material in three hours. A 3×3 field cannot
  run four crops at once, which is what ruled it out.
- **Planting and harvesting are both per-plot**, one POST each (2026-09-03).
  Neither is idempotent — planting into an occupied plot and harvesting an
  empty one are both refused, the same 409 boundary upgrading uses.
- **Harvesting returns seeds** (2026-09-03): one guaranteed, plus an
  independent 20% for one more and 5% for two more. Both can land, so a
  harvest yields one to four seeds — 76/19/4/1 percent — for an expected
  1.3. The rolls were left independent rather than made exclusive
  (2026-09-04): the expected value is the same either way, and the rare
  four is worth keeping. A seed shop was the alternative and would have
  given gold its only sink, but it costs a screen and a purchase API, so
  it is deferred rather than rejected (see §4).
  Because the expectation is above one, seeds stop being the binding
  constraint over time and the real limit becomes plots × growth time.
- Farm plot expansion: deferred (see §4).

### Consumables (2026-08-25)

- Damage potion: +50% damage, **20 second** duration.
- Healing potion: restores ~60% of health.
- Both potions **share one cooldown: 180 seconds.**
- **Potions take bag space and stack to 20 per slot** (2026-08-26). The
  earlier "no carry limit" rule is retired: the bag is 10×3 = 30 slots and
  potions compete with everything else for room.
- Consumables **do not trigger the global cooldown.**

### Crafting (2026-08-25)

- Minimal crafting, three recipes only:
  - 3 Chili Pepper -> 1 damage potion
  - 3 Potato -> 1 healing potion
  - 5 Ironroot -> 1 refined upgrade material
- Reuses the same atomic-transaction pattern as gear upgrading
  (check materials -> consume -> produce, all or nothing).

### Gear upgrading (2026-08-26, specified)

- Both **probability and resource cost**, with probability weighted
  **lower** than resource cost as the limiting factor.
- **Maximum +10**, on the same scale as the ten dungeon tiers.
- Cost and success rate fall into three bands, the same bands as the crest
  tiers and the dungeon time limits:

  | Upgrade | Crest | Crests needed | Refined material | Success |
  |---|---|---|---|---|
  | +1 → +4 | Seed Crest (T1) | 1, 2, 3, 4 | 1 each | 100% |
  | +5 → +8 | Sprout Crest (T2) | 1, 2, 3, 4 | 1 each | 70% |
  | +9 → +10 | Harvest Crest (T3) | 1, 2 | 1 each | 40% |

- **Names settled 2026-08-28.** The three crests are **Seed / Sprout /
  Harvest Crest** — only the adjective changes, so the tier order reads
  without a legend. The refined material is **Refined Ironroot**, which
  keeps its relationship to the raw crop in the name. The starting weapon
  is the **Solid Scythe**.

- The count resets at each band, but the crest tier rises, so the real cost
  keeps climbing. Higher crests only drop in deeper dungeons, which is what
  gates deep upgrading.
- Every upgrade also spends **one refined material** (5 Ironroot each).
  That is what keeps the farm attached to the headline feature — without
  it, Ironroot and its recipe have nowhere to go.
- **Failure spends the materials and leaves the upgrade level alone.** No
  downgrade, no destruction. Same reasoning as dying in a dungeon: this
  project does not punish.
- **Upgrading will also cost gold** (2026-09-03), decided but not built.
  Gold currently has no sink anywhere: it arrives from harvests and dungeon
  clears and never leaves, which makes both rewards meaningless. Upgrading is
  the natural place for it because it is the one action taken repeatedly.
  Building it reopens `attemptUpgrade` — `player` has to take a place in the
  lock order, which is gear then materials today — so it waits until the farm
  slice is finished and the review of that function is done.
- Stats: `base_stat × (1 + 0.1 × upgrade_level)` — +10 doubles the base.
- Server-authoritative.
- **Expected cost to +10**, failure rates included: 10 T1 crests, ~14.3 T2,
  ~7.5 T3, and ~14.7 refined materials — roughly **74 Ironroot**. The knob
  to turn when balancing is the 5-Ironroot recipe ratio, not the per-level
  material count.
- **Implementation note: a failed upgrade is not a rollback.** The material
  spend has to commit, or a player retries until it works. Only a database
  error or insufficient materials rolls the transaction back. Failure is a
  normal, committed outcome.
- **The endpoint, settled 2026-08-30.** `POST /api/gear/:gearInstanceId/upgrade`
  with no body — a server-authoritative roll leaves the client nothing to
  send but which item, so it goes in the path. POST rather than PATCH on two
  counts: the call is deliberately not idempotent, and PATCH's shape would
  have the client naming the result.
  - `200 { upgraded, gear, stacks }` whichever way the roll lands. A bad
    roll is still a processed request, and it reports itself as
    `upgraded: false`.
  - `409` when the request is well formed but the state refuses it —
    materials short, or already +10.
  - `404` for gear that does not exist or belongs to someone else, merged
    so that a response cannot confirm an id exists.
  - The body carries the updated gear and both changed stacks, so the
    client never needs a follow-up GET to redraw.

### Grid movement and range (2026-08-25, ranges settled 2026-08-27)

- **The world is grid-based**, like Stardew Valley. Positions are tiles,
  not free coordinates, which keeps range and area checks simple.
- **Meters are gone — every distance is written in tiles.** The 4m / 12m /
  8m figures recorded on 2026-08-24 were borrowed from free-movement games
  and never meant anything on a grid.
- **The Scythe's range is 1**: every adjacent tile, diagonals included.
  Diagonals count as distance 1 because excluding them would leave a
  monster standing at arm's length untouchable, and the player shuffling
  sideways to line up. That is fussiness, not tactics.
- Range 1 draws the same shape as a 3x3 centered on the player, so **the
  elite's spin and the Scythe's reach overlap exactly**: the tile you have
  to stand on to hit is the tile that gets you hit.
- Movement is four-directional while range is eight-directional. Reaching
  a diagonal tile costs two steps, but a monster already standing on one
  can be hit. That asymmetry is worth keeping — it makes stepping sideways
  out of a telegraphed area cheaper than backing away diagonally, so
  *which way to step* is a real choice.
- **Two notations, deliberately kept apart.** Anything centered on a
  character is **range N**; anything projected forward is **N rows ahead**.
  Both would otherwise be spelled "3x3" and mean different shapes.
- Skill shapes in tiles: Brutal Swing covers **three wide by two rows
  ahead**, based on facing — the only Scythe skill where facing matters,
  and the only one that reaches past range 1. Its six tiles are what make
  the five-target cap mean anything; cutting it to one row ahead would
  leave three tiles and kill the cap. The tier-1 talent widens it to three
  rows ahead. Whirling Slash and Tilling both cover range 1.
- Crossbow and Watering Can ranges stay open — both are paper-only. Rough
  anchor: ranged wants something near 4-6 for "shoots from afar" to read
  at all against a melee range of 1.

### Dungeon space (2026-09-10)

- **The dungeon is one corridor, nine tiles tall, that scrolls
  horizontally.** The route runs left to right and the camera follows the
  player, who stays centred — so seventeen tiles are on screen: eight
  ahead, eight behind, and the player's own. (Written as sixteen until
  2026-09-30; a centred player needs an odd width.)
- **Movement speed is 2 tiles per second** — one step every 0.5 seconds
  (*provisional*, 2026-09-30). The time budget allows 5 seconds of walking
  per pack, and packs sit 10 tiles apart, so this is the slowest speed that
  still covers the whole gap in 5 seconds. It also leaves a spin's 2-second
  wind-up room for four steps, not one.
- **The screen's long side had to be the direction of travel.** A vertical
  corridor makes the short side the way forward: nine tiles of warning no
  matter how wide the corridor gets. Turning it sideways doubles that for
  free. This is not a side-scroller — the grid stays top-down, only the
  scrolling changed. (2026-11-19: the art will be drawn in a 3/4 view, like
  Stardew — the rules keep the flat 2D grid, only the sprites are drawn at
  an angle. A true side view was rejected because it would mean rewriting
  the rules and their tests.)
- **The two axes do different jobs.** Left and right is approach; up and
  down is dodging. Movement is four-directional, so the split stays
  readable.
- **Volley range is 8 tiles — exactly the screen edge.** Any longer and
  the player is shot from off-screen; any shorter and walking over is
  cheap. WoW settles the same problem the same way: 40-yard abilities
  against a camera that stops at 39.
- The corridor is nine tall and the volley reaches eight, so **no amount
  of sidestepping escapes it.** "Cannot be dodged" describes the geometry,
  not just the rule.
- **The ranged type holds its ground while it can still reach the player,
  and closes when it cannot.** Fellowship does the same — its ranged
  enemies "stay put unless they cannot attack you". A monster nailed down
  for good would hand the player a free answer: walk past 8 tiles and the
  melee follows while the volley switches off, so the bill never arrives.
- **The volley fires unconditionally** — every eight seconds, moving or
  standing, adjacent or far. The alternative, silence while moving, would
  have turned retreating into a way to stall it and made monster movement
  speed a balance number.
- **Pack spacing is 10 tiles and aggro radius is 5.** Spacing has to
  exceed aggro or packs collect themselves and chain pulling stops being a
  decision; aggro has to stay under 8 or everything visible is already on
  its way.

### Dungeon loop and rewards (2026-08-25)

- **The dungeon is called The Fallow Deep** (named 2026-09-14). Fallow ground
  is land deliberately left unplanted, which leaves the question of why this
  ground was left — the same trick the scythe's cooldown plays with Market
  Price Rage, farming vocabulary standing in a fantasy frame. The name lives
  in `dungeon_template`, shows in the run header, and is tied to no code.
- One run is: enter -> clear eight packs -> kill the boss -> rewards.
- **Two words, deliberately kept apart** (2026-09-10). A **pack** is what
  the dungeon places; a **pull** is what the player drags into one fight.
  Eight packs are fixed, but how many pulls a run takes is the player's
  call. Chain pulling is what split them — before it, one pack was one
  pull and the two words meant the same thing.
- **Eight packs of 2–4 monsters each**, along a single horizontal corridor
  that runs left to right. Progress reads as a kill count — `12/20
  monsters`, say — not a percentage. A percentage would only be worth its
  complexity if there were more monsters than the run requires, and on one
  straight corridor there is nothing to route around. A pack counter was
  the earlier plan, but chain pulling would make it jump two at a time.
- **A pack of 2–4 cannot fill Brutal Swing's five-target cap on its own.**
  Merging two packs is what reaches five, and nothing is gained past it —
  so the cap is the reward for chain pulling and the brake on it at once.
- **The boss appears the instant the last pack dies, on that spot.**
  There is no boss room to walk to, and killing the boss is what completes
  the run.
- Popping immediately means the boss can begin while the player is at low
  health with the potion still on cooldown. **That is deliberate** —
  managing health and cooldowns through the last pull becomes part of
  playing well. It will read as punishing to some players; accepted.
- Monsters: **four trash types plus the boss.**

  | Type | Role | Mechanic |
  |---|---|---|
  | Melee swarm | Fills out the pack, weak melee, what the AoE eats | none |
  | Melee elite A | **Too much health to melt with AoE** | one |
  | Melee elite B | The same role, told apart by its mechanic | one |
  | Ranged | Attacks from a distance — close it, or ignore it | one |

- Five mechanics in total: one on each elite, one on the ranged type, two
  on the boss. **The swarm type stays plain**, so the pacing has somewhere
  to breathe instead of demanding attention every pull.
- The elites' health is what separates them from the swarm, and it does
  more than that: **the swarm dies to AoE and the elite is left standing
  alone, so every pull turns into a single-target finish.** Both halves of
  the talent tree get used in every pull, not only against the boss.
- **The second elite costs one mechanic and one row of stats, and buys
  variety exactly where the run needs it.** With one elite type, that
  single-target finish is the same fight every time; with two, the
  closing stretch of a pull changes depending on which one is left
  standing.
- The ranged type layers a positioning question on top: walk over and cut
  it down, or eat the damage and keep swinging at the pack.
- **Timed runs, WoW Mythic+ style.** The limit steps up in bands rather
  than rising every tier, so gear and player skill make the same limit feel
  looser as you improve:

  | Tier | Time limit |
  |---|---|
  | 1–4 | 5 min |
  | 5–8 | 10 min |
  | 9–10 | 15 min |

- Clear rewards: gold, plus tiered upgrade materials called **crests**
  (three tiers), modeled on WoW's heroic/mythic crests. Higher crest tiers
  drop only at higher dungeon tiers, which is what gates deep upgrading.
- **Clear reward amounts (2026-11-27, provisional):** an in-time tier 1 clear
  pays **100 gold and 5 Seed Crests**. Five crests take one item from +0 to
  +2 (1 + 2) with two left over, and 100 gold is well above a wheat plot (8
  per 20 minutes), keeping the dungeon the main gold source. The values live
  in `dungeon_tier_template` next to the time limit, because the crest tier
  steps on the same bands. Tiers 2–10 carry the same placeholder numbers;
  they are outside the DoD. Half of an odd gold reward rounds down.
- **Overtime clears still count**, but pay **50% of the currency and no
  crests at all.** Crests are the deep-upgrade gate, so missing the timer
  costs progression rather than the run itself.
- **Death: show "try again" and nothing else.** No durability loss, no item
  loss, no penalty of any kind. Punishment can be considered later, once
  the loop is actually fun to repeat.
- **Tier scaling: monster health and damage both rise 8% per tier,
  compounding** (2026-08-26). Tier 10 is therefore 1.08⁹ ≈ **2.0× tier 1**.
  WoW's Mythic+ compounds 7% per level in its low range and 8–10% higher
  up; 8% was picked because it lands tier 10 at exactly double, matching
  what a +10 upgrade does to a player's stats. The two ceilings line up on
  purpose.
- **Armor does not scale with tier** (2026-09-15). Armor feeds a damage
  reduction, so multiplying it would compound with the health multiplier:
  a tier-1 monster with 100 health and 200 armor has 120 effective health,
  240 at tier 10 with armor fixed, and 280 with armor scaled — about 2.33×
  instead of the 2× that was the reason for picking 8%.
- Players also grow from drops, not just upgrading, so a geared player will
  outpace the curve somewhat in the late tiers. That is intended — it reads
  as "the gear paid off." WoW layers affixes on top of raw scaling to keep
  the pressure on; **we have no affixes, so the tension at depth has to
  come from monster mechanics instead.**

### Pack layout and chain pulling (2026-09-10)

- **Packs are laid out against the player's cooldowns rather than against
  a difficulty curve.** Market Price Rage runs 60 seconds and a pack cycle
  is 30 — 25 seconds of fighting and 5 of walking — so it comes up once
  every two packs. Eight cycles and a 60-second boss land exactly on the
  five-minute limit. (Corrected 2026-09-15: the first version had a pack
  at 40 seconds plus 20 of walking, which no reading fits inside five
  minutes — eight packs at 40 already make 320 seconds.)
- **Which packs get merged is the player's call.** Aggro is 5 tiles
  against a spacing of 10, so dragging one pack into the next is
  deliberate work. Merging is what fills Brutal Swing's five-target cap,
  and it stretches a fight long enough to spend a 60-second cooldown
  inside it, so the reward is throughput and cooldown uptime at once.
- The brake was already written: damage taken is `melee × monsters
  attached` and nothing is gained past five targets, so a third pack
  doubles the danger and adds no damage.
- **Eight packs, 22 monsters.**

  | # | Pack | Count | Paired with the next |
  |---|---|:--:|---|
  | 1 | 2 swarm | 2 | **5** — exact cap, no timers |
  | 2 | 3 swarm | 3 | 6 |
  | 3 | 2 swarm + elite A | 3 | **5** — spin and pools |
  | 4 | 1 swarm + elite B | 2 | **5** — pools and volley |
  | 5 | 2 swarm + ranged | 3 | **5** — one volley |
  | 6 | 2 swarm | 2 | 6 |
  | 7 | 2 swarm + elite A + ranged | 4 | 7 — **three timers** |
  | 8 | 2 swarm + elite B | 3 | — |

- **Sizes vary so that the sums mean something.** Two packs of two fall
  short of the cap; two of four waste three targets. Four of the seven
  adjacent pairs come to exactly five, and finding them is the skill.
- **Pairs can be taken off-beat.** Merging (2,3), (4,5) and (6,7) instead
  of the obvious pairs never puts both elites in one fight — at the cost
  of one extra pull and one extra walk. Note that (4,5) is one of the
  pairs that adds to five, so off-beat is not only for playing safe.
- **(7,8) is the pair §2 warned about** — two elites and a volley at once.
  It stays in the layout because it is now a choice rather than a forced
  pull: the most expensive option on the route, not an unfair one.
- The boss spawns where pack 8 dies and pack 8 carries elite B, **so a
  pool laid in its last seconds is still on the ground when the boss
  appears.** Two existing rules meeting, not a designed moment.

### Aggro, chase and attacks (2026-11-17)

Writing the first combat code (`client/src/combat/rules.js`) forced a set of
rules the sections above left open. The rules themselves are covered by
tests, listed in `test-plan.md`; the two screen behaviors, "Try again" and
the click to target, were checked by hand in the browser instead. WoW and
Fellowship were checked first; what they gave is noted per rule, and it comes
from community wikis and guides, not official documents.

- **Aggro is per pack, and the radius is a square.** One monster inside the
  radius pulls its whole pack. Radius 5 is the larger of the horizontal and
  vertical tile difference — the same ruler as "range N" in Grid movement,
  so closing in diagonally costs the same as closing in straight. A pack is
  what the dungeon places and a pull is what the player drags, and the
  five-target arithmetic above assumes a pack arrives together. WoW's social
  aggro pulls only some mob types together; Fellowship guides describe
  pulling a whole pack with area skills.
- **Monsters chase at the player's speed and never give up.** One tile per
  five ticks, every chasing monster on the same beat, and no leash. Equal
  speed means monster movement adds no balance number, which is what the
  volley rule was written to avoid. A leash that ever fires has to be
  measured from the spawn, and by rough count a two-pack pull needs about
  6–8 tiles of it and a three-pack pull about 15, so a short leash would turn
  the three-pack pull from "the most expensive option" into an impossible
  one. WoW's instance trash generally has no leash; no Fellowship source on
  leashing was found. One consequence: walking away does not escape melee
  monsters, who follow at the same pace.
- **Monsters stop within range 1 and hit on contact.** Range 1 includes
  diagonals, as it does for the player. The first swing lands the tick a
  monster arrives, then one swing every two seconds, each monster on its own
  timer so a pack does not hit in one burst. The timer keeps running while a
  monster is out of range, so stepping away and back neither dodges nor
  refreshes a swing. Damage is the 10 / 20 / 20 / 10 from Tier-1 numbers.
  WoW's auto-attacks stop out of range and resume in range; whether a mob's
  first swing is immediate was not found, so landing it on contact is our
  choice.
- **Defeat stops combat.** At 0 health everything freezes and the screen
  offers "Try again", which rebuilds the corridor at full health. That is
  the Death rule above: no penalty. A Fellowship guide says death costs only
  time.
- **Targeting is a click.** The player clicks a monster to make it the primary
  target, and clicking it again clears it. Any monster can be selected at any
  distance; range matters only when swinging. The spec note treats "no target
  selected" as a real state and says targeting is not optional for the
  bleed-spreading build, so nothing is picked automatically at the start. No
  usable source on target selection was found for either game.
- **Auto-attack numbers are provisional.** It hits the target only, inside
  range 1, the tick it arrives and then every two seconds — "medium" weapon
  speed, given the value 2 s. Damage is **40 per hit**: attack power 10 (the
  placeholder scythe) times a coefficient of 4. Armor reduces it by
  `armor / (armor + 1000)` and the result is rounded to a whole number, so a
  250-armor elite takes 32. Skills will be fitted to the 100 DPS anchor later;
  with auto-attacks alone a two-rat pack takes about 100 seconds and costs
  about 750 health, so the pack-cycle time budget does not hold until skills
  exist.
- **A kill removes the monster and passes the target on.** At 0 health or
  below a monster is removed. If it was the target, the nearest monster that
  already has aggro becomes the target (square distance, ties to the lower
  id), and if none has aggro there is no target. Idle monsters are never
  picked, so finishing one pack cannot wake the next.
- **Order inside a tick:** the player moves, the monsters chase, the monsters
  hit, a remembered skill fires, then the player's auto-attack swings. A
  monster about to die still lands its last hit, and a player killed that tick
  casts and swings nothing.

### Skills, Rage and the GCD in code (2026-11-17)

The first slice of the skill kit is Furious Thrust on key 1, with the Rage bar
and the GCD. The rules are covered by tests (F1–F10 in `test-plan.md`); the
skill bar and the Rage bar were checked by hand in the browser.

- **A press in the last 3 ticks of the GCD is remembered.** It casts on the
  tick the GCD ends, the latest press wins, and an earlier press is dropped.
  Ticks are 0.1 seconds and the browser timer jitters, so without a window a
  slightly early press would be thrown away and a one-second rotation would
  feel stiff. WoW has the same idea in its spell queue window (0–400 ms,
  from a community guide); no Fellowship source on the GCD or an input queue
  was found. Three ticks, 0.3 seconds, is a placeholder to be felt out.
- **The skill slot lights up when a press would be accepted**, three ticks
  before the GCD ends, not when it is over. Lit only after the GCD, it taught
  players to press when it lit and lose their reaction time on every cast:
  measured at about 0.1–0.14 s of a 1.0 s cycle, mashing out-paced pressing
  once per GCD by 10–14%. Lit three ticks early, pressing when it lights
  gives the same pace as mashing (about 1.0 s per cast).
- **A skill that cannot be used costs nothing.** With no target, or a target
  beyond range 1, there is no damage, no Rage and no GCD. A remembered skill
  that has become unusable when the GCD ends is dropped the same way.
- **Furious Thrust hits for 80** before armor, with the same armor rule as the
  auto-attack, and adds 1c. The number is fitted to the anchor: 80 per second
  from the skill plus 20 from the auto-attack is the base DPS of 100, which
  kills a 1000-health rat in 10 seconds, matching the swarm phase in Tier-1
  numbers. It stays provisional until the spender and the area builder exist,
  since the rotation mix will move it.
- **Rage is whole units, capped at 5c, and does not decay.** The backlog has no
  rule for Rage out of combat, so it does not fall for now, and with no spender
  built it simply sits at 5c. Whether Rage should decay out of combat is open.
  (Overhead Slam now spends it, see below; the decay question is still open.)

### Overhead Slam in code (2026-11-17)

The single-target spender is on key 3 (slot 3, so slot 2 stays empty until Brutal
Swing). It is covered by tests F11–F18 and was checked by hand in the browser. The
spec said only "damage scales with the points spent on a smooth curve, numbers TBD".

- **It spends every whole point held and needs at least 1c.** That is the existing
  rule (spenders consume whole points, a leftover half point stays on the bar). With
  no target, a target beyond range 1, or under 1c, nothing happens and the GCD is not
  spent, the same as Furious Thrust. A remembered Slam reads the Rage held when it
  fires, not when the key was pressed.
- **Damage is `200 × n^0.6` before armor** for `n` points spent, rounded: 200, 303,
  387, 459, 525 for 1c to 5c. The curve is concave on purpose: each extra point adds
  less than the one before.
- **Why concave.** A cycle of `n` Furious Thrusts and one Slam takes `n + 1` GCDs, so
  what matters is damage per GCD, `(80n + slam(n)) / (n + 1)`. With this curve that is
  140, 154, **157**, 156, 154 for 1c to 5c: the best use is around 3c, and waiting for
  5c costs about 2%. The spec asks that holding for 5c should not always be the right
  call. A straight line would fail that. WoW's Eviscerate is roughly a base plus a
  fixed amount per point, and the community analyses found a 5-point finisher is the
  most efficient one, with 4 points used only to avoid wasting a builder at the cap.
  The options shown were this curve, a straight line (120 per point, 5c best at 167
  per GCD) and a square-root curve (2c best at 195, 5c clearly worse); the author
  chose this one. No Fellowship source on combo-point scaling was found, so that half
  of the comparison is missing.
- **Effect on the base DPS.** Pressing only Furious Thrust is still the anchor of 100
  DPS. A 3c cycle gives about 157 per GCD plus 20 from the auto-attack, about 177 DPS.
  The numbers are provisional placeholders (the balance numbers are the assistant's
  recommendation for the author to adjust).
- **Still open:** the 5c-rewarding talents (tier 3a refund and tier 5a always-crit)
  may tilt the choice back toward 5c. That tension was already listed under the talent
  tree and is not settled by this curve.

### Brutal Swing in code (2026-11-17)

The area builder is on key 2 (slot 2). It is covered by tests F19–F26 and was checked by
hand in the browser. The screen shows the six tiles it would hit as a dashed outline, so
the player can see why facing matters.

- **Area and cap, as the spec had them.** Six tiles: three wide, two rows ahead, in the
  direction the player faces. At most 5 enemies are hit. Each enemy hit adds 0.5c.
- **One hit is 40 before armor**, half of Furious Thrust. That is the "AoE efficiency 0.5"
  from Tier-1 numbers: two enemies hit equal one Furious Thrust in damage and in Rage, which
  is the break-even point the spec asks for. Five enemies are 200 damage and 2.5c in one GCD.
- **It always fires** (the author's choice, 2026-11-17). With nobody in the area it hits
  no one, adds no Rage and still spends the GCD. Every other skill costs nothing when it
  cannot be used; Brutal Swing has no unusable state, so a wrong facing is paid for with a
  GCD, which is what gives facing a cost. The alternatives shown were "fires only if at
  least one enemy is in the area" and "needs the selected target inside the area". No
  source for either was found: a WoW search on the area builder gave no rule for firing at
  nothing, so this follows the author's reasoning and not a comparison.
- **Which five, when six stand in the area** (the author's choice): the selected target
  first if it is inside the area, then the nearest to the player, then the lower id. Six
  enemies need all six tiles filled, and monsters cannot share a tile, so this only
  matters after merging two packs. Enemies killed by the swing still count for Rage. The
  target moves on only if the target itself died; a swing with no target selected does not
  select anything.
- **WoW and Fellowship, as far as searches found:** WoW's Subtlety area builder (Shuriken
  Storm) makes 1 combo point per target, centered on the caster within 10 yards, so it has
  no facing; it had a target cap earlier, and now reduces damage past 8 targets (Wowpedia).
  WoW's cleave-type effects are directional (a community wiki lists a 70° angle centered on
  the target). A Method guide for Fellowship's Mara recommends her area builder from about 3
  targets, with the single-target builder for 1 or 2; no Fellowship source on its shape was
  found. Brutal Swing is closer to a WoW cleave in shape and breaks even at 2 targets, not 3.
- **Pressing a direction key toward a monster turns the player in place** (already the rule
  for movement, B4 and B10). Surrounded by chasing monsters, that is how the player aims.
- **Still open:** the tier-1 talent that widens the area to three rows is not built. No
  hit feedback yet: nothing on screen shows a swing that missed or how many it hit.

### Whirling Slash in code (2026-11-17)

The channeled area spender is on key 4 (slot 4). It is covered by tests G1–G12 and was
checked by hand in the browser. The bleed was split off and built the next day: see "Whirling
Slash bleed in code" below. This section describes the channel and the heal as they were built first.

- **As the spec had it.** It spends every whole point held (at least 1c, a half point stays),
  needs no target and starts even with nobody in range 1, channels 0.7 s per point, and hits
  every enemy within range 1 (diagonals included, no cap). The range is checked again on every
  tick, so walking out wastes the tick and walking back resumes it. The player can walk during
  the channel, the channel cannot be interrupted, and when it ends the player heals 20 if at
  least one tick connected.
- **One tick per point, every 0.7 s** (the author's choice). The tick interval was the open item
  from Non-blocking, and it equals the per-point duration, so `n` points are exactly `n` ticks.
  The alternatives shown were a tick every 0.5 s (ticks per point 1, 2, 4, 5, 7, uneven, with the
  tail of the last 0.2 s dropped) and a tick on every game tick (35 ticks at 5c). A coarser tick
  means a step out of range costs a whole point of damage, a finer one is gentler on walking.
  For the tier-2 talent that spreads the bleed to two targets per tick, this gives at most 10
  targets over a 5c channel, between the 6 to 8 of one-second ticks and the 14 of half-second ticks
  the earlier note counted.
- **WoW and Fellowship, as far as searches found:** WoW's Rupture bleed ticks every 2 s and lasts
  `points x 2 + 6` s in the Cata-era formula (a community source), and a typical channel such as
  Mind Flay ticks every 0.75 s. Ordinary WoW channels need the caster to stand still and moving
  cancels them, so letting the player walk is the opposite choice, taken from the spec. Fellowship's
  Mara has a bleed with 3 s ticks, but her area spender is not a channel, so no channeled finisher
  was found to compare with.
- **The channel holds the GCD until it ends** (the assistant's decision, stated before the cases
  were approved). The GCD becomes `max(1 s, 0.7 s x points)`, so 1c still holds the normal 1 s.
  "No other skill during the channel" then follows from the GCD with no separate rule, and a press
  in the last 3 ticks is remembered and fires after the final tick, as for any skill.
- **Within one tick:** monsters hit, the channel ticks, a remembered skill fires, the auto-attack
  swings (the bleed ticks were added after the channel on 2026-11-18). The auto-attack keeps
  swinging during the channel, because it does not use the GCD.
- **Numbers (balance, provisional):** 40 per tick per enemy, the same as one Brutal Swing hit,
  because this skill costs Rage and holds the GCD for the whole channel. The completion heal of 20
  is the figure already in the healing table, 3% of the potion's 600. A 5c channel is 200 to every
  enemy in range over 3.5 s, so four rats around the player take 800 in total, against one
  Overhead Slam's 525 on one enemy.
- **Still open:** whether the heal should be larger once the channel has a real cost, and
  feedback for a channel that hit nothing.

### Whirling Slash bleed in code (2026-11-18)

The bleed rides on the channel and goes to the primary target, as the spec had it. It is
covered by tests H1–H15 and was checked by hand in the browser. The monster state has a
`bleed` field, `null` or `{ endTick, nextTickTick }`.

- **When it is applied** (the author's choice): on the press, if the selected target is within
  range 1. With no target, or one out of range, no bleed is applied and the channel, its area
  damage and its heal happen as before. The alternatives shown were applying it when the channel
  ends (a long channel delays the bleed by up to 3.5 s) and on the first tick that hits the target
  (it needs a state for "which tick was first"). The cost of the press rule is that range is
  checked once, so a target that walks away after the press keeps the bleed.
- **Duration** (the author's choice): 4 s plus 2 s per point spent, so 1c is 6 s and 5c is 14 s. The
  alternative was a fixed 12 s, which would make 1c and 5c equal and reward saving Rage for nothing.
  The shape is the same as WoW's Rupture and Fellowship's Mara, where the combo points lengthen the
  bleed. The 4 s and the 2 s are Claude's recommendation.
- **Tick** (Claude's recommendation, provisional): every 2 s for 50, ignoring armor (the Stats rule).
  5c is 7 ticks, 350, which on top of the 200 from the channel puts about 550 on the primary target,
  close to one Overhead Slam's 525. The area damage and the heal come on top of that.
- **Refreshing a bleeding target follows the pandemic rule** (the author's choice, and the rule
  already in Combat rules): the new end is now plus the new duration plus the smaller of the time
  left and 30% of the new duration, and the next tick time is left as it was (the author's choice,
  the WoW way). The alternative, restarting the tick timer, would cost a tick when refreshing just
  before one, which defeats the point of a refresh that loses nothing.
- **Two derived consequences:** a refresh can put the end between two ticks, and then there is no
  partial tick (ticks stay whole, as everywhere else). And once applied, the bleed ticks whether
  or not anyone is in range, which makes walking away from a bleeding monster a real option.
- **WoW and Fellowship, as far as the searches found (search results only, 2026-11-18):** WoW's
  pandemic lets a refresh in the last 30% of the duration lose nothing and caps the total at 130%
  of the base duration, with ticks keeping the old schedule ([Maxroll](https://maxroll.gg/wow/resources/pandemic),
  [Warcraft Wiki](https://warcraft.wiki.gg/wiki/Damage_of_time)). The sources word the carry-over two
  ways, "add the full new duration to what is left, capped at 130%" and "retain the smaller of 30% of
  the base or what is left"; they give the same result. Fellowship's Mara applies a bleed of 77%
  Agility every 3 s for 12 s whose duration grows with the combo points spent
  ([Icy Veins](https://www.icy-veins.com/fellowship/news/mara-hero-dps-guide/)), but
  [Method](https://www.method.gg/fellowship/heroes/mara) lists per-point durations that contradict
  each other (5 s at 1 point, 15 s at 1 point), so no Fellowship number was used. **No Fellowship
  source on how a bleed refreshes was found.** The WoW pages were read as search results, not opened.
- **Within one tick:** monsters hit, the channel ticks, the bleeds tick, a remembered skill fires,
  the auto-attack swings. A monster the channel kills is not bled that tick, and one the bleed kills
  is gone before the remembered skill or the auto-attack picks a target.
- **Screen:** a bleeding monster tile has a small red dot in its top right corner (`tile-bleed`). It
  shows on and off only, not the time left, and it can be seen together with the target outline.
  Skill effects will be drawn later with pixelfx.
- **Still open:** the tier-2 talent that spreads the bleed to a second target per tick, and whether
  such a spread landing on a bleeding monster follows the pandemic rule (the question under
  Non-blocking). The 50 and the 2-second tick are untested balance guesses.

### Trash mechanics (2026-08-27)

Three of the five mechanics are written. **The two boss mechanics are left
for after the dungeon actually runs** — the boss is the last monster in the
chain, so settling it later shakes nothing structural, and fighting the
trash first is what tells us what the boss should be answering.

The three were checked against each other so no two say the same thing:

| Type | What it takes from the player |
|---|---|
| Melee elite A | *Time* — step out, step back. It comes back |
| Melee elite B | *Space* — the ground itself gets worse. It does not come back |
| Ranged | *Nothing to dodge* — the only answer is to remove the source |

**Melee elite A — the spin.** From the moment the pull starts, every ten
seconds it winds up for two seconds and releases a hit covering range 1
around itself. At **35% health it enrages**: melee damage up, and the
interval tightens from ten seconds to six.

Ten seconds is not punishing on its own — only a second or two goes to
backing off, and a five-point Whirling Slash (3.5s) started right after a
release finishes with four seconds to spare. Six is where it bites: the
same channel then lands with half a second left. That is the point. Before
the enrage a five-point channel is free; after it, *"do I have 3.5 seconds,
or do I spend at three?"* becomes a live question every cycle. The hard
constraint holds either way — the window never closes below the channel.

Tying the tightening to health rather than to a timer puts the danger where
the pull is already hardest: 35% arrives during the single-target finish,
once the swarm is gone.

**Melee elite B — the pools.** At an interval it leaves a lasting pool on
whichever tile it is standing on. Pools expire, and standing in one deals
damage over time — **enough to matter next to other damage, never enough to
kill by itself.**

Pools expire rather than lasting the pull, because permanent ones would be
a soft enrage, and this design has now rejected that three separate times.
The run timer and the 8% tier multiplier are the only clocks it gets.
Expiry still leaves real compression: pools laid faster than they expire
overlap.

Two consequences came free, neither one designed on purpose:

- The elite chases the player, so **the pools are laid along the path the
  player walked.** Standing still stacks them on one tile; moving smears
  them across the floor. The pressure is self-inflicted, which is exactly
  the kind of rule a player learns after a few runs.
- Tilling's rift is range 1 around the player, lasts 15 seconds, and
  tier-4b doubles Brutal Swing's Rage inside it. A pool landing in the rift
  asks whether the bonus is worth standing in damage. That collision was
  not invented — it is two existing rules meeting on a grid.

Damage only, no slow. A slow would collide with the ground healing pickups,
which the player has to walk to, and would reduce Sprint to a single
correct answer.

**Ranged — the volley.** Every eight seconds it fires for heavy damage.
**It cannot be interrupted or dodged.** The only answer is to walk over and
cut it down, or to keep paying.

No telegraph. A wind-up for something unavoidable only asks the player to
feel bad for two seconds; a fixed eight-second interval is information they
can plan around. It is also the one trash mechanic that does not touch
positioning, which is worth having when the other two both do.

Distance changes nothing about what it does: **it keeps up its ordinary
attacks like any other monster, and the volley fires every eight seconds
however close the player stands.** Closing the distance pays off only when
the kill lands, and the clock keeps running on the walk over, so the trip
is a cost paid up front.

What was deliberately *not* chosen: a stacking, ever-growing threat. That
turns "should I go?" into "I have to go eventually", which is the choice
disappearing rather than sharpening. A fixed bill keeps the trade honest —
damage per eight seconds against the cost of turning your back on the pack.

Two numbers have to hold for that trade to survive, both for the balancing
pass:

- **A full pull's worth of volleys has to be survivable.** Five of them
  across a forty-second pull must sit inside what the three healing sources
  cover, or "priority target" quietly becomes "mandatory first kill".
- **The ranged type needs low health.** A melee spec with range 1 walks
  there with its back to the pack. If it is not quick to cut down, nobody
  ever goes.

### Tier-1 numbers (2026-09-15, damage 2026-09-26)

None of this has been played. Combat code exists now (2026-11-17) but has four
skills so far (Furious Thrust, Brutal Swing, Overhead Slam and Whirling Slash with its bleed), so every value below is a starting point for the first real
fights. **What is meant to
last is the method** — which number anchors the rest and what gets worked
backwards from what. Values marked *provisional* were set to fill the
table, not argued over, and are the first to move.

**The anchor is one player number.** Base player DPS is **100**: one
target, standing still, no cooldowns. Skill coefficients will be fitted to
it later; monster health is worked backwards from it and from time.

- **Scale: damage in the tens, health in the hundreds to thousands.** A
  base value under 10 collides under the 8% tier multiplier — rounded, two
  tiers come out identical. From 10 up, none do.
- **GCD is 1 second, fixed.** Both references do the same for melee
  builders and spenders (WoW's energy users, Fellowship's melee combo
  specs). Combat rules below had already made the melee GCD fixed; this
  only gives it a value.
- **Time budget: a pack cycle of 30 seconds** — 25 fighting, 5 walking —
  and 60 for the boss. Eight cycles plus the boss is exactly 300 seconds,
  the tier-1 limit.
- **Kill times inside a pack:** the swarm phase lasts 20 seconds, an
  elite adds 10 as a single-target finish, a ranged monster adds 5. Pack
  times come to 20/20/30/30/25/20/35/30. Taken one at a time the run is
  305 seconds, a little over, and merging the four adjacent pairs that
  make five brings it to 205 — **100 seconds saved, which is what the
  damage below has to push back against.**
- **AoE efficiency is 0.5**: under AoE each target takes half the
  single-target rate, so AoE breaks even at two targets — the same point
  where Brutal Swing starts beating Furious Thrust in `spec-note.txt`.

**Health and armor.**

| Monster | Health | Armor | Effective health |
|---|--:|--:|--:|
| Swarm — Field Rat | 1000 | 0 | 1000 |
| Elite A — Thresher | 1600 | 250 | 2000 |
| Elite B — Blight Slug | 1600 | 250 | 2000 |
| Ranged — Seedspitter | 1500 | 0 | 1500 |

- Elites at **twice the swarm** keep "too much health to melt with AoE"
  true: when the swarm dies the elite still has half.
- **Only the elites have armor** (*provisional*). 250 armor is 20%
  reduction, and health drops to 1600 so the kill time does not move.
  What changes is that bleeds, which ignore armor, are worth more against
  the elites than anything else — the target the single-target finish is
  built around. Armor on every monster would make that edge uniform, which
  is the same as not having it.

**Damage.** Set against a single four-monster pack, as §2 required, from
one sentence: *one pack costs about a pickup, two packs cost a potion,
three packs cannot be outlasted with one.*

- **Player health is 1000**, the total a starting tier-1 set gives. How it
  splits between base and gear is still open.
- **A four-monster pack kills in 40 seconds with no healing and no
  armor.** 30 was harsh once health carries from pack to pack; 50 let a
  three-pack pull live on a single potion.
- **Split swarm : elite : ranged = 1 : 2 : 1.** The swarm is described as
  weak melee; the elite is worth two swarm, the same ratio as its health;
  the ranged type's threat already comes from its volley, so its ordinary
  attack stays at swarm level instead of charging for it twice.
- That gives **auto-attacks of 10 / 20 / 10 every 2 seconds.**

**Mechanics** (*provisional*):

| Mechanic | Value |
|---|---|
| Spin (elite A) | 150 per hit, every 10 s; enraged every 6 s, and auto-attack 20 → 30 |
| Pools (elite B) | One every 6 s, each lasting 12 s, 10 per second standing in it |
| Volley (ranged) | 60 every 8 s |

The pool test from §2 passes: standing in pools for a full 30-second pull
costs 420, under half of 1000.

**Healing** (*provisional*):

| Source | Value |
|---|---|
| Potion | 600 (60%), 180 s cooldown |
| Ground pickup | 150 (15%), 60 s cooldown — 2.5 per second against the potion's 3.3 |
| Whirling Slash completion | 20 |
| **Out of combat** | **20% per second** — five seconds of walking refills |

- **Out-of-combat regeneration is a new rule** (2026-09-30). Nothing
  before it said whether health comes back between packs, and without it
  a solo run's damage does not fit inside the potion rule — ordinary
  attacks alone come to over 3100 across the eight packs. "Out of combat"
  means no monster is engaged.
- With it, **every single pack is survivable without a potion**, the
  (3,4) merge ends with 190 left, and (7,8) goes negative — the potion is
  what makes the hardest merge possible.
- **It also makes merging cost more than the damage formula says.** A
  merged pull skips the walk between the two packs, and the walk is where
  health comes back.
- It does not touch the boss rule. The boss appears the instant the last
  pack dies, with no walk in between, so arriving hurt with the potion on
  cooldown is still part of the run.
- The potion now comes up at most twice a run. That second use is a brake
  nobody designed, and it is worth watching once runs are real.

Still open: the pickup's lifetime and spawn distance, the boss's numbers,
and the starting gear — its armor of 2 per slot is two orders of magnitude off
what `armor / (armor + 1000)` needs to mean anything.

### How gear is obtained (2026-08-25)

- **Random drops from dungeon clears.** Chosen over guaranteed rewards
  (nothing to farm for) and over a currency shop (no drop code to write,
  and a whole extra screen).
- Reuses the server-authoritative RNG already required by gear upgrading,
  so it adds a system without adding much new to learn.
- Rates, duplicate handling, and how many items a single clear can yield
  are all **still open** — see §3.

### Gear and UI layout (2026-08-26, revised)

Redrawn after sketching the screens by hand. Several rules below replace
what was written on 2026-08-25.

- Equipment slots: **chest, head, legs, feet, weapon** (5 total).
  Accessories are deferred — they come later as a chance drop from dungeons.
- **Six screens:** main, Shelter, Smithy, Greenhouse, dungeon, ESC menu.
- **The Shelter is storage, inventory, and the gear screen at once.** It
  shows equipped gear and everything carried.
- **The Smithy holds upgrading and crafting.**
- **The Greenhouse is its own screen.** Planting and harvesting happen
  inside it. This **retires** the earlier rule that the farm is worked
  directly on the main screen — drawing it by hand showed that plots big
  enough to matter do not fit next to everything else.
- Main screen: an 18×10 grid holding a 5×5 field, the character, and four
  doors — Dungeon, Greenhouse, Smithy, Shelter.
- Bag: 10×3 = 30 slots.
- **Equipping and upgrading are drag-and-drop, and only that.** One
  interaction across both screens instead of clicking in one place and
  dragging in another.
- The upgrade screen puts before and after side by side so the stat gain is
  visible before committing. **That preview can be computed client-side** —
  the roll and the write stay on the server, so a faked preview only lies
  to the screen.
- Dungeon screen: horizontal progress, a four-direction view that follows
  the character, monsters grouped into packs, and a header with dungeon name,
  time remaining, and tier. Along the bottom: the Rage bar, the skill bar,
  and consumables.
- **Abandoning a run: no record, no reward, straight back to the main
  screen.** ESC does it too.
- **Key rebinding was in the DoD** — moved to §4 on 2026-11-22, see §5.
  Sound and brightness options were cut —
  neither exists to configure. Fourteen bindings: 6 rotation, 1 mobility,
  2 consumables, 4 movement, ESC.

### Art and sound assets (2026-11-22, revised 2026-11-26)

- ~~**Images generated with Google Gemini (Nano Banana) and cleaned up in
  [Pixel Snapper](https://spritefusion.com/pixel-snapper), monsters
  included; sound effects from ElevenLabs.**~~ The 2026-11-22 pick, kept for
  the record. It was chosen because the 3/4-view mockup (2026-11-19) showed
  a hero from a different source with pixels twice the size of the pixelfx
  effects, and a tool that forces one pixel grid aims at that.
- **Revised 2026-11-26** after a solo developer's breakdown of where AI art
  gives a game away ([LJ_GAMES, 2026-11-24](https://www.youtube.com/watch?v=S9cPt7E0W50)).
  The rule taken from it: anything that moves is bought, and AI fills in
  around it. Generated sprites drift between directions, and FarmDelve
  moves in four. The video speaks for someone shipping commercially; what
  follows is cut down to this project's size.

The pipeline:

- **Hero and three monsters: one pack** — top-down, four directions,
  with walk, attack, hit and death. Its palette is the reference everything
  else is matched to. The look the author wants (bold outlines, small
  saturated pixel characters) is a filter for picking the pack; the 3/4 view
  stays.
- **3D was considered and turned down (2026-11-26).** With a camera looking
  down at the grid, `rules.js` and its tests would survive, unlike the side
  view rejected on 2026-11-19. What 3D buys is one model turned to any
  direction instead of a drawing per direction, and buying a pack already
  solves that. What it costs is the whole rendering side: a three.js scene,
  click handling by raycasting instead of the DOM, particles instead of
  pixelfx, and a pixel UI that no longer matches. That does not fit the
  weeks left.
- **Every outside asset must allow a public repository** — CC0, or a license
  that says so in writing. This repository is public, and committing a
  pack's files to it can count as redistributing them, which many paid
  packs forbid. The alternative, keeping paid files out of the repository
  and fetching them from private storage at deploy, was turned down: a day
  of infrastructure work, in exchange for a wider choice of style.
- **UI: a pixel UI kit and a pixel font, applied with CSS `border-image`
  (9-slice).** A plain CSS interface is the most recognizable sign of an
  AI-built web game. Redrawing every screen as images is out of scope;
  skinning the existing panels and buttons changes every screen at once and
  leaves the React layout alone.
- **AI-generated: item and crop icons, and floor tiles if the pack has
  none**, matched to the pack's palette. Several drafts at once, picked by
  the author, rather than one image revised over and over.
- **Skill effects: pixelfx** (see the bleed section above) — four skills and
  the hit, recolored to the pack's palette, since its effects out of the box
  share one look.
- **Sound effects: one large pack.** Generated effects rarely match
  each other in tone; sounds from one pack do. Claude makes a first pass
  matching pack sounds to combat events, and the author replaces the ones
  that sound wrong.
- **Cut:** background music, and building art on the farm and smithy
  screens.
- **The README credits each pack and says which parts are AI-generated.**
- **Timing:** the infrastructure finished on 2026-11-25, so this no longer
  waits for 2026-12-10.

**The pack: Ninja Adventure (chosen 2026-11-26).**
[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) by
Pixel-boy and AAA, the 2026-03-29 release. It is free, and the bundled
`LICENSE.txt` is the full CC0 1.0 text. "Bought" above turned out to be the
wrong word: what the rule needs is a license that allows a public
repository, not a price.

- **Why this one.** Packs whose license forbids redistribution were dropped
  first (Tiny Swords, and most paid packs). The free CC0 candidates left were
  drawn into the same dungeon scene and compared: Ninja Adventure is the
  only one with a hero that has walk, attack, hit and death. 0x72's
  DungeonTileset II has no attack or death and draws characters facing one
  way only; Kenney's Tiny Dungeon has no animation at all.
- **One pack covers almost everything.** Characters, monsters, floor tiles,
  a wood UI theme that can be 9-sliced, life bars, 62 skill icons (each with
  a greyed-out twin), fonts,
  and over 100 sound effects (hits, slashes, menu, coins, game-over and
  success jingles), all in one style. Kenney's CC0 UI and sound packs were
  the fallback and are not needed. AI is left for whatever icons the pack
  lacks.
- **Farm theme.** The dungeon is The Fallow Deep and its monsters are field
  pests, so the cast is picked to match: the hero is `Villager3` (a plain
  farmer), Field Rat is `Mouse`, Thresher is `Larva`, Blight Slug is
  `Slime4`, and Seedspitter is `Bamboo`. The floor is the tilled-soil tile
  from `TilesetField.png` with a few sprouts and stones from
  `TilesetFloorDetail.png`, drawn at 70% brightness and 60% saturation so
  the characters stand out from it. The first floor tried, a stone tile, had
  small bricks at high contrast and read as noise across the grid.
- **What the pack does not have, and the fix.** Monsters only walk, so their
  attack is a short lunge in code, a hit is a white flash, and death is
  pixelfx's `poof`. The 16-pixel hero has no hit frame either, and gets the
  same flash. The pack has a sickle only as a 16×16 item icon, so a 9×11
  in-hand sickle was drawn from that icon's five colors, in the same form as
  the pack's other in-hand weapons.
- **Pixel size.** The sprites checked (the 32-pixel-frame ninja, the 16-pixel
  characters and the monsters) are drawn at the same density, so scaling the
  whole scene by one integer keeps it consistent. The mockups
  used 48-pixel cells (16 × 3); the final cell size is set with the canvas
  work below.
- **Not decided yet:** where the pack's files live in this repository, and
  which of them get committed. That comes with the canvas work.

### Drawing sprites on the dungeon grid (2026-11-19)

- **The DOM grid stays, with one transparent canvas laid over it**
  (`pointer-events: none`). Cells, target selection, borders and range
  outlines stay in the DOM; the canvas draws only sprites and effects, which
  lets pixelfx be used as it is. Rejected: sprite sheets as CSS backgrounds
  (the grid re-renders every 0.1 s, which restarts CSS animations, and large
  effects do not fit in a cell) and drawing everything on the canvas (click
  handling rewritten for no gain).
- **Cells become a fixed whole number of pixels.** Today the corridor is
  fluid: 720 px across 17 cells with 2 px gaps, about 40.5 px a cell. Pixel
  art only stays sharp when scaled by a whole number (16 px drawn at ×3 is
  48 px), so the cell size is set once the pack is chosen.

### Deployment (2026-08-25, replaced 2026-11-20)

- ~~**Render or Railway.**~~ The 2026-08-25 pick, kept for the record: both
  run a normal always-on Express server with PostgreSQL alongside, which
  suits this project better than a serverless host.
- **Replaced by AWS on 2026-11-20**, as the last step of the infrastructure
  plan below. A managed host would have deployed sooner; AWS was chosen
  because deploying there is itself part of what this portfolio shows.

### Infrastructure (2026-11-20)

The plan that replaced "keep adding game features" as the next priority.
One branch and one pull request per step, merged only when CI is green.

1. **CI (GitHub Actions)** — done 2026-11-20. One job builds, lints and
   tests the client; the other starts a PostgreSQL service container, loads
   `schema.sql` and `seed.sql`, and runs the server tests. A ruleset blocks
   merging into `main` unless both pass.
2. **TypeScript on the server** — done 2026-11-22. `strict` from the start;
   files converted one at a time with `allowJs` on, and it was switched off
   once every file was `.ts`. `tsconfig.json` type-checks everything including
   the tests (vitest strips types without checking them), and
   `tsconfig.build.json` extends it without the tests to emit. CI runs both. `tsc` builds to `dist/`, and that is what runs
   (Node can run `.ts` directly but does not type-check it, so CI runs the
   build). Query results are typed with a generic per query
   (`pool.query<{ slot: string }>`) — a promise about the row's shape, not a
   runtime check; runtime validation was judged too much for this size.
   **The client stays JavaScript.**
3. **Docker** — done 2026-11-22. A three-stage `Dockerfile` (client build,
   server build, run on `node:26-slim` as the `node` user with production
   dependencies only) and `compose.yaml` with PostgreSQL 17. The schema and
   seed load through the image's `/docker-entrypoint-initdb.d` on the first
   start; the health check asks over TCP because the image's init server
   listens on the Unix socket only and would report ready too early. The
   database port is not published. Express now serves the built client from
   `client/dist` — moved up from the AWS step so that the image is the whole
   app. No catch-all route: the client has no URL routing.
4. **AWS** — done 2026-11-25, live at
   https://d3vo9j7lhnrych.cloudfront.net. A billing alarm went up before
   anything else; secrets stay out of the repo; the database port is not
   public. Decided 2026-11-23: one EC2 `t4g.micro` in Sydney running the
   existing `compose.yaml` (app and PostgreSQL containers), about $13 a
   month, so the $120 credit lasts roughly nine months. HTTPS through
   CloudFront on its default `*.cloudfront.net` domain, with caching off
   for `/api` — a Free plan account could use it after all, so the plain
   HTTP fallback was not needed. CI pushes an arm64 image to GHCR and the
   server pulls it. **Not done: automated deploys.** The plan said deploys
   would use OIDC rather than stored keys; there is no deploy job at all
   yet, so no AWS key exists anywhere, and a new version is pulled onto the
   server by hand. Settings and teardown: `docs/deploy.md`.

Out of scope for this plan: an ORM, migrations, login, monitoring.

### Guest players (2026-11-23)

Every browser gets its own player without signing up. Needed before the
deployment: with every request running as player 1, strangers on the public
URL would share one save and overwrite each other, and the leaderboard in
§5 would rank a single player.

- **Rejected: one shared save, reset daily.** Cheaper, but it leaves the
  leaderboard meaningless and visitors still collide.
- **Identity:** a random UUID in `player.guest_token`, not the player id.
  An id counts up, so the next cookie would be guessable.
- **Transport:** an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in
  production. Page scripts cannot read it, so an XSS bug cannot leak it;
  `Lax` keeps it off POSTs started from other sites. Chosen over a token
  in `localStorage`, which scripts can read. This identifies a browser, it
  does not authenticate a person.
- **Creation:** `POST /api/guest`, called by the client when a game route
  answers 401. Limited to five per IP address per hour. **Rejected: one per
  IP**, because homes, offices and mobile carriers share one public IP,
  and the second person in a house would be locked out. An attacker who
  keeps changing IP is not stopped; accepted.
- **Cleanup:** once a month, delete guests whose `last_seen_at` is more
  than 30 days old. Every request that passes the cookie check moves
  `last_seen_at` forward. Runs as a cron job on the instance since
  2026-11-25 (`docs/deploy.md`).
- **Starting state:** the database function `create_player()`, so the seed
  and the server cannot drift apart.

### Persistence (2026-08-25)

- Crop growth is stored as a `planted_at` timestamp. "Grown or not" is
  **computed on read, never stored**, so the database cannot hold a
  contradictory state.
- Time comes from the **server clock** (`NOW()`), never the browser.
- Timestamp columns use `timestamptz`.
- A `TIME_SCALE` env var speeds up growth for demos and development.
  Per-crop growth durations live in the database, not in env.

### Scythe resource (2026-08-25)

- **Combo-point model** — basic skills build points, a finisher spends them.
  No separate resource pool on top of it.
- Named **Rage**, borrowed straight from WoW, and shown as a **red bar**.
- Planned minimum: one single-target builder and one AoE builder, mirroring
  WoW Subtlety rogue's Backstab / Shuriken Storm split.
- **Max 5 combo points.** Spenders always consume every point held, and
  their effect scales with how many were spent.
- **Spenders consume whole combo points only.** Holding 2.5 and pressing a
  spender uses 2 and leaves the half point on the bar, where the next
  builder tops it up. Keeps spender power defined on integer steps and
  makes the leftover read as carry-over rather than waste.
- **The AoE builder generates 0.5 per target hit**, deliberately making it
  a waste on a single target: it only beats the ST builder from two targets
  up. Stored internally as integer units (see below), never as a float.
- **The AoE builder caps at 5 targets** (2026-08-26). Five targets is 2.5
  combo points, so a single swing can never fill the bar however big the
  pack is — it takes two. This closes the open worry noted in
  `spec-note.txt`. The cap belongs to the base skill, not to a talent.
- A **mobility skill is in**, on top of the four skills and the cooldowns.
- Bleed starts single-target only; spreading it to nearby enemies is a
  **talent tree** entry, not a baseline effect.
- **The bleed rides on the AoE spender**, applied to the primary target.
  That deliberately gives the AoE spender a reason to be pressed in single
  target, and gives the talent tree somewhere to grow.
- Button budget restated: **6 rotation buttons plus a mobility skill.**
- Full skill list lives in `spec-note.txt`.
- Crossbow and Watering Can resources are intentionally **not decided** —
  the DoD only covers the Scythe, and WoW itself gives each spec a
  different resource.

### Combat rules (2026-08-24)

- Melee and ranged: fixed GCD.
- **Auto-attacks generate no Rage** (2026-08-27). They hit the primary
  target only, inside range 1. Attack speed — hits per second — is a
  property of the weapon, not a stat gear rolls.
- That single rule is what settles haste for good. If a faster auto-attack
  cannot change the rotation, haste is arithmetic, and arithmetic has one
  right answer. See Stats below, which reached the same place from the
  fixed GCD.
- Control spec: haste reduces the GCD, and DPS rises with it. No
  auto-attack, so its base haste starts higher than the other two.
- Haste affects the GCD only. Faster DoT ticks are a control-spec talent,
  not a base effect of haste.
- Skill budget: 4 skills plus 1–2 cooldowns per spec, 6 buttons max.
- DoT refresh follows WoW's pandemic rule.
- Stat system is deliberately small — see below. The 2026-08-24 wording
  ("primary stats only, no secondary stats") was **too strong**: critical
  strike is in, everything else stayed out.

### Stats (2026-08-26)

- Four stats: **attack power** on the weapon, **health** and **armor** on
  the four armor slots, and **critical strike as a secondary stat on every
  slot**. Critical strike is what makes two items of the same slot worth
  comparing.
- **Haste is out of scope.** Melee runs a fixed GCD and the DoD covers the
  Scythe only, so haste would be a dead stat on the one spec being built.
  It stays in the design for the Watering Can, which exists on paper.
- **Percent stats share one formula:** `value / (value + K)`.
  - Armor: `armor / (armor + 1000)`. Being a division it cannot reach
    100%, so no separate cap rule is needed.
  - Critical strike: same shape, K still open.
  - WoW and Fellowship both use banded diminishing returns instead. WoW
    takes no penalty to 30% and then 10/20/30/40/50% by band
    ([Warcraft Wiki](https://warcraft.wiki.gg/wiki/Combat_rating_system),
    patch 9.0.1 table; the page is marked outdated). Fellowship gives full
    value to 10% and less past it, but its sources disagree on the floor
    past 25%: 0.8× on [Fextralife](https://fellowship.wiki.fextralife.com/Stats),
    58.2% on [FellowBIS](https://fellowbis.com/stats-guide). Both checked
    2026-11-03. The division curve is
    diminishing returns as well, smooth rather than stepped. It was chosen
    because one formula covers every percent stat and there is no band
    table to maintain. What it gives up is the "linear until the
    threshold" feel; revisit here if scaling ever reads as flat.
- **Bleeds ignore armor**, as in WoW
  ([Warcraft Wiki](https://warcraft.wiki.gg/wiki/Bleed), checked
  2026-11-03). Monster armor does not scale with
  tier (see Dungeon loop and rewards), so the bleed's edge over direct
  damage is the same at every depth — it grows with the target's armor,
  not with the tier.

### Character progression (2026-08-26)

- **No character level, no XP — gear is the only growth axis.**
  Growth comes from drops, upgrading, and set bonuses. Two axes would split
  the headline feature's weight and force monsters to be tuned against tier
  *and* level.
- Monster scaling therefore rides on the tier multiplier alone.
- **Talent points: one per dungeon tier cleared for the first time, ten in
  total.** The count is simply `highest_tier_cleared` — clearing tier 5
  having skipped 4 still gives five, and going back for 4 later gives
  nothing extra.
- **Dungeon entry: highest cleared + 2**, capped at tier 10. Cleared tiers
  stay open for farming. Entry costs nothing.
- **Talents reset for free, any time outside a dungeon.** Changing them
  mid-fight is blocked so cooldowns and running effects cannot desync.
- **Starting gear: one lowest-rarity scythe at +0.** The four armor slots
  start empty and fill from drops.
- Talent points are **not stored**: the total derives from
  `highest_tier_cleared`, the spend from `player_talent` rows. That is the
  second derived value in this project, after crop growth.
  **The server still has to verify that talents taken never exceed points
  earned** — deriving prevents a contradictory database, not a lying
  client.

### Survivability (2026-08-26)

WoW and Fellowship both design damage dealers on the assumption that a tank
holds aggro and a healer exists. **We have neither, so every monster is
always hitting the player.** Before this was addressed the only answers
were a potion on a 180-second cooldown, a small heal on one spender, and a
talent not everyone takes — nothing to press the moment a fight goes wrong.

- **Healing potions drop on the ground during a fight and are picked up by
  walking over them.** Modeled on Brann's *Dwarven Medicine* from WoW's
  Delves: thrown near an injured player, restoring health on contact.
- **They appear only while the player is below full health**, on a
  cooldown. Nothing is wasted while unhurt, and it works the same in a
  single-target fight as in a pack — unlike a drop tied to kills.
- Stepping on one heals instantly and consumes it.
- **The pickup heal must stay well below the potion per unit of time.**
  Roughly 15–20% against the potion's 60%. If ground pickups outheal
  potions, Potato loses its only purpose and one of the four crops dies.
- Why this over adding a defensive cooldown skill: **it costs no button.**
  The rotation budget stays at six, and recovery becomes a matter of
  *moving* — which finally gives the grid something to do outside of one
  talent.
- It also pays off an earlier decision: Whirling Slash cannot be
  interrupted but **movement during the channel stays free**, so a player
  can walk onto a pickup mid-channel. Two rules that were set separately
  turn out to combine.
- Remaining numbers — cooldown, heal amount, how long a pickup lingers, and
  how far from the player it lands — are open (see §2).

### Damage events (2026-08-26)

Seven fields per damage instance: timestamp, source skill id, target,
amount, whether it crit, direct hit or DoT tick, and **whether armor
applied**. That last field is not the same as direct-vs-tick, because
bleeds bypass armor. Storing combat logs server-side remains out of scope —
this lives in client memory, and only the shape had to be settled early.

### Scythe talent tree (2026-08-26)

- **Five tiers, one pick per tier, two points each** — exactly the ten
  points available.
- **Thirteen talents.** Having more talents than points is the whole point:
  with ten of each, every player ends up with the same build and the tree
  is just an unlock list.
- Selection rule: **a talent has to change the rotation.** Flat number
  increases are arithmetic rather than a choice, and arithmetic has one
  right answer.
- Full list lives in `spec-note.txt`.

---

## 2. Open questions

**Nothing in the design blocks code any more** (2026-08-27). The upgrade
slice has its seven tables named — see `data-model.md` — and gold is a
column on `player`. Scaffolding landed 2026-08-28, and the upgrade and
equipping slices are built on it.

Blocking the dungeon, not the code:

- **The two boss mechanics.** Deliberately parked until the trash is
  playable — see Trash mechanics above. The hard constraint carries over:
  Whirling Slash cannot be interrupted, so anything dodge-or-die has to
  leave a window wider than a 3.5-second channel.
- ~~**Dungeon grid size**~~ — **settled 2026-09-10.** A corridor nine
  tiles tall that scrolls horizontally, sixteen tiles on screen, and a
  volley range of 8 that lands on the screen edge. See Dungeon space
  above.
- ~~**Pack composition**~~ — **settled 2026-09-10.** Eight packs, 22
  monsters, laid out so that four adjacent pairs add to exactly five. See
  Pack layout and chain pulling above. **The counts stay provisional until
  tier-1 numbers exist** — whether 22 fits inside five minutes depends on
  what dies how fast.
- ~~**Tier-1 monster numbers**~~ — **settled 2026-09-15 and 2026-09-26,
  values provisional.** See Tier-1 numbers above. The reasoning that set
  them is kept below. Health, armor, damage, plus the intervals
  and damage for the three mechanics now written (spin, pools, volley).
  Two things to work backwards from:
  - **Time.** Tier 1 allows five minutes, and eight packs plus a boss have
    to fit inside it. The target: **taken one pack at a time the run
    should be tight or a little over, and merging is what buys the
    margin.** Otherwise chain pulling is a convenience rather than the
    skill the layout is built around. That is what sets trash health.
  - **Damage.** Per-monster melee has to stay low, because what the player
    actually absorbs is `melee × monsters attached`, and a merged pair runs
    five to seven deep.
    Difficulty should come from pack size and composition, not from any one
    monster hitting hard — the same shape WoW Mythic+ uses, where a single
    trash mob is trivial and the pull is what kills. It also ties damage to
    survival: clearing a pack faster means taking less, so AoE throughput
    doubles as a defensive stat.
    **The numbers are set against a single pack, not a merged pair** — up
    to four attached rather than seven. Balancing for seven would leave
    one-at-a-time pulling so safe that merging costs nothing, and the
    choice collapses. Setting them at four is what puts the two pressures
    in opposition: **the clock pushes toward merging and the damage
    formula pushes away from it**, and every adjacent pair asks which one
    wins.
  *Blocks: any real balancing.*
  Two constraints are already fixed by the mechanics: the pools may not
  kill on their own — a rough test is surviving a full pull standing in
  them without dropping past half health — and a pull's worth of volleys
  has to sit inside what the healing sources cover.
  **Both survive chain pulling.** The layout never puts two ranged types
  or two elite Bs in adjacent packs, so no merge doubles either source —
  reaching two would take a three-pack pull, which the five-target cap
  already discourages.

Non-blocking:

- **Whirling Slash tick interval.** *Settled 2026-11-17: one tick per
  0.7 s, one per combo point; see "Whirling Slash in code".* It was open
  because the tier-2 talent (bleed spreads to two targets per tick) had
  no defined strength without it. Half-second ticks would reach ~14
  targets over a five-point channel and one-second ticks 6–8; the chosen
  tick reaches 10.
- Whether a spread bleed landing on an already-bleeding target follows the
  pandemic rule.
- **The three healing sources have to be balanced against each other** —
  *provisional values set 2026-09-26, plus a fourth source, out-of-combat
  regeneration; see Tier-1 numbers above.* Still open: the pickup's
  lifetime and spawn distance. The original question:
  the potion (60%, 180s shared cooldown), ground pickups (~15–20%, on a
  cooldown, only while injured), and Whirling Slash's completion heal.
  Open numbers: the pickup's cooldown, heal, lifetime, and spawn distance;
  and the channel heal's amount. **The constraint on all of them is the
  same — none may outheal the potion per unit of time, or Potato has no
  reason to exist.** The channel heal's *condition* is settled (2026-08-27):
  it lands only if at least one tick connected, so walking away from
  everything and finishing the channel heals nothing. Without that, backing
  out of the elite's spin would have been rewarded rather than paid for.
- ~~Whether attack speed varies by scythe~~ — **settled 2026-08-27: fixed
  for the weapon type.** The scythe is medium because its kit is channelled
  AoE — a slow swing would make that rotation sluggish; an axe would be
  slow. Speed follows the role the weapon is built around, not how heavy it
  looks. Speed belongs to the weapon type, not the item, so it is a code
  constant and
  `gear_template` gets no column. Both references point the same way — WoW
  had to invent normalization precisely because per-weapon speed distorted
  ability damage, and its fix was to treat speed as a property of the
  weapon *type*; Fellowship drops per-weapon damage entirely and makes
  attack speed a stat. The decisive argument is ours though: skills scale
  off attack power rather than weapon damage, and auto-attacks generate no
  Rage, so speed would only move auto-attack DPS — a job attack power
  already has. Two knobs doing one job means one of them is dead.
- Tier-3 A and tier-5 A both reward holding to five combo points, which
  cuts against Overhead Slam's deliberately smooth curve. Intended synergy,
  or move one of them?
- Names for the thirteen talents.
- Critical strike's K value. (Base GCD settled 2026-09-15: 1 second.)
- Starting scythe's base stats. **A placeholder went into the database on
  2026-08-28** — 10 attack power, everything else zero. Real
  numbers wait on monster health, since "what dies in 40 seconds" is what
  sets them.
- ~~Save timing during a dungeon run~~ — **settled 2026-09-14.** The server
  writes twice, at entry and at completion, and takes nothing in between, so
  there is no frame to save. A run whose browser closed stays `ongoing` until
  the next entry closes it as `failed`, timed at `LEAST(now(), start_time +
  time_limit)` so neither a three-day run nor a future `end_time` can be
  recorded. **Resuming was considered and dropped**: keeping pack progress is
  cheap, but closing the cheese it opens — quit at a bad pull, return at full
  health — would require health, cooldowns and positions, which is the mid-run
  saving already rejected. See `api-note.md`.
- Drop details — per-tier rates, duplicate handling, how many items one
  clear can yield.
- Greenhouse screen contents. The grid size itself is settled — 25 plots.
- ~~Pandemic formula specifics.~~ Settled for the single-target bleed on 2026-11-18, see
  "Whirling Slash bleed in code". Only the spread talent's case is still open.
- In-game calendar (days, seasons) or real elapsed time only?
- ~~Farm-themed monster roster~~ — **named 2026-09-30**: Field Rat,
  Thresher, Blight Slug, Seedspitter. Each name hints at its mechanic. The
  boss is still unnamed.

---

## 3. Backlog

### Farm

- [x] Crop growth times
- [x] **Field grid size** — 5×5, settled 2026-09-03
- [x] **Planting and harvesting interactions** — per-plot, one POST each
- [x] **Where seeds come from** — harvesting returns them
- [ ] The Greenhouse screen's contents

### Combat

- [x] Scythe skill list — see `spec-note.txt`
- [x] Skill resource system — Rage, combo-point model
- [x] Scythe talent tree — thirteen talents, five tiers
- [x] Skill shapes and ranges in tiles — meters dropped
- [x] Auto-attack rules — primary target only, generates no Rage
- [x] **Aggro, chase, monster attacks and defeat** — built and tested
      2026-11-17, see "Aggro, chase and attacks"
- [x] **Player auto-attack and click targeting** — built and tested
      2026-11-17, numbers provisional
- [ ] Skills, Rage and the trash mechanics in code — Furious Thrust, Brutal
      Swing, Overhead Slam, Whirling Slash (channel, heal and bleed), the
      Rage bar and the GCD are built (2026-11-17 and 2026-11-18); the bleed
      spread talent, the cooldowns, Sprint and the trash mechanics are not
- [x] **Trash mechanics** — spin, pools, volley
- [ ] Names for the thirteen talents (owner: Jihwan) — *outside the DoD
      since 2026-11-22*
- [ ] The two boss mechanics — *outside the DoD since 2026-11-22*
- [x] **Monster base numbers and roster** — trash only, provisional,
      2026-09-30. The boss waits on its mechanics
- [ ] Crossbow skill list *(outside the DoD — paper only)*
- [ ] Watering Can skill list *(outside the DoD — paper only)*

### Data model

Table list is settled — see `data-model.md`. What is left:

- [x] **Column names for the upgrade slice** — seven tables, 2026-08-27
- [x] **Where gold lives** — a column on `player`
- [ ] Column names for the remaining three tables, slice by slice. Fifteen
      of eighteen are built: seven from upgrading, three from the farm, five
      from the dungeon
- [x] **Save timing strategy** — settled 2026-09-14, see §2 above
- [ ] **Drop details** — per-tier drop rates, duplicate handling, how many
      items one clear can yield. Recommendation on the table: roll once and
      pick a single winner by weight, rather than rolling each item
      independently, so reward volume stays predictable.

### Progression

- [x] Character growth model — gear only, no character level
- [x] Talent points — one per first tier clear, ten total
- [x] Dungeon entry rules — highest cleared + 2
- [x] **Gear upgrade system design** — specified 2026-08-26

### Systems

- [x] Definition of Done (see §5)
- [x] UI wireframes — hand-drawn on paper 2026-08-26
- [x] Project scaffolding — Express, React, PostgreSQL wired together. Not
      a design item, but it is the other thing standing between here and
      the first line of code
- [ ] REST API endpoint list — the upgrade endpoint first, since it carries
      the server-authoritative roll
- [ ] Accounts and login (see §4 — deferred)
- [ ] **Walking into buildings on the main screen** — added 2026-09-08.
      Zones are entered by clicking them; walking a character into a door
      reads better. Parked deliberately: the dungeon needs tile movement
      anyway (see Grid movement above), and building it there first means
      building it once. Ours stays four-directional and tile-based, so it is
      Stardew's shape but not its pixel-smooth motion — that was settled for
      the dungeon's sake and the main screen inherits it. Outside the DoD on
      its own.

---

## 4. Deferred / out of scope

- **Farm plot expansion** — good idea, add later.
- **Shops, all of them** (2026-09-03). A seed shop came up first, since gold
  has no sink and buying seeds would have given it one. Equipment and
  cosmetic wardrobe skins are the same shape and are parked with it. Each
  costs a screen plus a purchase API, and none of them unblocks anything
  else — the farm slice needed a seed supply, and harvesting returning seeds
  answers that for nothing. Note this is a scope call, not the rejection in
  §1 *How gear is obtained*: that one turned down a shop as the way to
  **obtain gear**, and its reasoning ("nothing to farm for") does not carry
  over to seeds. Gold gets its sink from upgrade costs instead (see §1).
- **Accessory gear slots** — added later as a chance drop from dungeons.
- **Accounts and login** — **Google OAuth, confirmed as the approach, but
  deferred.** Since 2026-11-23 each browser is a guest player instead (see
  §1 *Guest players*); before that, every request ran as player 1. Auth
  is nearly independent of game logic, so swapping in real login later
  costs little.
- **Durability, entirely** (2026-08-25). Repair costs were cut first, and
  with nothing to pay for repairs, durability itself was cut too. Item
  instances carry no durability column. The rules written on 2026-08-24
  are parked here for whenever it comes back:
  - armor loses durability on taking damage; weapons on skill use, with
    melee and ranged auto-attacks counting too
  - the Watering Can spec pays no weapon repair cost at all
  - **Note:** cutting this removes one of the Watering Can's three
    differentiators. Its identity now rests on no auto-attack and on haste
    scaling the GCD.
- **Combat meter UI** — the meter itself can wait. Only the damage event
  shape has to be settled early.
- **Legendary items** — per-item unique effects, too large a scope.
- **Multiplayer / tank-healer-dps roles** — possible future expansion.
- **Cut from the Definition of Done on 2026-11-22** (see §5 for why):
  - **Dungeon tiers 2 through 10.** The tier rules in §1 stay as designed;
    only tier 1 gets built.
  - **The Scythe talent tree.** Its thirteen talents stay designed in §1.
  - **The boss and its two mechanics.** A tier-1 run is cleared on trash.
  - **Key rebinding.** It was added for fourteen bindings; four skills and
    movement do not need it yet.
- **A commercial (Steam) release** (2026-11-22). The project is built to
  show backend work: an Express server, PostgreSQL, and server-decided
  upgrade rolls. A paid single-player game would want none of that — it
  would mean either paying for a server indefinitely or reworking storage
  for a desktop build — and the content gap to a sellable game is months of
  full-time work. The portfolio version gets finished as designed; a
  release would be a separate project built on top of it. Playtesting the
  public URL with a few friends is in scope.
- **Axe** — dropped as the melee weapon, kept as a candidate for a fourth
  weapon or a talent.
- **Storing combat logs server-side** alongside dungeon records — would
  create real backend work, but expands scope.
- **Sound and brightness options** (2026-08-26). The ESC menu exists for key
  rebinding, which the game genuinely needs with fourteen bindings. Volume
  and brightness were cut the moment it became clear there is no sound
  system to configure and nothing brightness would act on.
- **Interrupting monster casts** (2026-08-26). Deferred because it is three
  features wearing one name: an interrupt skill for every specialization, a
  cast bar UI, and monsters that cast in the first place. Monsters can
  still have telegraphed abilities — they simply resolve, and the answer is
  to move rather than to interrupt. If it comes back, the interrupt should
  not cost a rotation button.
- **Haste as an equipment stat** — see §1 Stats. Kept in the design for the
  Watering Can, which is paper-only.
- **Item level** (2026-08-31). Cut the day the upgrade screen first showed
  it. With every `base_item_level` at 1 the number was the upgrade level
  times five and nothing more, so the screen stated one fact twice and left
  the player to work out how `+3` and `16` were related. Nothing computed
  from it either: stats scale off `upgrade_level` directly, dungeon entry
  off `highest_tier_cleared`. It starts earning its place the day drops
  carry different base levels — and with no migrations, `gear_template` can
  take the column back for the cost of one line.

---

## 5. Definition of Done

Agreed 2026-08-25, **re-scoped 2026-11-22.** The point is to fix the
stopping line before building, so scope stops growing. When this list is
full, the project is done. Anything after it is a separate update, not
"still finishing up."

**Why it was re-scoped:** the 2026-08-25 list was drawn before anything
was built and assumed open-ended time. Two fixed dates now bound it — the
infrastructure deadline (2026-12-10) and a move to Canada in January 2027 —
and the priority since 2026-11-20 is infrastructure over new game features.
The cut keeps one complete loop rather than a wide, unfinished game: a
single tier played end to end shows every system working together, while
nine more tiers would mostly be numbers. Everything cut is listed in §4.

**Game**

- [x] Farm home screen: plots, crops, currency
- [x] **The Greenhouse as its own screen** — added 2026-08-26. Planting and
      harvesting moved off the main screen once the layout was drawn.
- [x] **Gear upgrading** — the headline feature
- [x] **Inventory and equipping gear** — added 2026-08-25. Upgrading means
      nothing without somewhere to equip the result.
- [x] **Persistence** — the farm, stacks and gear live in PostgreSQL, so
      closing the browser loses nothing
- [x] Skill resource system — Rage
- [x] **Scythe specialization only** — four skills, Rage and the GCD are
      built (2026-11-17/18). Crossbow and Watering Can stay on paper. One
      working spec is enough to prove the skill; building three triples the
      schedule. The talent tree was cut on 2026-11-22.
- [x] Monster data — the trash roster (2026-09-30). The boss was cut with
      its mechanics.
- [ ] **A complete dungeon loop, tier 1 only** — enter -> fight -> clear ->
      rewards (gold and crests) -> spend them on an upgrade. Death shows
      "try again" with no penalty. Narrowed from tiers 1 through 10 on
      2026-11-22. The server pays the clear reward since 2026-11-27. Today a
      run can still end in defeat but not in a clear, and the client does not
      call the two dungeon endpoints yet.
- [ ] **Leaderboard** — fastest tier 1 clear. Small, and it is a ranking
      query on the server rather than more screen work. The server stamps
      the start and end times, so the time is its own clock; only "cleared"
      is self-reported.

**Infrastructure** (added 2026-11-22; see §1 *Infrastructure*)

- [x] **CI** — GitHub Actions, merging blocked unless green
- [x] **TypeScript on the server**
- [x] **Docker**
- [x] **Deployed and reachable at a URL, on AWS.** Project 1 was never
      deployed; this one ships.

**Finish** (art and playtesting added 2026-11-22)

- [ ] **Minimum art and sound** — today the screens are icons and plain
      CSS, and that is the first thing an interviewer sees. Split into
      parts on 2026-11-26; the pipeline is in §1 *Art and sound assets*,
      the rendering in §1 *Drawing sprites on the dungeon grid*.
  - [ ] A canvas over the dungeon grid, with cells at a fixed pixel size
  - [ ] The hero and three monsters from one pack (Ninja Adventure, CC0)
  - [ ] A pixel UI kit and font across every screen
  - [ ] Icons, generated to match the pack
  - [ ] Four skill effects and the hit, from pixelfx
  - [ ] Sound effects from the same pack, matched to combat events
  - [ ] Pack credits and an AI disclosure in the README
- [ ] **Playtested** — the public URL played by three to five people
      (friends, family), and what they reported written down along with
      what changed because of it.

- [ ] **Every string the player sees is in English** — fixed 2026-08-31.
      This is a portfolio piece for a job search in Canada, so the screens
      an interviewer opens cannot be in Korean. Written in English from the
      first screen rather than translated at the end: strings sit inline in
      JSX, and the cost of finding them all only grows with the screen
      count. Code comments are a separate question — see below.

- [ ] **Code comments rewritten in English** — added 2026-09-07. Comments
      are written in Korean while building, because they double as the
      author's own notes on a first real pass through this stack. But the
      reasoning they carry is the most valuable thing in this repository,
      and the people it is written for cannot read Korean. Left to the end
      rather than done as we go: the comments are still teaching material
      while the code is being written, and the code is still moving.
      **Not a translation.** What survives is why a choice was made, what
      was rejected, and what constraint it leaves behind. Explanations of
      what a language feature does come out — they were for the author, and
      the reader already knows.
