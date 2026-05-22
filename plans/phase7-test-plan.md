# Phase 7 — Manual Test Plan

Use two devices (or one device + one browser tab as host, one on mobile as player). You need at least 2 participants to test turns and voting.

---

## 1. Room Code Auto-Format

**Goal:** Confirm the join input formats as `XXXX-XXXX` automatically so players don't need to type the dash.

### Test 1A — Letters only, no dash typed
1. Go to settleit.gg
2. Tap **Join Room**
3. In the room code field, type `FIRE4829` (no dash)
4. **Expected:** Input automatically shows `FIRE-4829` after the 4th character

### Test 1B — Lowercase input
1. Type `fire4829` in lowercase
2. **Expected:** Input shows `FIRE-4829` (uppercased + dash inserted)

### Test 1C — Typing with dash already included
1. Type `FIRE-4829` manually (with the dash)
2. **Expected:** Input shows `FIRE-4829` correctly (dash not duplicated)

### Test 1D — Partial code
1. Type `FIRE` (just the word part, no numbers)
2. **Expected:** Shows `FIRE` with no dash yet
3. Continue typing `4`
4. **Expected:** Shows `FIRE-4`

### Test 1E — Paste a full code
1. Copy `FIRE-4829` to clipboard
2. Paste it into the room code field
3. **Expected:** Shows `FIRE-4829` correctly

---

## 2. BUG-002 — Turn Reveal Highlight

**Goal:** Confirm the first player in the turn order gets an amber highlight, separately from the "YOU" badge on the local player.

### Setup
- Create a room with 3+ players and start the game

### Test 2A — First player is not you
1. When the turn reveal overlay appears, look at position #1 in the list
2. **Expected:** The player at position #1 has an amber border/glow AND a **FIRST** badge
3. Your own player entry has a **YOU** badge with amber border
4. Other players have no highlight

### Test 2B — You are first
1. Play until you get a session where you happen to be first (may take a few tries)
2. When reveal appears, your entry at position #1 should have the amber border and **YOU** badge
3. **Expected:** Only one badge showing — "YOU" (no separate "FIRST" badge since you're the same person)
4. No other players have the amber glow

---

## 3. Post-Question Result Screen

**Goal:** After a question settles, a result overlay appears for 3 seconds showing what settled and who voted what, before the next turn begins.

### Test 3A — Auto-dismiss after 3 seconds
1. Start a game, ask a vote question, have all players vote the same option (full consensus → settles immediately)
2. **Expected:** A result overlay appears showing:
   - "Settled!" label at the top
   - The winning option in large amber text
   - A breakdown of each option with the names of who voted for it
   - "Tap anywhere to continue" hint at the bottom
3. Wait without tapping
4. **Expected:** Overlay auto-dismisses after ~3 seconds and the lobby/next turn appears

### Test 3B — Tap to dismiss early
1. Same as above — after the result overlay appears, tap anywhere on it immediately
2. **Expected:** Overlay dismisses instantly and the next turn begins

### Test 3C — Picker held until result screen clears
1. Be the player whose turn comes up next after a question settles
2. Wait for the result overlay to appear
3. **Expected:** The "Ask a Question" picker does NOT open while the result screen is showing
4. After the result screen clears (3s or tap), the picker opens automatically

### Test 3D — Soft consensus countdown then settle
1. Have all-but-one player vote the same option, trigger the 10s countdown
2. Let it count down to zero (settle via countdown, not force settle)
3. **Expected:** Result overlay appears with the settled option and vote breakdown

### Test 3E — Force settle
1. Start a question as the active player
2. Have players vote (but not reach consensus)
3. Click **Force Settle**
4. **Expected:** Result overlay appears with the settled option
   - Note: vote breakdown may be partial if not everyone voted

### Test 3F — Host also sees result screen
1. On the host view, confirm the result overlay appears after each question settles
2. It should behave identically to the player view

---

## 4. BUG-003 — Mobile Reconnect

**Goal:** A player who backgrounds the app or navigates away returns to the correct game state without being kicked.

### Test 4A — Background app during lobby
1. Join a room on mobile as a player (game not started yet)
2. Background the app (press home button, switch to another app, etc.)
3. Wait ~10 seconds
4. Return to settleit.gg in the browser
5. **Expected:** You are still in the lobby, your name still appears in the player list on the host screen, no reconnect errors

### Test 4B — Background during active question
1. Start a game and get to an active vote question
2. Background the app on your phone mid-question
3. Wait ~10 seconds
4. Return to settleit.gg
5. **Expected:**
   - The current question is visible
   - Your previous vote is shown (if you voted before leaving)
   - Live vote counts are current
   - No "You're not in a room" error

### Test 4C — Lock screen / screen timeout
1. Join a game and start playing on mobile
2. Let the screen lock/timeout naturally (or lock it manually)
3. Unlock and return to the browser
4. **Expected:** Same as 4B — rejoined into the current state

### Test 4D — Navigate away to a different tab then back
1. On mobile, join a game and tap a link to open a different page/tab
2. Switch back to the settleit.gg tab
3. **Expected:** Game state restored — room code visible, in correct game phase

### Test 4E — Rejoin during someone else's turn
1. Background as a non-active player while a question is being asked
2. Return while the question is still active
3. **Expected:** You can see the question and cast your vote normally

### Test 4F — Connection lost banner
1. Turn off wifi/mobile data on your phone while in a game
2. **Expected:** "Connection lost — trying to reconnect..." banner appears
3. Turn wifi/data back on
4. **Expected:** Banner disappears and you are back in the game

---

## 5. Full End-to-End Game Flow (Regression)

Run a complete game to make sure nothing regressed.

1. **Home page:** Create a room as host with a nickname
2. **Lobby:** Share the room code — have 2–4 other players join using the auto-format input
3. **Start game:** Host clicks Start — turn reveal overlay appears
   - Confirm: first player has amber glow + FIRST badge
   - Confirm: your entry has YOU badge
4. **First question:** Active player's picker opens after reveal closes
5. **Vote:** All players vote — try getting full consensus
   - Confirm: result screen appears after question settles
   - Confirm: settled option is shown in large amber text
   - Confirm: voter breakdown is correct
6. **Turn advance:** After result screen, next player's picker opens
7. **Soft consensus:** On a question, have all-but-one vote the same
   - Confirm: countdown banner appears
   - Change the outlier vote — confirm countdown cancels
   - Let it count down again and settle naturally
   - Confirm: result screen appears
8. **Force settle:** Active player clicks Force Settle mid-question
   - Confirm: result screen appears
9. **Mobile reconnect:** One player backgrounds and returns mid-game
   - Confirm: they rejoin cleanly with current question visible
10. **End session:** Host clicks End Room
    - Confirm: all players see summary screen

---

## Known Limitations / Out of Scope for Phase 7

- **Host mobile reconnect:** If the HOST backgrounds the app and disconnects, there is a 2-minute window to rejoin via page refresh, but this is less reliable than player reconnect. Full host reconnect is a future improvement.
- **Very long disconnects:** If a player is gone for long enough that the room expires (2 hours inactivity), rejoin will fail with "room not found" — this is expected.
- **Simultaneous disconnects:** Multiple players disconnecting at once during an active question is not explicitly tested and may have edge cases.
