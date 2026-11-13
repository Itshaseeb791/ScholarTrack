# Phase 6 Implementation

## Routes
| Route | Purpose |
|---|---|
| `/applications` | list: search (university, program, reference), filters (status, country, university, intake, deadline), sort (deadline, updated, created, university), 20 per page, URL-driven. Desktop columns, mobile cards. |
| `/applications/new?program=<id>` | create (program picker grouped by university, optional starter checklist) |
| `/applications/[id]` | workspace: overview, progress / next up, requirements checklist, scholarships (link, unlink, outcome), activity timeline, notes, Change status, Edit, Delete |
| `/applications/[id]/edit` | edit every field including status (history is still recorded) |
| `/programs/[id]` | now lists that program's applications and has "Apply to this program" |
Before the migration is applied, the three application pages show a setup notice; the dashboard falls back to Phase 5 behaviour.

## Status model
Stored values are unchanged from Phase 3 plus `waitlisted`. `ready_to_apply` is displayed as "Ready to Submit". Groups (each status in exactly one):
- **In progress:** researching, preparing, ready_to_apply
- **Submitted:** submitted, under_review, interview
- **Decisions:** accepted, rejected, waitlisted
- **Withdrawn:** withdrawn
Transitions (`canTransition`, enforced in the Server Actions): forward moves and corrections are allowed; a submitted or decided application cannot go back to an in-progress status (use Withdrawn); a withdrawn one can only be reopened as Researching/Preparing; setting the same status is rejected. The database rejects unknown statuses and a same-status change in the RPC.

## History and atomicity (database)
- `application_status_history` is written by an `AFTER INSERT / UPDATE OF status` trigger on `applications`, in the same statement as the status write. A status cannot change without its row, whether it is changed by the dialog, the edit form or any other path.
- `change_application_status(id, status, note, today)` (SECURITY INVOKER): status + missing `submission_date` (when Submitted) / `decision_date` (when Accepted or Rejected) + history note in one transaction. Existing dates are never overwritten.
- `create_application(data jsonb, requirements text[])`: application + starter checklist in one transaction (an invalid checklist item rolls back the application too).
- The app role can only select/insert history, never update or delete it. Deleting an application cascades its history.

## Requirements
`application_requirements(title, notes, due_date, is_complete, completed_at, sort_order)`; `completed_at` is maintained by a trigger. Progress is always computed from rows (`requirementsProgress`), never stored. Optimistic toggle in the UI; add, edit, two-step delete; max 100 per application. Starter checklist items are unchecked suggestions only.

## Scholarships
Existing `application_scholarships` (Phase 3) is reused; Phase 5's `scholarship_programs/universities` are research links and untouched. Duplicate links are rejected (PK); one scholarship may belong to many applications; a scholarship used by an application cannot be deleted. New `outcome` column (not_applied, preparing, applied, awarded, rejected, withdrawn) is independent of the admission status.

## Deadlines
`effectiveDeadline`: application override, else program deadline, else Unknown (also computed in SQL as `effective_deadline`). States: overdue / due soon (<= 3 days, same as the dashboard's urgent) / upcoming / none; submitted, decided and withdrawn applications are "closed" and never overdue; an unknown deadline is never overdue. The program deadline is never written by application actions.

## Dashboard
Cards unchanged (Applications, In progress, Submitted use the groups above; decisions shown in the new "Application status" breakdown linking to filtered lists). Deadlines include pending applications ("University · Program") and open requirement due dates; a program that has an application is listed through the application, not twice. Recent applications link to the workspace. Redefined: "Submitted" no longer includes accepted/rejected (test updated).

## Cache invalidation
Every Server Action ends with `revalidatePath("/", "layout")`, so lists, details and the dashboard are fresh immediately.

## Security
`requireOwner()` in every action; `user_id` never accepted from the client (column default `auth.uid()`, RLS owner policy); functions are SECURITY INVOKER with `execute` granted to `authenticated` only; the read view uses `security_invoker` so RLS applies; composite `(id, user_id)` FKs keep every row in one owner's graph; no service-role key anywhere.

## Performance
`application_overview` view: one indexed, paginated query (join + requirement counts + effective deadline) for list, filters, search and dashboard; no N+1. Indexes on `(user_id, application_deadline)`, `(user_id, updated_at desc)`, history and requirements by application. No new dependencies.

## Code map
`src/lib/applications.ts` (pure rules), `src/lib/records/validate.ts` (+ `parseApplication`, `parseRequirement`, `parseStatusChange`), `application-queries.ts`, `application-actions.ts`, `fields.ts` (+ `applicationFields`), `components/records/{application-parts,status-changer,requirements-panel}.tsx`, `RecordForm` (+ grouped selects, checkbox group), dashboard (`dashboard.ts`, `dashboard-logic.ts`, page), migration `20261114000100_phase6_applications.sql`.
