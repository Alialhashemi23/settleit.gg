# Settle It — Bug Tracker

## Open Bugs

---

### BUG-001 — Turn handoff breaks question asking

**Status:** Open  
**Found:** 2026-05-21, real-world test (coworker + home sessions)  
**Severity:** Critical — blocks gameplay

**Description:**  
When the active turn rotates to the next player in the list, that player cannot ask a question. They tap the "Ask a Question" button and nothing happens. The game freezes at that state with no way to proceed.

**Reproduction:**
1. Start a game with 2+ players
2. First player asks a question, it settles
3. Turn passes to the next player
4. Next player taps "Ask a Question" — nothing happens

**Suspected area:** `turn:changed` handler in `play/[code]/+page.svelte` and `host/[code]/+page.svelte` — `showPicker` may not be opening correctly on the receiving end, or the socket event isn't reaching the right client.

---

### BUG-002 — Turn reveal overlay highlights wrong player

**Status:** Open  
**Found:** 2026-05-21, real-world test  
**Severity:** Minor — cosmetic/UX

**Description:**  
The turn order reveal overlay that appears at game start (showing the randomized player order) highlights the current user as "YOU" but does not highlight whose turn it actually is first. The active player highlight (amber border/glow) should mark the player who goes first, separately from the "YOU" marker.

**Reproduction:**
1. Start a game
2. Turn order reveal appears
3. The highlighted item shows the local player ("YOU") but the first player in the turn order isn't visually distinguished as "going first"

**Expected:** The player at position 1 in the list should have a distinct "going first" highlight, regardless of whether they are the local player.

**Affected files:** `play/[code]/+page.svelte` and `host/[code]/+page.svelte` — `.reveal-item.me` class logic.

---

## Resolved Bugs

_None yet._
