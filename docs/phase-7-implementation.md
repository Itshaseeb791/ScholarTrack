# Phase 7 Implementation

## Routes
| Route | Purpose |
|---|---|
| `/calendar?view=month\|week\|day\|agenda&date=YYYY-MM-DD&sel=YYYY-MM-DD` | unified calendar; navigation by links (previous / next / Today / jump to date), URL-driven, only the visible range is fetched |
| `/calendar/events/new?date=&application=`, `/calendar/events/[id]`, `/calendar/events/[id]/edit` | custom events (nested under /calendar so the Calendar nav item stays active) |
| `/tasks?view=all\|today\|upcoming\|overdue\|completed&q&priority&status&application&sort&page` | task list with tab counts |
| `/tasks/new?application=&date=`, `/tasks/[id]`, `/tasks/[id]/edit` | create (from an application or a calendar date), detail with status control, edit, delete |
| `/deadlines?type&urgency&country&application&from&to&sort` | Deadline Center |
| `/reminders` | Reminder Center (due, upcoming, done/dismissed, disabled/finished) |
| Header bell, dashboard "This week", "Reminders", "Next event" | reminder count and previews |
Before the Phase 7 migration is applied, every new page shows a setup notice; the dashboard and the header bell keep working.

## One deadline model
`src/lib/deadlines.ts` (`buildDeadlineItems`) converts programs, scholarships, pending applications, open requirements, tasks and events into typed items. It is the only place that decides: application override beats program deadline; a program that has an application is not listed twice; submitted, decided and withdrawn applications are not pending; completed or cancelled tasks and completed requirements are not pending; unknown dates are never overdue. The dashboard (`dashboard-logic.buildDeadlines`), calendar and Deadline Center all call it, so dates are never copied into event rows and a changed date shows everywhere.
Groups (`classify`) are mutually exclusive: overdue, today, next 7 days, next 30 days, later, no deadline. Passed program/scholarship dates are research dates: shown as overdue for 30 days, then dropped; open tasks, requirements and pending applications stay overdue until done.

## Calendar
`src/lib/calendar.ts`: Monday-first 6x7 month grid, week/day/agenda ranges (agenda = 30 days), month navigation that clamps the day, multi-day expansion, stable ordering (all-day first, then by time, then kind). `planning-queries.ts#loadCalendarItems` runs one bounded, indexed query per source for [from, to] (events use an overlap query for timed and all-day rows) and flattens embeds into the shared model. Mobile: compact month grid with dots plus the selected day's list and agenda; desktop: item chips, week columns. Every kind has an icon and a text label (not colour alone). Items link to their owning record (no generic editor for program/scholarship dates).

## Tasks
Existing columns reused; migration adds `due_time` (wall clock in Asia/Karachi), `completed_at` and the `urgent` priority. `completed_at` is stamped/cleared by a trigger, so it cannot disagree with `status`. One-tap optimistic completion (`TaskCheck`) from lists and detail; reopening returns to "To do". Overdue is date-level (a task due today stays "today"). Priority is filterable; sorting is by due date, recent, updated (a rank sort would need a computed column).

## Events
`all_day` events use `start_date/end_date` (date-only; `starts_at` is NULL), timed events use `timestamptz`. A CHECK enforces exactly one model and end >= start. Wall-clock input is converted to an instant in the app timezone on the server (`zonedInstant`), and shown back through `timeInZone`. Fields: title, category, location, meeting link (http/https only, safe external link), notes, optional application.

## Reminders
- Model: one nullable composite-FK column per source type (task, event, application, scholarship, program, requirement) plus `num_nonnulls(...) = 1`, so a reminder can only point at the owner's own rows and the database enforces it. Schedule is either `offset_days` (0/1/3/7, resolved against the source's *current* date at read time) or an absolute `remind_at`, never both. Unique indexes make creation idempotent (same source + offset, or same custom time); the action inserts only missing offsets in one statement.
- State is derived (`reminderState`): due, scheduled, acknowledged, dismissed, disabled, closed (source finished or its research date passed), no_date, orphan. **Delivered in-app = due and shown** in the Reminder Center, dashboard and bell; **acknowledged** only by the user. `delivered_at` is reserved for push and never set in-app.
- Suggested defaults (application 3 days, scholarship/program 7, task/event/requirement 1) are one-click buttons, never silent. Source deletion removes its reminders (CASCADE, stated in the delete dialogs). An application that still has tasks or events cannot be deleted (Phase 6 behaviour), and the dialog says why.
- Notifications: in-app only. Web Push is not implemented (see the audit's feasibility section): it needs VAPID secrets, a scheduler and a physical iPhone to verify.

## Dashboard and navigation
"This week" strip (7 days, counts, links to day view), due reminders, next event. Existing cards, status breakdown and recent applications are unchanged; upcoming deadlines now link to the exact task/event/application and include all-day events. Sidebar and More gain Deadlines and Reminders; the bottom bar keeps its five items; the header has a bell with a due count (streamed behind Suspense, refreshed by the layout revalidation every action performs).

## Security and validation
`requireOwner()` in every action; `user_id` never accepted from the client; foreign keys are composite owner keys; source existence is checked before inserting a reminder; all inputs validated server-side (`parseTask`, `parseEvent`, `parseReminder`) and mirrored by CHECK constraints. No service-role key, no new dependency.

## Performance
Per-source bounded queries (limit 500) on indexed date columns, only for the visible range; Deadline Center bounded per source; task list paginated (20); tab counts are head-only count queries; no calendar library.
