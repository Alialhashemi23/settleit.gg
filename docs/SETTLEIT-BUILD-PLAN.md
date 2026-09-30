# Settle It — implementation backlog

30 September 2026 · Companion to [the manifesto](SETTLEIT-MANIFESTO.md) and [architecture](SETTLEIT-ARCHITECTURE.md).

The owner's first integrated playtest requires group play, daily play, and real admin usage data. Deliver the slices below in order, then test them together. These are acceptance gates, not time estimates.

## 0. Establish a safe development baseline

- Obtain an isolated checkout of GitHub main inside an approved workspace. Record the commit and inspect repository instructions, deployment scripts, dependency manifests, and relevant frontend routes.
- Run the existing documented build/type checks to separate old failures from new work.
- Preserve the existing question library and audit candidate launch prompts for clear options, duplicates, spoilers, prohibited topics, and ambiguous wording. Stable IDs survive; substantive edits get versions.
- Inventory reusable Svelte components. Replace separate host/player workflows with one room view.
- Copy these planning documents into the implementation repo as the current design; mark older roadmap files historical so future work does not expand scope accidentally.

Done when: the baseline is reproducible, the content import is mapped, and production is unaffected.

## 1. Prove the hosting choice with a tiny room

- SvelteKit frontend Worker plus a separate backend Worker with one durable room class.
- Guest cookie, create/join endpoint, one hardcoded test ballot, HTTP command/snapshot, WebSocket update, visible-tab polling fallback.
- Persist one vote; evict/restart room execution; confirm the same membership and vote return.
- Exercise SvelteKit-to-backend WebSocket forwarding and local development.
- Record representative CPU/request/storage costs and required platform configuration.

Done when: two phones recover the same test ballot after interruption, deployment plumbing works, and the measured estimate plausibly fits the budget. If not, select the VM fallback before building more platform-specific code. A local emulator check is useful but does not replace the real hosted/mobile check.

## 2. Build one complete group round

- Pure TypeScript rules for eligibility, deadlines, vote/discuss/revote/verdict transitions, majority versus plurality versus ties, and one-time extensions.
- Authenticated room membership independent of connection IDs; safe duplicate commands and serialized vote changes.
- Unified mobile room screen, named live votes, accessible large controls, sending/saved/expired feedback, return-to-room state, and late-join waiting state.
- Fixed eligibility for each round; timeout handling; no creator-disconnect special case.

Done when: 5–8 participants can complete one round, including a disconnect, an optional revote, and a tie, without losing accepted votes or resetting the room.

## 3. Turn the round into a casual session

- Category selection, automatic question queue, no session repeats, shared ready/skip/more-time controls, and pause when too few players are active.
- Optional private queued questions; limited write-ins on selected questions, with private-variant marking.
- Recap accessible at any time, neutral funny awards, join-next-round behavior, bounded idle expiry.
- Server-confirmed round events and exports to persistent statistics.

Done when: an open-ended session continues without a dedicated operator and players can leave/rejoin safely. This slice is a group prototype, not completion of the overall requested first playtest.

## 4. Build the daily challenge and retained results

- Approved question catalog, versioned options, deterministic daily schedule/fallback, and configurable eligibility threshold.
- Opinion plus percentage prediction, locked submission, pending/ungraded/graded states, daily cutoff, frozen baseline, personal score explanation.
- Real aggregate result endpoints that withhold percentages below threshold. Distinguish daily cohort results from all-mode topic totals.
- Explicit share result link and answer-before-comparison behavior enforced server-side.
- Contribution deduplication, custom-variant exclusion, idempotent finalization, and outbox retry handling.

Done when: a real daily attempt can be submitted and settled once; duplicate/retried requests cannot change the tally or grade; low participation yields honest ungraded results. Use synthetic fixtures only in preview/test datasets, clearly separate from production statistics.

## 5. Ship the useful homepage and admin overview

- Homepage entry points: daily, create room, join room; a few real stat cards with useful empty states.
- Topic list/detail views ranked by eligible votes, with sample count, context, and time window. Closest-call and changed-mind cards only when supported by enough data.
- Protected admin sign-in, event deduplication, visitor/start/completion/return/recovery metrics, basic question editing, scheduling, and featured-card controls.
- Operational view of export lag, failed daily settlement, and errors. Test traffic filtering and visible freshness timestamps.

Done when: a known sequence of visits, joins, completed rounds, and daily submissions produces the expected dashboard totals. Unauthorized users cannot reach admin data or mutations.

## 6. Run the integrated playtest and release gate

Test with actual iOS Safari and Android Chrome devices plus a 5–8-person group. Browser simulations alone do not reproduce operating-system screen suspension.

| Scenario | Required observation |
| --- | --- |
| Lock phone for 30 seconds, 2 minutes, and 5 minutes | Same seat and accepted votes survive; current phase returns without manual rejoin |
| Creator closes the browser | Other participants continue normally |
| Refresh, switch apps, Wi-Fi to mobile data | No duplicate member, lost accepted vote, or stale lobby |
| Disconnect after submission but before acknowledgment | Retry either confirms the same saved vote or clearly reports that it missed the deadline |
| Double-tap, repeated retry, two tabs, reordered messages | One final vote per ballot; old messages never overwrite newer state |
| Late join and changing presence | New player waits for next round; absent players do not block indefinitely |
| Everyone goes away | Question queue stops; room expiry is predictable |
| Worker eviction, duplicate alarm, delayed alarm | State restores and transitions happen once |
| D1 failure during export | Room continues; results catch up exactly once after recovery |
| Zero/one/below-threshold daily participation | No fake percentages or misleading grade |
| Daily boundary, repeat finalization, moderation correction | Correct cutoff, stable result version, explicit invalidation where needed |
| Public/custom questions and write-ins | Private variants/text never enter canonical public totals |
| Recorded test traffic | Admin counts reconcile, and preview fixtures never appear publicly |

Proposed reliability target: 95% of deliberate foreground resumes recover within 3 seconds after connectivity is available, with zero lost acknowledged votes in the test matrix. Record sample size; this is an acceptance target, not a current guarantee.

Measure fun separately: time to first vote, number of rounds voluntarily continued, whether arguments start naturally, whether anyone chooses another round, and whether daily participants return for results or the next question. Observe when automatic pacing interrupts the best conversations. If people still describe it as a poll with no payoff, revisit the round/reveal and solo challenge before expanding features.

Done when: group and daily flows both work, recovery tests pass, dashboard counts are credible, and the group wants to play again. Record failures rather than replacing them with a broad “tested” claim.

## 7. Follow with accounts and low-maintenance content tools

- Optional public sign-in, guest-history claim, cross-device progress, duplicate contribution resolution, and history deletion.
- Submission/report queue and account moderation before enabling public submissions; reviewed AI drafts only as an editorial aid.
- Category dailies, personalized discovery, and historical scored quickplay after enough content/participation exists.
- Friends, streaks, achievements, and richer awards only after usage shows a reason to add them.

Done when: each addition has a user benefit and does not compromise anonymous entry or the operating budget. No global player leaderboard is planned.

## First coding task

Create the isolated implementation checkout and baseline, then build the smallest durable create/join/vote/resume flow from slice 1. Use a temporary preview and a single test question. Prove that phone suspension preserves a participant's identity and acknowledged vote before porting the full UI or content library.

Open design defaults to evaluate during implementation: prediction scoring and delayed reveal, minimum public sample, phase durations, collective revote/extension thresholds, initial OAuth provider, and room/guest retention. These have concrete proposed defaults in the manifesto/architecture and do not require another long questionnaire before development begins.
