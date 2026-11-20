# Phase 7 Audit

## Repository state
Branch `main`, clean, at `815557d` (Phase 6) == `origin/main`. Live data (owner session): 0 rows in `tasks`, `events`, `reminders`, `applications`, universities, programs, scholarships. `push_subscriptions` does not exist.

## Existing architecture (reused)
- Server Actions behind `requireOwner()`, `revalidatePath("/", "layout")` after writes, URL-driven lists (`FilterBar`, `Pager`, `parseListParams`), `RecordForm`, `DeleteButton`, `ui-kit` (Pill, PageHeader, EmptyState), `parts.tsx` helpers.
- Pure rules in `src/lib/` tested with `node --test`: `applications.ts` (status groups, `effectiveDeadline`, `deadlineState`), `dashboard-logic.ts` (`buildDeadlines`, `urgency`), `time.ts` (Asia/Karachi, date-only safe).
- Dashboard loader already merges program, scholarship, application, requirement, task and event dates (limited to future dates, capped per source).
- Navigation: sidebar from `routes`, bottom bar = Dashboard/Applications/Tasks/Calendar/More, everything else on /more. `/tasks` and `/calendar` are placeholders. Service worker never caches navigations, RSC or API responses.

## Existing schema (Phase 3 migration)
| Table | Columns / constraints that matter |
|---|---|
| `tasks` | `application_id` (nullable, composite FK, RESTRICT), `title` (1-300), `description`, `priority` low/medium/high, `status` todo/in_progress/completed/cancelled, `due_date date`. Partial index on open tasks by due date. **No** due time, completion time, urgent priority. |
| `events` | `application_id` (nullable, RESTRICT), `title`, `event_type` deadline/interview/exam/appointment/other, `starts_at timestamptz NOT NULL`, `ends_at` (>= start), `notes`. **No** all-day, location, URL. |
| `reminders` | `task_id` / `event_id` only (<= 1 source), `remind_at NOT NULL`, `status` pending/sent/dismissed/failed. FKs RESTRICT (a task with a reminder could not be deleted). **No** application/scholarship/program/requirement source, offset, enabled, acknowledged. |
| `application_requirements` (Phase 6) | `due_date`, `is_complete`; `application_overview` view gives `effective_deadline`. |
All tables: forced RLS, owner-only policies, composite `(id, user_id)` FKs.

Answers: (1) tasks have title/description/priority/status/due_date; (2) events have timestamps only; (3) 3 priorities, 4 statuses; (4) tasks and events link to an application by FK; (5) yes; (6) event timestamps are `timestamptz`, due dates are `date`; (7) a minimal `remind_at` only; (8) no subscription storage; (9) lists, forms, calendar aggregation, deadline center and dashboard need no DDL; (10) due time, completed_at, urgent, all-day events, reminder sources/offsets/state need one migration.

## Missing
Task and event UI, calendar views, deadline center, reminder model and center, dashboard sections, navigation entries, tests.

## Risks and security
- No DDL access: the user applies `20261115000100_phase7_planning.sql` manually; tables are empty, so it is low risk.
- Reminder sources must not be free-form: one nullable composite FK per source type plus `num_nonnulls(...) = 1`, so a reminder can only reference the owner's own rows and the database enforces it. Unique indexes make creation idempotent (same source + offset, or same custom time).
- Deleting a source removes its reminders (CASCADE, documented); deleting an application is still blocked while tasks or events reference it (Phase 6 behaviour, message unchanged).
- Date-only values stay `date`; all-day events use `start_date/end_date` (not UTC-midnight timestamps); timed events convert wall-clock input to an instant in the app timezone on the server.
- The dashboard and layout must keep working before the migration is applied (graceful fallback).

## Proposed architecture
1. **One deadline model** (`src/lib/deadlines.ts`): `buildDeadlineItems()` turns raw rows from every source into typed items with the existing precedence (application override, else program) and closed-record rules (submitted/withdrawn applications, completed tasks and requirements are not pending). The dashboard, calendar and deadline center all use it, so dates are never copied into event rows and cannot drift.
2. **Calendar** (`src/lib/calendar.ts`): pure range math (month grid, week, day, agenda), navigation and grouping; queries fetch only the visible range with indexed filters.
3. **Tasks** (`tasks.ts` rules): urgency classification, completion semantics (database trigger stamps `completed_at`).
4. **Reminders** (`reminders.ts`): offset reminders are stored as `offset_days` and resolved against the source's *current* date at read time, so they follow date changes; custom reminders store an absolute `remind_at`. State is derived (scheduled / due / acknowledged / dismissed / disabled / closed). A reminder is **delivered in-app when it is due and shown** in the Reminder Center, dashboard and header badge; it is **acknowledged** only by the user. `delivered_at` is reserved for push and never set by in-app reminders.
5. Suggested defaults are offered as one-click "Add suggested reminders" (3 days before an application deadline, 7 days before a scholarship deadline, 1 day before a task), never created silently; duplicates are impossible by the unique indexes.

## Notification feasibility (what is and is not implemented)
- **Works everywhere, implemented:** in-app Reminder Center, dashboard section and a header bell badge. No external service.
- **iOS Web Push:** supported from iOS/iPadOS 16.4, but only for a web app added to the Home Screen, with the permission prompt triggered by a user gesture. Notifications from a normal Safari tab are not available. Other iOS browsers (Brave, Opera) run on WebKit and their Home Screen / push behaviour differs by version, so it must be checked per browser on the device.
- **Server side:** would need VAPID keys (secrets in Vercel env), a subscription table, the `web-push` library and a scheduler. Vercel Cron on the Hobby plan runs at most once per day with imprecise timing; per-minute schedules need a paid plan. Offset reminders are day-based, so a daily run would suffice, but custom-time reminders would be late by up to a day. I cannot verify the Vercel plan from here.
- **Verification:** end-to-end delivery can only be proven on a physical iPhone with real keys, which this environment does not have. Per the brief, push is therefore **not implemented** and is reported as Not Started rather than as a partial feature that cannot be verified. The data model leaves room (`delivered_at`, `attempts`, `last_attempt_at`).

## Decisions
- Weeks start on Monday; month grid is always 6 rows x 7 days.
- Task "overdue" is date-level (a task due today with a past time is still "today").
- Passed program and scholarship deadlines are research dates, not obligations: they appear as Overdue ("passed") in the Deadline Center only within 30 days; pending applications, open tasks and open requirements are overdue indefinitely.
- Event routes live under `/calendar/events/...` so the Calendar nav item stays active; Deadlines and Reminders live in the sidebar and More page, with a bell badge in the header (the bottom bar keeps its five items).
- Event "description" and "notes" are one field (`notes`).
- No new dependencies.
