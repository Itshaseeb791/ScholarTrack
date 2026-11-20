# Phase 7 Testing

## Review and local feature commit: November 21, 2026

Reviewed against `815557d`. Feature branch: `feature/phase-7-tasks-calendar`; commit subject: `Complete Phase 7 tasks and calendar`. The commit remains local. The unrelated pre-existing storage-cleanup change in `scripts/verify-live-backend.mjs` is excluded and remains uncommitted; earlier live-backend results below used that modified local script.

- Confirmed `groupTasks` filters once for open High/Urgent tasks. Strengthened the existing regression to cover both priorities in both open statuses, multiple High tasks, completed/cancelled exclusions, unique IDs, unchanged input and unchanged date groups. A task may also appear in Due today/Overdue by design; there is no duplication within High priority. Dashboard fetch/preview limits are unchanged.
- Corrected the Tasks setup notice from the default Phase 6 migration to `20261115000100_phase7_planning.sql`. Verified in source, typecheck and build; a pre-migration browser run was not repeated.
- Fixed a weak security test: the old non-owner reminder insert referenced a nonexistent scholarship. The test now uses a surviving owner task and requires RLS error `42501` for task, event and reminder insert attempts. The live suite passed with zero failures/skips and cleanup 0/0/0/0.
- Narrowed the handoff's reminder/security coverage claims to the checks actually run, and corrected the offset reminder explanation below. No migration, Vercel inspection, physical iPhone test or push notification test was performed during review.

Checks rerun in this review: `npm.cmd test` (32/32), `node scripts/verify-dashboard.mjs` (9/9), `node scripts/verify-phase7-live.mjs` (zero failures/skips), full lint plus targeted lint after the setup-link edit, `npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check`: all passed. The browser results below are from the prior resumption, not a new browser run in this review.

## Resumption: November 20–21, 2026 (Asia/Karachi)

The original report below is historical. Authenticated probes found the Phase 7 columns already present on `https://iupdcxjmgqtvmqsggvpm.supabase.co`. The live suite confirmed constraints, completion triggers, source embeds, uniqueness, cascades, and owner-only access. **No migration was applied during this resumption**, and no production schema changes were made. No database management connection was available to inspect the migration ledger or run the catalog-only `supabase/tests/verify_phase7.sql`; verification used the app's authenticated API and actual behavior.

Current results:

| Check | Result |
|---|---|
| `npm.cmd test` | 32/32 pass |
| `npm.cmd run lint` | pass, including after the dashboard fix |
| `npm.cmd run typecheck` | pass after the dashboard fix |
| `npm.cmd run build` | pass after the dashboard fix; existing Google Fonts need network access |
| `node scripts/verify-phase7-live.mjs` | pass, zero failures / skips; cleanup 0/0/0/0 |
| `node scripts/verify-phase7-ui.mjs` | full final-build run passed at 390px and 1440px, including dashboard creation/completion/reopening and urgent priority; no console/hydration errors; cleanup 0/0/0/0 |
| `node scripts/verify-dashboard.mjs` | 9/9 pass, rerun with urgent-priority regression |
| `node scripts/verify-auth.mjs` | 6/6 pass |
| `node scripts/verify-live-backend.mjs` | pass, including private Storage cleanup |
| `node scripts/verify-phase5-live.mjs` | pass, zero failures / skips, no leftover test universities |
| `node scripts/verify-phase6-live.mjs` | pass, zero failures / skips, no leftover test universities |
| `node scripts/verify-phase6-ui.mjs` | isolated final-build run passed at 390px and 1440px; no console/hydration errors; no leftover UI test universities |

Fixes and verification improvements:

- Dashboard task grouping omitted the new `urgent` priority from “High priority” and rendered its dot like a low-priority task. Both now treat urgent like high priority. The dashboard regression includes open and completed urgent tasks; browser assertions cover creation, week counts, completion, and reopening.
- The initial browser run crossed midnight in Karachi and failed its “due today” expectation. A fresh run passed. The task detail assertion now includes the rendered state to make future failures diagnosable.
- The reminder fixture uses three days before. Offset reminders are date-based: a one-day offset on a task due tomorrow is already due from midnight today, regardless of its 09:15 due time. The earlier explanation that it would wait until 09:15 was incorrect; no time-of-day reminder defect was demonstrated.
- Reminder-center button actions now target the test reminder by ID; cleanup reports a failing exit status if fixture rows remain.

Git and hosting at the end of the resumption, before the feature commit: only local branch `main`; fetched `origin/main` equaled local `HEAD` at `815557d`. All Phase 7 files were working-tree changes. No commit, push, or deployment was performed during that resumption. Vercel was not connected and no local Vercel CLI/project link was found. Public GitHub deployment and check-run endpoints returned empty lists, so the served commit is **unverified**.

Test isolation: the first Phase 6 browser regression was run concurrently with Phase 7 and could not see its application deadline in the dashboard's eight-item preview because the Phase 7 fixtures had earlier deadlines. Its fixtures were cleaned up; rerunning alone after Phase 7 cleanup passed completely. Run data-writing browser suites sequentially when they assert dashboard previews.

Resumption gate (before the feature commit): all checks listed above passed, including `git diff --check`. Phase 7 was ready for review and commit. No push or deployment was performed. The later review and local commit are described at the top of this report.

Physical iPhone PWA testing and Web Push remain outside these results. The reminders are in-app only.

## Original pre-migration report (historical)

Status when written: **the Phase 7 migration (`20261115000100_phase7_planning.sql`) has not been applied** (probe `42703`: column `reminders.offset_days` does not exist). Everything that needs the new columns is written but **not run**. This file lists only what was actually executed.

## Executed and passing
| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass (new routes: `/calendar`, `/calendar/events/*`, `/tasks`, `/tasks/*`, `/deadlines`, `/reminders`) |
| `npm test` | **32/32 pass** (19 earlier + 13 new in `tests/planning.test.ts`) |
| `node scripts/verify-dashboard.mjs` | 9/9 pass (the dashboard deadline logic now delegates to `deadlines.ts`; the live loader test ran against the pre-migration schema) |
| Phase 5 regression: `verify-phase5-live` (26), `verify-phase5-ui` (25), `verify-phase5-extras` (18) | pass |
| Phase 6 regression: `verify-phase6-live` (65), `verify-phase6-ui` (21) | pass |
| `verify-auth`, `verify-pwa` (5), `verify-ux` (3 runs) | pass |
| `verify-live-backend` | 15/15 after the fix below (10 consecutive runs) |
| Browser check before the migration | `/tasks`, `/tasks/new`, `/calendar`, `/calendar/events/new`, `/deadlines`, `/reminders` show the setup notice; the dashboard ("This week" strip) and the header bell render; 0 console errors |

### Unit tests added (13)
Month grid (6 weeks, Monday start, leap day, year spill), view ranges and week boundaries, navigation (month-end clamping, year boundary), parameter sanitizing, timezone conversion (Karachi wall clock to UTC and back, date-only never shifted), deadline items (precedence, deduplication, closed-record rules, undated items), mutually exclusive deadline groups and urgency, passed-research-date fading, calendar day grouping and multi-day spans, task states and completion semantics, task / event / reminder validation (all-day vs timed, end after start, overnight events, source and schedule), reminder state (follows a moved source date both ways, acknowledged / dismissed / disabled / closed / orphan, overdue tasks keep reminding), reminder deduplication.

## Failure found and fixed during this run
`verify-live-backend` began failing intermittently (about half of runs): "temporary test cleanup needs inspection". Investigation: the storage bucket and `documents` table were empty after every run (nothing leaked), but the script's post-remove check downloaded the object and found a cached copy still being served (still downloadable for the full 15 s in the worst runs) even though the remove had succeeded and the listing showed it gone. It is storage-download caching, not a data problem, and unrelated to Phase 7. The script now verifies deletion against the authoritative object listing instead of a download (a stronger check of the real state). 10 of 10 consecutive runs pass afterwards. The earlier download-based check had passed on every earlier day; why it started failing now is not known.

## Written, not run (blocked on the migration)
- `node scripts/verify-phase7-live.mjs`: about 90 live checks, self-cleaning (`ZZ-P7-TEST`): task constraints (urgent, due time needs a date, length, status), `completed_at` stamped / cleared by the trigger, task and event links to applications and the delete restriction, event time-model constraints (all-day vs timed, end after start, URL, category), the exact calendar and reminder SELECT strings the app uses (read from the source file) including overlap queries and the six-way reminder embed, reminder source and schedule constraints, idempotency (duplicate offset / custom time), invalid foreign keys, acknowledge / dismiss / restore / disable, cascade removal per source type, and anonymous / non-owner denial. It exits with code 2 (BLOCKED) until the migration exists.
- `node scripts/verify-phase7-ui.mjs`: browser flows at 390px and 1440px: task validation / create / edit / status / one-tap completion and its effect on counts and `completed_at`, creation from an application and from a calendar date, task views and filters, event validation and Karachi to UTC storage, all-day multi-day events, calendar aggregation per day (scholarship, override application, requirement, program without application, multi-day event; no duplicate for a tracked program), all four views, navigation and jump to date, Deadline Center groups, filters and sort, closed items leaving deadlines and calendar, reminder creation, idempotency, acknowledge / restore / dismiss / disable / enable with the bell count, suggested reminder, reminders following a moved deadline, custom-time reminder, application delete explanation, cascade on task / event delete, offline save, unsaved-form protection, overflow on every page at both viewports, desktop grid and week columns, sidebar / More / bottom bar, console errors.

## Not tested (and why)
- Web Push / notification permission / subscriptions / scheduler: not implemented (needs VAPID secrets, a scheduler and a physical iPhone). Nothing is claimed.
- Physical iPhone PWA; real offline queueing is intentionally absent (writes fail visibly and can be retried).
- The migration SQL itself has not been executed anywhere yet (no local Postgres); it was reviewed by hand and is transactional.
