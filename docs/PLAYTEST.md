# Integrated playtest checklist (slice 6)

Run on real phones (iOS Safari and Android Chrome) with 5–8 people, on the deployed preview URL. Fill in the "Observed" column honestly; a blank row is better than "tested".

## Recovery matrix

| Scenario | Required observation | Observed |
| --- | --- | --- |
| Lock phone for 30 s, 2 min, 5 min | Same seat and accepted votes survive; current phase returns without manual rejoin | |
| Creator closes the browser | Other participants continue normally | |
| Refresh, switch apps, Wi-Fi → mobile data | No duplicate member, lost accepted vote, or stale lobby | |
| Disconnect after tapping a vote, before "Saved" | Retry either confirms the same saved vote or says it missed the deadline | |
| Double-tap, rapid changes, two tabs | One final vote per ballot; older messages never overwrite newer state | |
| Late join and changing presence | New player waits for next question; absent players do not block | |
| Everyone leaves | Questions stop; room shows "closes in N min" and expires | |
| Worker eviction, duplicate/delayed alarm | State restores, transitions happen once (covered by automated tests; spot-check on prod) | |
| D1 failure during export | Room continues; results catch up exactly once (automated for duplicates; outage needs a manual check) | |
| Zero / one / below-threshold daily participation | No fake percentages or misleading grade | |
| Daily boundary (12:00 UTC), repeat finalization, correction | Correct cutoff, stable result version, explicit invalidation | |
| Public vs custom questions and write-ins | Private variants and text never enter public totals | |
| Owner test traffic | Admin counts reconcile with and without "include test traffic" | |

Reliability target: 95% of deliberate foreground resumes recover within 3 seconds once connectivity is back, with zero lost acknowledged votes. The admin overview reports resume attempts, failures and the share under 3 seconds from client telemetry; note the sample size.

## Fun (measure separately)

- Time from room creation to first vote.
- Rounds voluntarily continued before anyone suggests stopping.
- Did arguments start without prompting? Did anyone trigger a revote or "more time"?
- Did automatic pacing cut off a good conversation? (If yes, tune `DEFAULT_TIMING` in `packages/core/src/config.ts`.)
- Did daily participants come back for the score or the next question?

If people describe it as "a poll with no payoff", revisit the verdict/reveal and the daily mechanic before adding features.

## What this session already verified

- 66 automated tests: rules engine (31), content audit (8), Worker in workerd with real Durable Objects and D1 (27), including a forced Durable Object eviction and a simulated D1 outage where the room keeps dealing and exports catch up exactly once.
- A scripted browser run (`frontend/e2e/smoke.mjs`) passed twice: once through the vite proxy, once with both Workers running under workerd behind the real service binding (WebSocket upgrades answered 101 through the gateway). Flow: create, three joins, ready-up, live named votes, early close, discussion, a fourth late joiner blocked until the next question, offline/online recovery, majority revote, unanimous verdict with "Plot twist", next question dealt with the late joiner eligible, recap, daily submission, topics page, admin gate.

Not verified here: a real Cloudflare deployment and phone OS suspension.
