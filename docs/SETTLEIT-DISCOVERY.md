# Settle It — discovery decisions

Captured from the owner's completed questionnaire on 2026-09-30. These are product preferences, not evidence that the corresponding features exist.

## Audience and purpose

1. Audience: general party groups.
2. Desired feeling: funny and surprising.
3. Best existing experience: the conversation after a question.
4. Main failure: connection problems interrupt everything.
5. Recommendation hook: gets everyone arguing and laughing in seconds.
6. Settling means finding the group's majority opinion.
7. Build a small shared game mechanic usable in group and solo play.
8. Primary group size: 5–8 people.
9. Everyone uses their own phone.
10. No TV or shared screen required; playable around a bonfire.

## Group experience

11. Sessions continue casually until the group stops.
12. A few taps and occasional short typing per round.
13. Advance automatically, with a timer if a round takes too long. Exact timing and discussion interval need a proposed rule.
14. Continue when someone locks their phone; they catch up on return.
15. Join/leave anytime; new players start next round.
16. Persuasion is the preferred extra mechanic.
17. Players always argue their actual opinions.
18. Show answers and names as votes arrive.
19. Allow an optional, group-triggered revote.
20. Funny session awards instead of a ranked winner.
21. Highlight splits but give everyone equal attention.
22. One consistent vote-and-discuss format.
23. Use the question list already in the repository as the content reference.
24. Cut host-only controls and a separate host screen.

## Solo experience

25. First solo mode: one daily question with community results.
26. Solo needs a challenge or score beyond simply voting. The scoring mechanic is not yet selected.
27. Prioritize gaming, anime, and internet culture.
28. Wants all three daily discovery choices: shared daily, category daily, personalized pick. Assistant proposed staging these; the user has not selected rollout order beyond the first solo mode.
29. Return motivation: fresh questions and surprising community results.
30. Shared links let friends answer first, then compare with the sharer's vote.
31. Hide percentage comparisons until enough people vote. Threshold is not yet selected.

## Content and operation

32. Content sources: owner questions, reviewed AI drafts, and approved player submissions.
33. Custom questions created inside group rooms stay private.
34. Mostly silly and harmless tone.
35. Exclude politics, religion, sexual topics, and personal callouts; mark spoilers.
36. Wants custom responses/options on certain questions. Assistant interpreted this as write-in answer options, not public discussion threads; details remain to be specified.
37. Almost no weekly content/moderation upkeep; should largely run itself.
38. Homepage: small rotating mix of daily splits, close votes, popular topics/trends, and changed-mind results.
39. “Most debated” means questions with the most votes.
40. Group answers can contribute anonymously to public totals for public-library questions only.

## Accounts and administration

41. Skip player rankings; rank questions/topics instead.
42. Accounts eventually support history, progress, friend comparisons, streaks, and achievements; start with history/progress.
43. Play immediately as a guest; sign in to save progress across devices.
44. Initial admin overview: visitors, game starts, completions, returning players, recovery failures.
45. Admin controls: questions, scheduling, submission review, reports, user moderation, homepage featured content.

## Practical constraints

46. Start as a hobby, with room to grow if people love it.
47. Open to external hosting around $5–10/month.
48. Keep the frontend, but reconsider the backend and database.
49. Owner confirms GitHub main matches the running game and no existing player data needs preserving. Local running checkout path remains unknown.
50. First-playtest success: both group and daily play work, and the admin dashboard shows real usage.

## Initial repository observations

Source: https://github.com/Alialhashemi23/settleit.gg, main inspected read-only during discovery. The tree initially reported commit 4e2fa865d93c2af52996cf026fce54e7005b6ce6. The running deployment has not been compared or tested.

- README describes SvelteKit/Svelte 5, Bun, Socket.IO, SQLite, and Docker Compose.
- backend/handlers/room.ts removes players on socket disconnect, grants host recovery a two-minute window, and returns a recovering host to lobby status. Player rejoin reconstructs some state separately.
- backend/rooms.ts deletes room questions, responses, and players when destroying a room.
- backend/db.ts also deletes inactive rooms and associated data after two hours of inactivity, checked every thirty minutes.
- frontend/src/lib/socket.ts stores a room code, player ID, and nickname in localStorage. This is not an authenticated persistent session design.
- frontend/src/lib/presets.ts defines stable question IDs, 2–4 choices, topic tags, and vibe tags. It includes the desired gaming/anime/internet material, as well as content that needs review against the new boundaries and spoiler policy.
- plans/bugs.md records earlier phone-lock/reconnection fixes; those records do not verify current reliability.
- The public website could not be opened through the web tool. This does not establish that the deployment is offline.
- Common local repository directories were checked without finding the running checkout. No live files, hosting configuration, or production data have been changed.

## Design issues to resolve in the manifesto

- Live named votes are intentional and may influence subsequent voters. Describe public numbers as participating players' opinions, not a representative public poll; distinguish solo and group contexts.
- Multiple-choice questions can have a leading option without a majority. Use “leading choice” below 50%, “majority” only above 50%, and explicit tie outcomes.
- Group rounds need a discussion interval despite automatic progression; host disconnection must not control room survival.
- Persuasion awards need observable rules and cannot infer who caused a changed vote unless the player explicitly credits someone.
- Public aggregates need durable, deduplicated contributions that survive deletion of temporary room state.
- Optional revotes should replace a participant's contribution, not inflate total votes.
- No player leaderboard is requested, even though solo needs a challenge.
- A solo prediction mechanic is a possible proposal, not an approved requirement; any community baseline needs enough real votes and a fixed scoring cutoff.
- Low ongoing upkeep conflicts with unrestricted public user-generated text. Keep public publishing reviewed and make content rotation independent of pending submissions.
- Shared/category/personalized dailies should reuse a question and voting engine rather than creating separate game systems.
