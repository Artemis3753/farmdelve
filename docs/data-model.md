# Data Model

Table list for the DoD scope. Each entry says what the table holds. Columns
are written for the seven tables in the first vertical slice (upgrading);
the other ten get theirs when their slice arrives.

Last updated: 2026-08-27

## Naming convention

- `snake_case`, singular, no quoted identifiers. PostgreSQL folds unquoted
  names to lower case, so anything else either gets mangled or forces
  double quotes into every query forever.
- `_template` marks a definition: shared by every player, never changed by
  play, edited only when balance changes.
- `player_` marks per-player data: created and changed by playing.
- Avoid PostgreSQL keywords. `player` is used instead of `user` for exactly
  this reason.

Four column rules, settled 2026-08-27 while naming the first slice:

1. **A primary key is the table name plus `_id`.** Foreign keys then spell
   themselves — a column pointing at `gear_template` is
   `gear_template_id` wherever it appears, so joins can use `USING` and
   nothing has to be renamed on the way.
2. **A prefix has to earn its place.** Keys travel between tables and need
   one; `gold` and `amount` never leave theirs and do not. `base_` is not
   a prefix in this sense — it means "before upgrading", which is why
   `base_attack_power` has it and `upgrade_level` does not.
3. **When a combination can only appear once, the combination is the key.**
   A player holds exactly one row per stackable, so `player_stack` needs no
   id of its own. A player can own two identical sickles at different
   upgrade levels, so `gear_instance` does.
4. **Role prefixes only where a table is referenced twice.** `upgrade`
   points at `stack_template` for both the crest and the refined material,
   so those become `crest_` and `material_` — the one place rule 1 cannot
   apply.

---

## Player and progression

| Table | Holds |
|---|---|
| `player` | Gold, highest tier cleared. Account details land here later if login is ever added. **No level or XP column** — gear is the only growth axis, and talent points derive from `highest_tier_cleared`. **Gold is a column here, not a row in `player_stack`** (2026-08-27): it has no icon and no max stack, it does not take a bag slot the way potions do, and upgrading, repairing, and shops all read and write it inside transactions where a join would only add a lock to take. A second currency would be the day to reconsider — the same call made for `recipe`. |
| `player_talent` | Which talents this player has taken. |

## Items

| Table | Holds |
|---|---|
| `gear_template` | The definition of a piece of gear: name, slot (chest / head / legs / feet / weapon), base stats, rarity, which set it belongs to. Base stats are drawn from four: attack power (weapon), health and armor (armor slots), and critical strike (any slot). |
| `gear_instance` | One actual piece of gear in the world: which template it follows, who owns it, its upgrade level. **No durability column** — durability is deferred. |
| `player_gear_slot` | What this player currently has equipped. Five rows per player, one per slot, each pointing at a `gear_instance`. The slot count is enforced by the table shape rather than by application code, so equipping two helmets is structurally impossible. |
| `stack_template` | The definition of anything counted rather than owned individually: crops, seeds, potions, crests, upgrade materials. Name, icon, max stack size. |
| `player_stack` | How many of each stackable this player holds. Who, what, how many. |
| `gear_set_bonus` | Per set, what bonus applies at how many equipped pieces. |

Gear is split into template and instance because the two answer different
questions. "A sickle has 50 base attack" is true of every sickle forever;
"this sickle is +7 and belongs to player 1" is true of exactly one object.
Merging them would duplicate the base stats once per owned copy and would
turn a balance change into an update across every row in the game.

**Two values follow this rule:** crop growth (from `planted_at`) and talent
points (total from `highest_tier_cleared`, spent from `player_talent`
rows). A stored copy can
end up disagreeing with whatever produced it; a computed one cannot. Note
what this does and does not buy: deriving keeps the *database* honest, not
the client. The server still has to check that talents taken never exceed
points earned.

## Farm

| Table | Holds |
|---|---|
| `crop_template` | How a crop grows: growth duration, what it yields on harvest and how much, sale value. Points at the `stack_template` rows for its seed and its produce. |
| `player_plot` | One tile of one player's farm: which plot, what is planted in it, and **when it was planted**. |
| `recipe` | One recipe: what goes in, what comes out. Single table, because all three recipes take exactly one ingredient type. Splitting into recipe plus ingredient rows is the textbook shape and is what to do the day a recipe needs two ingredients — not before. |

## Dungeon

| Table | Holds |
|---|---|
| `dungeon_template` | The definition of a dungeon. Only one dungeon is in the DoD, but naming it `template` leaves room to add more without renaming anything. |
| `dungeon_tier_template` | Per tier 1-10: the time limit and the monster scaling multiplier. Ten rows. The multiplier compounds 8% per tier, putting tier 10 at 2.0x tier 1. |
| `monster_template` | Monster definitions: health, attack, mechanics. |
| `dungeon_leaderboard` | The record of a completed run — who cleared which tier in what time. |
| `dungeon_drop` | Which gear can drop at which tier, and at what rate. |

## Upgrading

| Table | Holds |
|---|---|
| `upgrade` | The rules for upgrading, ten rows for +1 through +10: success rate, which crest tier, how many, and the refined-material cost. Rates run 100% / 70% / 40% across the three bands; crest counts run 1-4 within a band and reset when the band changes. |

---

## Columns — first slice (upgrading)

Seven tables. Everything else waits for its own slice.

```
player                            gear_template
  player_id              PK         gear_template_id        PK
  gold                              name
  highest_tier_cleared              slot
                                    rarity
stack_template                      base_attack_power
  stack_template_id      PK         base_health
  name                              base_armor
  icon                              base_crit
  max_stack

gear_instance                     player_stack
  gear_instance_id       PK         player_id           FK ─┐
  gear_template_id       FK         stack_template_id   FK ─┴ PK
  player_id              FK         amount
  upgrade_level

player_gear_slot                  upgrade
  player_id              FK ─┐      upgrade_level               PK
  slot                       ─┴ PK  success_rate
  gear_instance_id       FK         crest_stack_template_id     FK
    (nullable)                      crest_amount
                                    material_stack_template_id  FK
                                    material_amount
```

Notes worth keeping:

- `gear_instance.upgrade_level` and `upgrade.upgrade_level` share a name
  because they are the same idea, but **they are not a foreign key pair.**
  A `gear_instance` starts at 0 and `upgrade` has no row for 0 — the table
  describes the *step from one level to the next*, so it begins at 1.
- `player_gear_slot.gear_instance_id` is the slot's *contents*, not its
  identity: it changes when gear is swapped, and it is NULL for the four
  armour slots at the start. Both disqualify it from the key. A `UNIQUE`
  constraint on it is still worth adding — PostgreSQL permits repeated
  NULLs, so the empty slots are fine, while the same sickle equipped in two
  places at once is not.
- `slot` is a plain value, not a foreign key. Five fixed strings do not
  earn a lookup table.
- Nothing derived is stored: no computed stats, no talent point total, no
  bag position.

## Not in the database

**Damage events.** Seven fields per hit — timestamp, source skill, target,
amount, crit, direct-or-tick, and whether armor applied — but they live in
client memory only. Storing combat logs server-side is deferred; only the
shape had to be settled early, since a DoT tick that loses its source skill
can never get it back.

**Skills.** "Generates 1 combo point" could be stored as data, but "hits a
2x3 area in front of the character and scales its duration with combo
points spent" is program logic. Storing it would still leave the code
branching per skill, so there would be two places to maintain instead of
one. Skills live in code as constants; the database only records which
talents a player picked.

## Open

- Column names for the ten tables outside the first slice.
- Whether `stack_template` needs a kind column — potions, crests, seeds and
  materials sit together undifferentiated. Nothing needs to tell them apart
  until consumable key bindings exist, and adding it now would mean fixing
  the list of kinds now.
- Seeds: now confirmed as separate items from produce, so seeds need rows
  in `stack_template` and a link from `crop_template`.
- Drop rates, and what happens on a duplicate drop.
