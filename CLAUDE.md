# FarmDelve

## Game design decisions

When a combat or stat decision comes up, look up how WoW and Fellowship solved the same
problem before offering options. Topics: stat formulas, resource systems, diminishing
returns, talent structure, combat logs.

- Verify by searching. Do not state what those games do from memory.
- Put the comparison into the options, then ask.

**Why:** both games have refined these problems for years, and the author has played
them enough to have a feel for the result. A decision that comes with a comparison is
easier to justify than a number invented from a blank page.

**The goal is not to copy.** Learn why they did it that way, then decide what to cut
to fit this project's size.

## UI text

The screen is not a spec. Show short labels and numbers, not sentences that explain
the rules.

- Good: `Rage 3/5`, `Try again`. Bad: "Press 1 to use Furious Thrust, which builds rage."
- Explanations of how a rule works belong in `docs/design-backlog.md` or the README.

**Why:** sentence-style instructions on screen are one of the clearest signs that a
web game was written by an AI, and they go stale every time a rule changes.
