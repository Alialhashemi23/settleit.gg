# Settle It — Bug Tracker

## Open Bugs

---

### BUG-003 — Navigating away on mobile kills connection and breaks game state

**Status:** Resolved — fixed 2026-05-22  
**Found:** 2026-05-21, real-world mobile test  
**Severity:** High — players effectively kicked from game by switching apps or tabs

**Description:**  
On mobile, if a player navigates away from the game (switches app, locks screen, opens another tab, etc.) and then returns, their socket connection is lost and not restored. They land back on the lobby view with no players shown, while other players are still mid-game. The game continues for others but the returning player is effectively a ghost.

**Fix:** The `tryRejoin()` function in `play/[code]/+page.svelte` was guarded by `!get(roomCode)`, which prevented rejoin when the store still had the old value. Changed the `socket.on("connect")` handler to always call `rejoinSession()` unconditionally — since a socket disconnect removes the player from the backend, any reconnect must re-emit `room:player-rejoin`. The backend `room:player-rejoin` handler was already fully implemented and handles both re-inserting removed players and updating socket IDs.

---

### BUG-001 — Turn handoff breaks question asking

**Status:** Resolved — fixed 2026-05-21  
**Found:** 2026-05-21, real-world test (coworker + home sessions)  
**Severity:** Critical — blocks gameplay

**Description:**  
When the active turn rotates to the next player in the list, that player cannot ask a question. They tap the "Ask a Question" button and nothing happens. The game freezes at that state with no way to proceed.

**Reproduction:**
1. Start a game with 2+ players
2. First player asks a question, it settles
3. Turn passes to the next player
4. Next player taps "Ask a Question" — nothing happens

**Fix:** Added `currentQuestion.set(null)` at the end of the `question:ended` handler in both `play/[code]/+page.svelte` and `host/[code]/+page.svelte`, after saving to history. The picker modal condition `!$currentQuestion` now correctly evaluates to true when the next turn starts.

---

### BUG-002 — Turn reveal overlay highlights wrong player

**Status:** Resolved — fixed 2026-05-22  
**Found:** 2026-05-21, real-world test  
**Severity:** Minor — cosmetic/UX

**Description:**  
The turn order reveal overlay that appears at game start (showing the randomized player order) highlights the current user as "YOU" but does not highlight whose turn it actually is first.

**Fix:** Added a `first` CSS class to index 0 in the reveal list in both `play/[code]/+page.svelte` and `host/[code]/+page.svelte`. The first player also gets a "FIRST" badge (unless they're also the local player, in which case "YOU" already has the amber glow). The `.me` class (local player) and `.first` class (index 0) are independent — both get the amber border/glow.

---

## Resolved Bugs

_See above — all bugs resolved._
