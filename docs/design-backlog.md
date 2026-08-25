# Design Backlog

Working document. Tracks what is decided, what is still open, and what is
deliberately out of scope. Updated as design sessions go.

Last updated: 2026-08-25

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
- Growth times scale to dungeon run length: shortest around 5 minutes,
  longest 3–6 hours. Exact numbers still open (see §2).
- Every harvest also yields a small amount of gold. Dungeon completion is
  the main gold source.
- **Seeds are separate items from produce** (2026-08-25), Stardew-style:
  you plant a potato seed and harvest a potato.
- Farm plot expansion: deferred (see §4).

### Consumables (2026-08-25)

- Damage potion: +50% damage, **20 second** duration.
- Healing potion: restores ~60% of health.
- Both potions **share one cooldown: 180 seconds.**
- **No carry limit.**
- Consumables **do not trigger the global cooldown.**

### Crafting (2026-08-25)

- Minimal crafting, three recipes only:
  - 3 Chili Pepper -> 1 damage potion
  - 3 Potato -> 1 healing potion
  - 5 Ironroot -> 1 refined upgrade material
- Reuses the same atomic-transaction pattern as gear upgrading
  (check materials -> consume -> produce, all or nothing).

### Gear upgrading (2026-08-25, revised)

- Both **probability and resource cost**, with probability weighted
  **lower** than resource cost as the limiting factor.
- Certain upgrade materials drop only at specific dungeon tiers, so higher
  upgrades require deeper runs — tuned so grinding does not become
  excessive.
- Item level is a derived value (base level + upgrade count), not a stored
  column.
- Server-authoritative.

### Grid movement (2026-08-25)

- **The world is grid-based**, like Stardew Valley. Positions are tiles,
  not free coordinates, which keeps range and area checks simple.
- Skill areas are written in tiles: the AoE builder hits a 2x3 area in
  front of the character, the mini cooldown covers the 3x3 around it.
- Ranges recorded earlier in meters (4m / 12m / 8m) need converting to
  tiles once tile size is fixed.

### Dungeon loop and rewards (2026-08-25)

- One run is: enter -> fight -> clear -> rewards.
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

### How gear is obtained (2026-08-25)

- **Random drops from dungeon clears.** Chosen over guaranteed rewards
  (nothing to farm for) and over a currency shop (no drop code to write,
  and a whole extra screen).
- Reuses the server-authoritative RNG already required by gear upgrading,
  so it adds a system without adding much new to learn.
- Rates, duplicate handling, and how many items a single clear can yield
  are all **still open** — see §3.

### Gear and UI layout (2026-08-25)

- Equipment slots: **chest, head, legs, feet, weapon** (5 total).
  Accessories are deferred — they come later as a chance drop from dungeons.
- **Inventory is its own tab/screen**, not part of the main view. It shows
  both equipped gear and everything currently carried — enough information
  that it earns a screen of its own rather than a panel on the main view.
- **Gear upgrading is its own tab/screen** as well.
- Main screen holds:
  - the farm plots, with planting and harvesting done **directly on the
    main screen** (no separate farm screen)
  - the character
  - buttons into: Inventory, Upgrade, Enter Dungeon
    (a separate Bag button was dropped — the Inventory tab already covers it)

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
- **The AoE builder generates 0.5 per target hit**, deliberately making it
  a waste on a single target: it only beats the ST builder from two targets
  up. Stored internally as integer units (see below), never as a float.
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
- Control spec: haste reduces the GCD, and DPS rises with it. No
  auto-attack, so its base haste starts higher than the other two.
- Haste affects the GCD only. Faster DoT ticks are a control-spec talent,
  not a base effect of haste.
- Skill budget: 4 skills plus 1–2 cooldowns per spec, 6 buttons max.
- DoT refresh follows WoW's pandemic rule.
- Primary stats only. No secondary/tertiary stat system.

---

## 2. Open questions

Blocking items first — these hold up other work.

- **Skill resource.** Nothing is defined for skills to spend. Without one,
  a rotation is just "press whatever is off cooldown."
  *Blocks: all skill design.*
- **Dungeon run length.** Proposed 5–10 minutes.
  *Blocks: crop growth times, potion cooldown balance.*
- **Damage event shape for the combat meter.** What each damage instance
  records, especially which skill owns a DoT tick. Cheap now, expensive to
  retrofit.
  *Blocks: nothing yet, but must be settled alongside skill design.*
- **Item template vs. item instance split.** A sickle as a type of item is
  not the same row as *this* +7 sickle at 82% durability.
  *Blocks: inventory and upgrade schema.*

Non-blocking:

- Exact crop growth times, once dungeon run length is fixed.
- Whether potion carry stays unlimited. With no cap and a 180s cooldown, a
  player can stockpile and skip farming for many runs — this is the knob to
  turn if the farm-to-dungeon link feels weak in playtesting.
- Save timing during a dungeon run. Writing every frame is not possible;
  what happens if the browser closes mid-run?
- Crit and haste conversion rates (stat point -> effect).
- Base GCD value, and the control spec's haste-to-GCD formula.
- Monster data model: health, armor, damage, per-tier scaling formula.
- Pandemic formula specifics.
- Upgrade system numbers: max level, per-level success rate, material costs.
- Character level and XP, or item level only?
- How talent points are earned.
- Dungeon entry requirements — any tier freely, or clear-to-unlock? Does
  entry consume anything?
- In-game calendar (days, seasons) or real elapsed time only?
- Monster mechanics beyond auto-attacking. Without them, real-time combat
  is half wasted.
- Player movement and controls. Skill ranges (4m / 12m / 8m) imply
  movement exists.
- Farm-themed monster roster: crop creatures, crop thieves, etc.

---

## 3. Backlog

### Farm

- [ ] Fix crop growth times against dungeon run length
- [ ] Plot/grid layout and size
- [ ] Planting and harvesting interactions

### Combat

- [ ] Sickle skill list — 4 skills + 1–2 cooldowns (name, cooldown, effect)
- [ ] Crossbow skill list
- [ ] Watering Can skill list
- [ ] Skill resource system
- [ ] Monster mechanics and roster
- [ ] Movement and controls

### Data model

Table list is settled — see `data-model.md`. What is left:

- [ ] Column names for all 17 tables
- [ ] Save timing strategy
- [ ] **Drop details** — per-tier drop rates, duplicate handling, how many
      items one clear can yield. Recommendation on the table: roll once and
      pick a single winner by weight, rather than rolling each item
      independently, so reward volume stays predictable.

### Progression

- [ ] Character growth model (level/XP vs. item level only)
- [ ] Talent trees and how points are earned
- [ ] Dungeon entry rules
- [ ] **Gear upgrade system design** — headline feature, still unspecified.
      Do not let this slip.

### Systems

- [ ] Definition of Done (see §5)
- [ ] REST API endpoint list
- [ ] Accounts and login (see §4 — deferred)
- [ ] UI wireframes — hand-drawn on paper first (owner: Jihwan)

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

- [ ] **Inventory and equipping gear** — added 2026-08-25. Upgrading means
      nothing without somewhere to equip the result.
