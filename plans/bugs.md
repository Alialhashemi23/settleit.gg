# Settle It — Bug Tracker

## Open Bugs

---

### BUG-004 — Phone lock/home screen breaks lobby connection, shows zero players

**Status:** Open  
**Found:** 2026-05-22, real-world mobile test  
**Severity:** High — players re-enter an empty ghost lobby on return

**Description:**  
When a player locks their phone screen or navigates to the home screen while in the pre-game lobby, then returns, their socket connection breaks. The lobby shows zero players even though others are still connected. The room code is visible but state is fully desynced — the player appears to be alone in their own copy of the lobby.

**How it differs from BUG-003:**  
BUG-003 affected the in-game state (active questions, votes, turn order) and was fixed in Phase 7 by wiring `room:player-rejoin` to restore in-game state. The lobby phase (before `game:start`) is a different code path: there is no equivalent full-state restore for the lobby. On reconnect, `room:player-rejoin` fires and the backend re-adds the player and broadcasts `room:updated` — but if the play page component re-mounted or stores were reset before `room:updated` arrives, the player list never re-renders.

**Suspected root cause:**  
The play page may be re-mounting from scratch on reconnect (if `goto('/play/[code]')` fires again), resetting all store state before the rejoin response arrives. Alternatively, the `notInRoom` guard may be triggering during the reconnect window, blanking the UI before the rejoin completes.

**Reproduction:**
1. Host creates room on desktop
2. Player joins on mobile — both see each other in lobby
3. Player locks phone screen for ~5–10 seconds
4. Player unlocks and returns to the browser tab
5. Player's lobby shows 0 players; host's lobby shows correct count

**Fix approach (not yet implemented):**
- Investigate whether the play page re-mounts on reconnect and resets stores prematurely
- Confirm `room:player-rejoin` `room:updated` broadcast reaches the play page while it's still mounted
- Consider including full lobby state (players, room status) in the `room:rejoined` response even when `status === 'lobby'`

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
