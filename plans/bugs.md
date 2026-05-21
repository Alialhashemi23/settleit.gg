# Settle It — Bug Tracker

## Open Bugs

---

### BUG-003 — Navigating away on mobile kills connection and breaks game state

**Status:** Open  
**Found:** 2026-05-21, real-world mobile test  
**Severity:** High — players effectively kicked from game by switching apps or tabs

**Description:**  
On mobile, if a player navigates away from the game (switches app, locks screen, opens another tab, etc.) and then returns, their socket connection is lost and not restored. They land back on the lobby view with no players shown, while other players are still mid-game. The game continues for others but the returning player is effectively a ghost.

**Reproduction:**
1. Join a game on mobile and start playing
2. Navigate away (switch app, lock phone, open another tab)
3. Return to settleit.gg
4. Player sees empty lobby, disconnected from room — other players unaffected

**Expected:** On return, the socket reconnects and re-syncs the player into the current game state (active question, player list, votes, etc.).

**Suspected area:** Socket.IO auto-reconnect is likely firing but the server has no re-join/resync flow — once a socket disconnects, the player is removed and there's no way to reattach. Needs a rejoin mechanism: persist `roomCode` and `playerId` in `localStorage`, detect reconnect, and emit a `room:rejoin` or `room:sync` event to restore state.

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

**Status:** Open  
**Found:** 2026-05-21, real-world test  
**Severity:** Minor — cosmetic/UX

**Description:**  
The turn order reveal overlay that appears at game start (showing the randomized player order) highlights the current user as "YOU" but does not highlight whose turn it actually is first. The active player highlight (amber border/glow) should mark the player who goes first, separately from the "YOU" marker.

**Reproduction:**
1. Start a game
2. Turn order reveal appears
3. The highlighted item shows the local player ("YOU") but the first player in the turn order isn't visually distinguished as "going first"

**Expected:** The player at position 1 (index 0) in the reveal list should be highlighted as "going first", regardless of who the local player is. The "YOU" badge stays, but the amber glow/border should mark the first player in the order, not the local player.

**Affected files:** `play/[code]/+page.svelte` and `host/[code]/+page.svelte` — `.reveal-item.me` class logic. Add a separate `.first` class for index 0.

---

## Resolved Bugs

_None yet._
