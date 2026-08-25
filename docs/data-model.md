# Data Model

Table list for the DoD scope. Names are settled; columns are not written
yet. Each entry says what the table holds, not how it is spelled in SQL.

Last updated: 2026-08-25

## Naming convention

- `snake_case`, singular, no quoted identifiers. PostgreSQL folds unquoted
  names to lower case, so anything else either gets mangled or forces
  double quotes into every query forever.
- `_template` marks a definition: shared by every player, never changed by
  play, edited only when balance changes.
- `player_` marks per-player data: created and changed by playing.
- Avoid PostgreSQL keywords. `player` is used instead of `user` for exactly
  this reason.

---

## Player and progression

| Table | Holds |
|---|---|
| `player` | Gold, highest tier cleared. Account details land here later if login is ever added. |
| `player_talent` | Which talents this player has taken. |

## Items

| Table | Holds |
|---|---|
| `gear_template` | The definition of a piece of gear: name, slot (chest / head / legs / feet / weapon), base stats, base item level, rarity, which set it belongs to. |
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

Item level is **not stored anywhere.** It is computed from the template's
base level plus the upgrade level, the same way crop growth is computed
rather than stored.

## Farm

| Table | Holds |
|---|---|
| `crop_template` | How a crop grows: growth duration, what it yields on harvest and how much, sale value. Points at the `stack_template` rows for its seed and its produce. |
| `player_plot` | One tile of one player's farm: which plot, what is planted in it, and **when it was planted**. |
| `craft_recipe` | One recipe: what goes in, what comes out. Single table, because all three recipes take exactly one ingredient type. Splitting into recipe plus ingredient rows is the textbook shape and is what to do the day a recipe needs two ingredients — not before. |

## Dungeon

| Table | Holds |
|---|---|
| `dungeon_template` | The definition of a dungeon. Only one dungeon is in the DoD, but naming it `template` leaves room to add more without renaming anything. |
| `dungeon_tier_template` | Per tier 1-10: the time limit and the monster scaling multiplier. Ten rows. |
| `monster_template` | Monster definitions: health, attack, mechanics. |
| `dungeon_leaderboard` | The record of a completed run — who cleared which tier in what time. |
| `dungeon_drop` | Which gear can drop at which tier, and at what rate. |

## Upgrading

| Table | Holds |
|---|---|
| `upgrade` | The rules for upgrading: success rate and material cost per step. |

---

## Not in the database

**Skills.** "Generates 1 combo point" could be stored as data, but "hits a
2x3 area in front of the character and scales its duration with combo
points spent" is program logic. Storing it would still leave the code
branching per skill, so there would be two places to maintain instead of
one. Skills live in code as constants; the database only records which
talents a player picked.

## Open

- Column names for every table above.
- Seeds: now confirmed as separate items from produce, so seeds need rows
  in `stack_template` and a link from `crop_template`.
- Drop rates, and what happens on a duplicate drop.
- Whether gold lives as a column on `player` or as a row in `player_stack`
  alongside crests.
