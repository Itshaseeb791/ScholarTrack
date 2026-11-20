# Phase 7 Handoff

> Resumption and review completed on November 21, 2026 (Asia/Karachi). The configured Supabase schema already contains Phase 7; no migration was applied. Phase 7 is recorded in the local feature commit on `feature/phase-7-tasks-calendar`. No push or deployment was performed. See [Phase 7 testing](phase-7-testing.md) for review checks, earlier live/browser results and their limits.

## 1. Overall status: **Reviewed and committed locally; push awaits review**
Feature branch: `feature/phase-7-tasks-calendar`, based on `815557dc6eb596eaf83bafe7144035ec5de1e9df` (Phase 6). Commit subject: `Complete Phase 7 tasks and calendar`; use `git log -1` for its SHA. `main` and the last-fetched `origin/main` remain at the Phase 6 base. Existing working changes were retained; the unrelated storage-cleanup modification remains uncommitted.

## 2. Completed features (code complete; typecheck, lint, build and unit tests pass)
- Tasks: create, view, edit, delete, complete / reopen, status, priority (incl. urgent), due date and time, application links, search, filters, tabs with counts, shortcuts from an application or calendar date: **verified live and in Chrome**.
- Custom events (timed and all-day, location, meeting link, application link): **verified live and in Chrome**.
- Calendar (month, week, day, agenda, navigation, jump to date, aggregation without duplicates): **verified live and in Chrome**.
- Deadline Center (groups, filters, sorting, closed-record rules): **verified live and in Chrome**.
- In-app reminders: all six source types verified through the live API. Chrome flows verify task offsets and state controls, suggested scholarship reminders and moved dates, event custom-time reminders, and bell/dashboard updates. Browser verification does not cover full reminder creation flows for every source type.
- Dashboard (This week, due reminders, next event, task creation/completion/reopening, urgent priority) and navigation: **verified with live data in Chrome**.
- Regression: Phase 5 / 6 live, Phase 6 browser, auth, dashboard and live-backend suites pass in this resumption. PWA, UX, Phase 5 browser/extras passed in the original run; they were not rerun during this resumption.

## 3. Partial
The scripted gates listed in the testing report pass. Physical iPhone testing remains manual; the reports do not claim exhaustive coverage of every feature/source combination.

## 4. Blocked
The previous migration blocker is resolved. Vercel's served commit cannot be verified with the available access (no connected Vercel account, local CLI or project link; public GitHub deployment/check metadata is empty).
**Not Started (by decision):** Web Push notifications. Feasibility is documented in `docs/phase-7-audit.md`: iOS supports Web Push only for a Home Screen web app, delivery needs VAPID secrets and a scheduler (Vercel Hobby cron runs at most daily), and end-to-end delivery can only be proven on a physical iPhone. Reminders are in-app only and say so.

## 5-6. Migration
`supabase/migrations/20261115000100_phase7_planning.sql`: **already present in the configured project's effective schema**, confirmed by authenticated column probes and the live suite. Project: `iupdcxjmgqtvmqsggvpm` (`https://iupdcxjmgqtvmqsggvpm.supabase.co`). No migration was applied in this resumption. No admin connection was available to inspect the migration ledger or execute `supabase/tests/verify_phase7.sql`; do not reapply this non-idempotent migration to the current schema. The project's dev/staging/production label was not established, so no schema mutation was attempted.

## 7. Files
Created: `src/lib/{deadlines,calendar,tasks,events,reminders,dashboard-planning}.ts`, `src/lib/records/{planning-queries,planning-actions}.ts`, `src/components/records/{planning-parts,calendar-parts,task-check,reminder-controls,reminder-panel}.tsx`, `src/components/reminder-bell.tsx`, routes `src/app/(app)/{tasks,calendar/events,deadlines,reminders}/...`, `tests/planning.test.ts`, `scripts/verify-phase7-{live,ui}.mjs`, the migration, `docs/phase-7-*.md`.
Modified: `calendar/page.tsx` and `tasks/page.tsx` (placeholders replaced), `(app)/layout.tsx` (bell), `lib/nav.ts`, dashboard (`page.tsx`, `lib/dashboard.ts`, `lib/dashboard-logic.ts` now delegating to `deadlines.ts`), application / scholarship / program pages (tasks, events, reminders), `records/{validate,fields}.ts`, `record-form.tsx` (time input), `application-parts.tsx` (`SetupNotice` props), `scripts/verify-dashboard.mjs`, `README.md`. The pre-existing storage-cleanup edit in `scripts/verify-live-backend.mjs` is unrelated and is excluded from the Phase 7 commit.

## 8. Dependencies added
None.

## 9. Test results
See `docs/phase-7-testing.md` for current and historical runs. Unit 32/32; lint, typecheck and production build pass after the fix. Phase 7 live: zero failures/skips. Phase 7 browser: full final-build run passes, cleanup 0/0/0/0, no overflow at 390px/1440px and no console/hydration errors. Dashboard regression 9/9; auth 6/6; live backend and Phase 5/6 live pass.

Resumption fixes: urgent tasks now appear in the dashboard's High priority group and use the danger indicator; regression covers open/completed urgent tasks. Phase 7 browser fixtures use a three-day offset; offset reminders are date-based and due from midnight on the trigger date, regardless of a task's due time. Reminder actions target the fixture by ID, and leftover fixture counts cause failure. Added browser assertions for task creation/completion/reopening and week counts on the dashboard.

## 10. Security verification
`requireOwner()` guards every action; server validation, composite owner FKs and the one-source check remain in place. The Phase 7 live suite checked anonymous reads of tasks/events/reminders, anonymous task insert rejection, authenticated non-owner reads of all three, and non-owner insert denial for all three. The review strengthened insert checks to require RLS error `42501`, using a surviving valid task as the reminder source. It did not separately test anonymous event/reminder inserts or all non-owner update/delete operations. Phase 5/6 security and private Storage regressions passed. No service-role key was used.

## 11. Manual actions
Review the local feature commit before pushing. Deployment remains for the user's review. Inspect Vercel's served commit when account access is available. After deployment, try the installed iPhone PWA (small-screen calendar, one-tap task completion and reminder bell).

## 12. Deployment readiness
**Local feature commit ready for review before push.** The prior resumption passed Phase 7 live/browser and Phase 6 browser gates. This review reran unit tests, dashboard regression, strengthened Phase 7 live security checks, lint, typecheck and production build. It also corrected the Tasks pre-migration setup link; that notice was checked in source and build, without rerunning the pre-migration browser scenario. No other application behavior changed during review. No push or deployment was performed. The Vercel-served commit and physical iPhone behavior remain unverified.

## 13. Known limitations
- Reminders are in-app: nothing notifies you while the app is closed.
- Task sort by priority is not offered (needs a computed rank); priority is a filter.
- Overdue is date-level; a task due today at 09:00 is still "today" at 23:00.
- Weeks start on Monday; agenda is a fixed 30 days; calendar and Deadline Center are bounded to 500 rows per source.
- Dashboard loads at most 50 open tasks and previews five per task group. Within those loaded rows, each open High/Urgent task appears once in High priority; appearing separately in a date group (Due today/Overdue) is intentional and predates Phase 7.
- An application with tasks or events cannot be deleted until those are removed or unlinked (existing Phase 6 rule, now explained in the dialog).

## 14. Phase 8 recommendations
Documents (upload, link to applications and requirements; `application_documents` and the private bucket already exist), then optionally Web Push once a device and VAPID keys are available.
