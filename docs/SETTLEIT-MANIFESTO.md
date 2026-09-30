# Settle It — the rebuild manifesto

Working product direction · 30 September 2026

**Settle It gets a group arguing and laughing in seconds, then gives their disagreement a verdict. Alone, it gives you a daily opinion challenge and a reason to see what everyone else thinks.**

This document turns the completed [discovery questionnaire](SETTLEIT-DISCOVERY.md) into a buildable direction. Owner decisions are the foundation. Numerical limits, timing, scoring, and rollout choices below are proposed defaults for playtesting, not additional answers from the owner.

## 1. The product promise

Bring your own opinion. Find your people. Defend your choice. See where the room lands.

The first audience is ordinary party groups of 5–8 people, each with a phone, with no TV or dedicated game operator. The conversation after the question is the strongest part of the existing game. The app should supply good questions, make disagreement visible, and let everyone participate with a few taps.

The project starts as a hobby with room to grow. Keep the existing SvelteKit frontend foundation. Reconsider the backend and persistence. Target approximately $5–10/month in operating costs at early usage. The first integrated playtest must include working group play, a daily challenge, and an admin dashboard showing actual usage.

## 2. Principles that constrain the work

- **A sleeping phone keeps its seat.** Your identity and saved votes survive disconnects. Returning gives you the current round, not a broken lobby.
- **The game moves itself.** No separate host screen, mandatory question-picker turns, or dependence on the creator staying connected.
- **People express real opinions.** Named answers appear as they arrive. No assigned positions or incentives to invent beliefs.
- **Conversation gets time.** Automatic progression includes a discussion interval rather than ending the moment votes agree.
- **One recognizable group format.** Question, vote, discuss, optional revote, verdict. New categories are content, not new engines.
- **Guests play immediately.** Accounts add saved history and cross-device continuity later.
- **Show real participation.** No invented votes, percentages, activity, or testimonials. Hide public percentages until the sample threshold is met.
- **The owner can take a week off.** Approved content rotates automatically. Pending submissions cannot block daily publication.

## 3. The group game

Create a room, choose a category mix, and share a link/code or QR. Everyone uses the same player screen. Starting requires at least two ready players; design primarily for 5–8 and propose a launch cap of 12. New arrivals can see the current round and become eligible next round.

The approved question library supplies an automatic shuffled queue without repeats within the session. Prioritize gaming, anime, and internet culture while retaining suitable questions from other categories. Custom questions can be queued for the private room; nobody has to invent one to keep playing.

| Phase | Proposed behavior |
| --- | --- |
| Vote | Up to 30 seconds. Display names and choices live. A player may change their choice while voting is open. Close early once all eligible players answer. |
| Discuss | 30 seconds after voting. Freeze the initial tally; show the split and let people talk. |
| Optional revote | During discussion, more than half of the initial voters can request one revote. It lasts up to 15 seconds. One revote maximum per question. |
| Verdict | Show the final outcome, original versus final tally when relevant, and participation count for 8 seconds. |
| Next | Automatically deal another question if at least two participants are active. Otherwise wait for players. |

These durations are tuning knobs, not a claim that 30 seconds is the ideal discussion length. Give the group a shared “more time” action: a majority of initial voters can add 30 seconds once. This keeps a good discussion alive without creating a permanent host role. The same collective rule can skip a question. Empty or expired rounds cannot produce awards or public contributions.

Membership, presence, and eligibility are separate. A disconnect changes presence only. Eligibility is fixed for the current round; a timeout prevents an absent voter from blocking progression. A returning eligible voter can participate if the phase is still open. A returning player otherwise sees the latest result and joins the next round. With everyone away, stop consuming questions.

**Outcomes must be honest.** With 2–4 answer choices, the leading choice may have less than half the votes. Call more than 50% a majority, a unique leader at or below 50% a leading choice, and equal leaders a tie. “Unanimous” always includes the denominator of submitted votes; abstentions and absences are not agreement.

## 4. The payoff

Results should create something to react to: “4 of 7 picked Bulbasaur,” “the room stayed split,” or “two people switched after that argument.” These are copy examples, not real activity.

Use playful, non-ranked session awards drawn from actual actions. “Plot Twist” can recognize a changed vote; “Great Divide” can recognize the session's closest question. Award wording should be friendly, and tied recipients can share an award. Avoid spotlighting minority voters disproportionately. Do not claim someone persuaded others unless those people explicitly credit them; that extra attribution feature can wait.

Because sessions have no fixed length, each player can open a recap or leave with their own recap at any point. The group can keep playing. Summaries do not require a host to end the room.

The product bet is that good questions, visible social reactions, a discussion beat, optional changes of mind, and a satisfying recap improve the existing experience. A playtest must establish whether this is enough; a reliable implementation alone will not establish that the game is fun.

## 5. Daily play: proposed “Read the Crowd” challenge

The owner chose a daily question, but wants a challenge beyond voting and no public player ranking. Proposed mechanic:

1. Pick your honest answer to today's question.
2. Before seeing results in this flow, estimate what percentage of today's participants will choose your answer.
3. Submit both together. Your opinion and prediction lock for that daily attempt.
4. If the public sample is large enough, see the current split, labeled provisional until close. Otherwise see “Results unlock after enough people answer.”
5. After the day closes, get a personal accuracy result and see your prediction versus the final share.

Proposed score: `max(0, round(100 - 2 × absolute percentage-point error))`. Predicting 60% when the final share is 70% earns 80/100. This scores prediction accuracy, never whether the opinion was correct. There is no player leaderboard.

Propose one global daily period beginning at 12:00 UTC, displayed in local time, and a minimum of 20 distinct eligible participants before publishing percentages or grading. Twenty is a product threshold, not proof of statistical representativeness. Score against the frozen final daily cohort, exclude the player's own vote from their comparison, and require 20 other eligible participants to grade that attempt. Too little participation yields an ungraded result, never fake seed data. Show that possibility before submission.

Public daily voting stays immutable after submission. Deletions or moderation after close can correct public counts; invalidate affected historical grades when the baseline is no longer valid instead of silently changing scores. A retired or flawed question yields an explicitly void result.

This delayed reveal is a cold-start tradeoff: the first audience may get ungraded challenges, and final scores arrive after close. Test whether predicting and returning is enjoyable. If it is not, revisit this mechanic before adding streaks or more solo modes. Historical, sufficiently populated question snapshots can later support instantly scored quickplay.

The long-term discovery menu supports all three owner-requested choices: a shared daily, category dailies, and personalized picks. Start with one shared daily so early participation gathers in one place. Category and personalized entry points should reuse the same library and challenge system; they do not each need unique daily questions at launch.

Sharing creates an explicit result link. A friend answers before the app reveals the sharer's choice, then compares both answers and community results where available. Sharing is opt-in; normal activity does not publish someone's voting history. Client-side hiding alone is insufficient: the server also withholds the shared answer until the friend has submitted.

## 6. Content that can run without constant attention

Start with a reviewed subset of the existing `frontend/src/lib/presets.ts`, preserving stable IDs where the wording and choices remain comparable. Changes to meaning or choices create a new version. Launch with a proposed minimum of 60 approved prompts so daily scheduling has a useful buffer.

The default tone is silly and harmless. Exclude politics, religion, sexual topics, and personal callouts. Mark spoilers and let players exclude those packs. Existing tags are a starting point; inspect the actual questions because some current prompts explicitly contain spoilers.

Curated additions, reviewed AI drafts, and approved player submissions can all enter the public library. AI drafting is an optional offline editorial aid, not a paid runtime dependency or an automatic publisher. Pending material waits until someone reviews it; the approved library keeps running.

Selected questions can allow write-in options. In private rooms, limit length and count, normalize duplicates, and mark the result as a room-specific variant. That whole variant stays out of the public canonical aggregate because different options change the meaning of the vote. Public write-ins become private suggestions for review; a new approved option belongs to a future question version and never rewrites an active daily ballot. No public comment feed is in the launch scope.

## 7. Public statistics and the homepage

The homepage starts with three clear actions: play today's challenge, create a room, join a room. Below them, show a few real activity cards drawn from available data:

- Most debated: most eligible votes in the stated time window.
- Closest calls: narrowly separated top choices, above the minimum sample size.
- Changed minds: people whose initial and final group-round votes differed, among those with both votes.
- Today's split: only after the sample threshold, marked provisional until close.

Each card links to a topic detail page with question version, sample count, time window, and source context. Small or empty datasets get honest empty states. Closest votes are descriptive, not evidence of importance. Solo and group environments differ, especially with live named group voting; the site describes participating players rather than “what everyone believes.”

Public-library group answers can contribute anonymously. Private prompts, room nicknames, room links, and custom option text cannot appear in public totals. A revote updates the final contribution; it is not an extra voter. Repeated play by the same known participant cannot inflate unique-participant rankings. Browser identities are approximate, and clearing storage or using different devices can defeat guest deduplication.

## 8. Accounts and administration

Guest sessions start immediately and preserve progress on that browser. Introduce optional sign-in for durable history and cross-device access after the core loop works. Propose one established OAuth provider initially; provider selection is still open. A later account can claim the current guest history through an authenticated merge with duplicate resolution. Friends, streaks, and achievements remain future features.

The admin overview answers: how many visitors arrive, how many start playing, how many finish a round or daily attempt, how many return, and how often recovery fails. Open-ended group sessions need explicit definitions: a “completed game” is too ambiguous, so show completed rounds and sessions with at least one completed round.

Administrative controls eventually cover the library, daily schedule, pending submissions, reports, account moderation, and featured homepage items. The first version includes secure admin access, library editing, daily scheduling/rotation, and the overview. Add review/report controls before enabling public submissions. Record changes in an audit trail.

## 9. Scope and delivery boundary

The first integrated playtest includes group play, daily prediction submission and settlement, real public results where enough data exists, guest persistence, and the small admin overview. It does not require accounts, friends, notifications, global player rankings, category dailies, personalized feeds, payments, matchmaking, public chat, live AI judges, or multiple group minigames.

The owner specifically wants both group and daily play. Build them in sequential, testable slices and combine them for the first integrated playtest; do not call a group-only prototype the finished requested result.

Judge that playtest on four observations: players understand the loop with little explanation; connection interruptions recover without lost votes or seats; people choose to continue or return; administrative counts match known test actions. If the fun is absent, change the loop before expanding scope.

Continue with [the architecture](SETTLEIT-ARCHITECTURE.md) and [the implementation backlog](SETTLEIT-BUILD-PLAN.md).
