# Design Backlog

Working document. Tracks what is decided, what is still open, and what is
deliberately out of scope. Updated as design sessions go.

Last updated: 2026-08-31

---

## 1. Decided

### Project

- Single-player. No multiplayer, no co-op.
- Real-time action combat (player presses skills, builds a rotation).
- Three weapon specializations: Sickle (melee), Crossbow (ranged),
  Watering Can (control / debuffs).
- Stack: React, Node.js/Express, PostgreSQL.
- Leaderboard ranked by highest dungeon tier cleared.
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
  is the **Solid Sickle**.

- The count resets at each band, but the crest tier rises, so the real cost
  keeps climbing. Higher crests only drop in deeper dungeons, which is what
  gates deep upgrading.
- Every upgrade also spends **one refined material** (5 Ironroot each).
  That is what keeps the farm attached to the headline feature — without
  it, Ironroot and its recipe have nowhere to go.
- **Failure spends the materials and leaves the upgrade level alone.** No
  downgrade, no destruction. Same reasoning as dying in a dungeon: this
  project does not punish.
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
- **The Sickle's range is 1**: every adjacent tile, diagonals included.
  Diagonals count as distance 1 because excluding them would leave a
  monster standing at arm's length untouchable, and the player shuffling
  sideways to line up. That is fussiness, not tactics.
- Range 1 draws the same shape as a 3x3 centered on the player, so **the
  elite's spin and the Sickle's reach overlap exactly**: the tile you have
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
  ahead**, based on facing — the only Sickle skill where facing matters,
  and the only one that reaches past range 1. Its six tiles are what make
  the five-target cap mean anything; cutting it to one row ahead would
  leave three tiles and kill the cap. The tier-1 talent widens it to three
  rows ahead. Whirling Slash and Tilling both cover range 1.
- Crossbow and Watering Can ranges stay open — both are paper-only. Rough
  anchor: ranged wants something near 4-6 for "shoots from afar" to read
  at all against a melee range of 1.

### Dungeon loop and rewards (2026-08-25)

- One run is: enter -> clear five pulls -> kill the boss -> rewards.
- **Five pulls of 3–5 monsters each**, along a single vertical route.
  Progress reads as a count — `3/5 pulls` — not a percentage. A percentage
  would only be worth its complexity if there were more pulls than the run
  requires, and on one straight route there is nothing to route around.
- Pulls of 3–5 sit right on Brutal Swing's five-target cap, so one pull is
  exactly what the AoE builder is built to eat.
- **The boss appears the instant the fifth pull dies, on that spot.**
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
  the talent tree get used in all five pulls, not only against the boss.
- **The second elite costs one mechanic and one row of stats, and buys
  variety exactly where the run needs it.** With one elite type, that
  single-target finish is the same fight five times over; with two, the
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
- Players also grow from drops, not just upgrading, so a geared player will
  outpace the curve somewhat in the late tiers. That is intended — it reads
  as "the gear paid off." WoW layers affixes on top of raw scaling to keep
  the pressure on; **we have no affixes, so the tension at depth has to
  come from monster mechanics instead.**

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

Standing next to it stops its ordinary attacks but **not** the volley.
Closing the distance pays off on arrival, before the kill lands — and the
clock keeps running, so arriving is not the same as being safe.

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
- Dungeon screen: vertical progress, a four-direction view that follows the
  character, monsters grouped into pulls, and a header with dungeon name,
  time remaining, and tier. Along the bottom: the Rage bar, the skill bar,
  and consumables.
- **Abandoning a run: no record, no reward, straight back to the main
  screen.** ESC does it too.
- **Key rebinding is in the DoD.** Sound and brightness options were cut —
  neither exists to configure. Fourteen bindings: 6 rotation, 1 mobility,
  2 consumables, 4 movement, ESC.

### Deployment (2026-08-25)

- **Render or Railway.** Both run a normal always-on Express server and
  offer PostgreSQL alongside it, which suits this project better than a
  serverless host. Final pick deferred until there is something to deploy.

### Persistence (2026-08-25)

- Crop growth is stored as a `planted_at` timestamp. "Grown or not" is
  **computed on read, never stored**, so the database cannot hold a
  contradictory state.
- Time comes from the **server clock** (`NOW()`), never the browser.
- Timestamp columns use `timestamptz`.
- A `TIME_SCALE` env var speeds up growth for demos and development.
  Per-crop growth durations live in the database, not in env.

### Sickle resource (2026-08-25)

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
  the DoD only covers the Sickle, and WoW itself gives each spec a
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
  Sickle only, so haste would be a dead stat on the one spec being built.
  It stays in the design for the Watering Can, which exists on paper.
- **Percent stats share one formula:** `value / (value + K)`.
  - Armor: `armor / (armor + 1000)`. Being a division it cannot reach
    100%, so no separate cap rule is needed.
  - Critical strike: same shape, K still open.
  - WoW and Fellowship both use banded diminishing returns instead — WoW
    takes no penalty to 30% and then 10/20/30/40/50% by band, Fellowship
    gives full value to 10% and 0.8× past 25%. The division curve is
    diminishing returns as well, smooth rather than stepped. It was chosen
    because one formula covers every percent stat and there is no band
    table to maintain. What it gives up is the "linear until the
    threshold" feel; revisit here if scaling ever reads as flat.
- **Bleeds ignore armor**, as in WoW. Deeper tiers mean more monster armor,
  so this is what keeps the Sickle's bleed relevant at depth.

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
- **Starting gear: one lowest-rarity sickle at +0.** The four armor slots
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

### Sickle talent tree (2026-08-26)

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
- **Dungeon grid size**, which the ranged type's range depends on. A range
  longer than the visible board means being shot from off-screen; a short
  one makes walking over cheap. Since that walk is the whole trade the
  ranged type offers, its range is structure, not a balance number — and it
  cannot be picked before the board is.
- **Pull composition.** Three to five monsters, but not which. Two elite
  types in one pull means two timers plus a volley running at once; if
  anything is going to feel unfair, it starts here rather than in any one
  mechanic's numbers.
- **Tier-1 monster numbers** — health, armor, damage, plus the intervals
  and damage for the three mechanics now written (spin, pools, volley).
  Two things to work backwards from:
  - **Time.** Tier 1 allows five minutes. Five pulls at roughly 40 seconds
    plus a boss fills most of it, so "what dies in 40 seconds to a starting
    sickle" sets trash health.
  - **Damage.** Per-monster melee has to stay low, because what the player
    actually absorbs is `melee × monsters attached` and pulls run 3–5 deep.
    Difficulty should come from pack size and composition, not from any one
    monster hitting hard — the same shape WoW Mythic+ uses, where a single
    trash mob is trivial and the pull is what kills. It also ties damage to
    survival: clearing a pack faster means taking less, so AoE throughput
    doubles as a defensive stat.
  *Blocks: any real balancing.*
  Two constraints are already fixed by the mechanics: the pools may not
  kill on their own — a rough test is surviving a full pull standing in
  them without dropping past half health — and a pull's worth of volleys
  has to sit inside what the healing sources cover.

Non-blocking:

- **Whirling Slash tick interval.** `0.7s per combo point` is fixed, the
  tick rate is not — and the tier-2 talent (bleed spreads to two targets
  per tick) has no defined strength until it is. Half-second ticks reach
  ~14 targets over a five-point channel; one-second ticks reach 6–8.
- Whether a spread bleed landing on an already-bleeding target follows the
  pandemic rule.
- **The three healing sources have to be balanced against each other**:
  the potion (60%, 180s shared cooldown), ground pickups (~15–20%, on a
  cooldown, only while injured), and Whirling Slash's completion heal.
  Open numbers: the pickup's cooldown, heal, lifetime, and spawn distance;
  and the channel heal's amount. **The constraint on all of them is the
  same — none may outheal the potion per unit of time, or Potato has no
  reason to exist.** The channel heal's *condition* is settled (2026-08-27):
  it lands only if at least one tick connected, so walking away from
  everything and finishing the channel heals nothing. Without that, backing
  out of the elite's spin would have been rewarded rather than paid for.
- ~~Whether attack speed varies by sickle~~ — **settled 2026-08-27: fixed
  for the weapon type.** The sickle is medium; an axe would be slow. Speed
  belongs to the weapon type, not the item, so it is a code constant and
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
- Critical strike's K value; base GCD.
- Starting sickle's base stats. **A placeholder went into the database on
  2026-08-28** — 10 attack power, everything else zero. Real
  numbers wait on monster health, since "what dies in 40 seconds" is what
  sets them.
- Save timing during a dungeon run. Writing every frame is impossible; what
  happens if the browser closes mid-run?
- Drop details — per-tier rates, duplicate handling, how many items one
  clear can yield.
- Greenhouse screen contents, and the field's grid size.
- Pandemic formula specifics.
- In-game calendar (days, seasons) or real elapsed time only?
- Farm-themed monster roster: crop creatures, crop thieves, and so on.

---

## 3. Backlog

### Farm

- [x] Crop growth times
- [ ] Field grid size, and the Greenhouse screen's contents
- [ ] Planting and harvesting interactions

### Combat

- [x] Sickle skill list — see `spec-note.txt`
- [x] Skill resource system — Rage, combo-point model
- [x] Sickle talent tree — thirteen talents, five tiers
- [x] Skill shapes and ranges in tiles — meters dropped
- [x] Auto-attack rules — primary target only, generates no Rage
- [x] **Trash mechanics** — spin, pools, volley
- [ ] Names for the thirteen talents (owner: Jihwan)
- [ ] The two boss mechanics — parked until the trash is playable
- [ ] Monster base numbers and roster
- [ ] Crossbow skill list *(outside the DoD — paper only)*
- [ ] Watering Can skill list *(outside the DoD — paper only)*

### Data model

Table list is settled — see `data-model.md`. What is left:

- [x] **Column names for the upgrade slice** — seven tables, 2026-08-27
- [x] **Where gold lives** — a column on `player`
- [ ] Column names for the other ten tables, slice by slice
- [ ] Save timing strategy
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

---

## 4. Deferred / out of scope

- **Farm plot expansion** — good idea, add later.
- **Accessory gear slots** — added later as a chance drop from dungeons.
- **Accounts and login** — **Google OAuth, confirmed as the approach, but
  deferred.** Development runs against a hardcoded player 1 for now. Auth
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

Agreed 2026-08-25. The point is to fix the stopping line before building,
so scope stops growing. When this list is full, the project is done.
Anything after it is a separate update, not "still finishing up."

- [ ] Farm home screen: plots, crops, currency
- [ ] Skill resource system
- [ ] **Sickle specialization only** — skills and talent tree. Crossbow and
      Watering Can are designed on paper but not built. One working spec is
      enough to prove the skill; building three triples the schedule.
- [ ] Dungeon tiers 1 through 10
- [ ] Monster data
- [ ] **Gear upgrading** — the headline feature
- [ ] **Leaderboard**
- [ ] **Persistence** — close the browser, reopen, everything survives
- [ ] **A complete dungeon loop** — enter -> fight -> clear -> rewards
      (gold and crests). Death shows "try again" with no penalty.
- [ ] **Deployed and reachable at a URL.** Project 1 was never deployed;
      this one ships. Target platform still open (see below).

- [x] **Inventory and equipping gear** — added 2026-08-25. Upgrading means
      nothing without somewhere to equip the result.

- [ ] **Key rebinding** — added 2026-08-26. Fourteen bindings is past the
      point where one fixed layout suits everybody.
- [ ] **The Greenhouse as its own screen** — added 2026-08-26. Planting and
      harvesting moved off the main screen once the layout was drawn.

- [ ] **Every string the player sees is in English** — fixed 2026-08-31.
      This is a portfolio piece for a job search in Canada, so the screens
      an interviewer opens cannot be in Korean. Written in English from the
      first screen rather than translated at the end: strings sit inline in
      JSX, and the cost of finding them all only grows with the screen
      count. Code comments stay in Korean — they are for the author, not
      the player.
