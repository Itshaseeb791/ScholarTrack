# Phase 6 Audit

Repository state at start: `main` == `origin/main` (`af16fd6`, Phase 5), clean tree. Live data (owner session): 0 applications. Phase 5 migration is applied (verified by the Phase 5 live suite).

## Existing architecture (reused as-is)
- Next.js 16 App Router, `cacheComponents`, Server Actions behind `requireOwner()`; `revalidatePath("/", "layout")` after every write (defeats the 30 s client router cache).
- Phase 5 building blocks: `RecordForm` (inline errors, pending state, unsaved-changes guard), `FilterBar` (URL-driven search/filter/sort), `DeleteButton` (impact/blocked dialog), `Pager`, `Deadline`, `Detail`, `Empty`, `ExtLink`, and pure helpers `validate.ts` / `params.ts` (tested with `node --test`).
- Dashboard: `loadDashboard()` + `dashboard-logic.ts` (pure, `verify-dashboard` tests), `time.ts` (Asia/Karachi, date-only values never shifted), `urgency()` = overdue / urgent (<= 3 days) / normal.
- Navigation already lists Applications (placeholder page).

## Existing application schema (Phase 3 migration)
| Table | State |
|---|---|
| `applications` | `program_id` (composite owner FK, RESTRICT), `status` (9 values: researching, preparing, ready_to_apply, submitted, under_review, interview, accepted, rejected, withdrawn), `submission_date`, `notes`, timestamps, `updated_at` trigger. **No** deadline override, portal URL, reference, fee, intake, decision date, history. |
| `application_scholarships` | `(application_id, scholarship_id)` PK, composite owner FKs (application CASCADE, scholarship RESTRICT). **No** outcome. |
| `tasks`, `events` | FK to `applications` with RESTRICT (Phase 7 data). |
| `application_documents` | junction, cascades with the application; documents themselves are protected (RESTRICT). |
| History / requirements | **Do not exist.** |
RLS: forced, owner-only `owner_access` on every table; indexes on `(program_id,user_id)`, `(user_id,created_at desc)`, `(user_id,status)`.

Answers to the audit questions: (1) core fields exist, the extended metadata does not; (2) nine statuses, `waitlisted` is missing; (3) scholarships link through `application_scholarships`; (4) no separate application deadline, only `programs.application_deadline`; (5) no history table; (6) requirements cannot be represented by existing tables (`tasks` is Phase 7 and is a different concept); (7) one migration is needed.

## Missing functionality
Application CRUD UI, status lifecycle + history, scholarship linking UI with outcomes, requirements checklist, list/search/filters, deadline precedence, dashboard application metrics.

## Risks
- **No DDL access** from this environment; the user applies the migration in the SQL Editor. The migration could not be executed against a database before delivery (Docker daemon unavailable), so it was reviewed by hand and is transactional.
- Status + history atomicity must not depend on the client: solved with a database trigger (same transaction as the status write).
- Dashboard must keep working before the migration is applied (it degrades to the old behaviour).
- `applications.status` CHECK is replaced by a strict superset (no value is reinterpreted).
- Existing dashboard tests encode the old status grouping (`submitted` included decisions); the grouping is being redefined deliberately and the tests updated.

## Architectural decisions
1. **Status model:** keep the 9 stored values, add `waitlisted`. `ready_to_apply` is displayed as "Ready to Submit" (stored value unchanged, no reinterpretation). Groups: in progress = researching/preparing/ready_to_apply; submitted = submitted/under_review/interview; decisions = accepted/rejected/waitlisted; withdrawn separate. Each status is in exactly one group.
2. **History:** `application_status_history` filled by an `AFTER INSERT / UPDATE OF status` trigger; the note rides in a transaction-local setting set by `change_application_status()`. The app can only select/insert history (no update/delete grants); rows cascade-delete with the application.
3. **Atomic writes:** `change_application_status()` (status + missing submission/decision date + history) and `create_application()` (application + optional starter checklist) are SECURITY INVOKER SQL functions, so RLS and ownership still apply. Edit-form saves are a single `UPDATE`, so the trigger covers status edits made there as well.
4. **Deadline precedence:** application override, else program deadline, else Unknown. Computed in SQL (`effective_deadline` in the read view) and in pure TS. The program deadline is never written by application actions. Urgency reuses the dashboard's `urgency()` (overdue / due soon <= 3 days / upcoming); applications that are submitted, decided or withdrawn are "closed", never overdue; unknown is never overdue.
5. **Read model:** `application_overview` view (`security_invoker`) joins application, program, university and adds requirement counts in one indexed query, enabling server-side search, filters, deadline sort and pagination without N+1.
6. **Program picker:** one native `<select>` with programs grouped by university (`optgroup`), so choosing a program derives the university; no duplicated university data, no dependent-dropdown JavaScript.
7. **Requirements:** per-application rows (title, notes, due date, completion); progress is always computed from rows, never stored. Optional starter checklist is a set of unchecked suggestions at creation time.
8. **Scholarship outcome:** column on `application_scholarships`, independent of admission status.
9. **Deletion:** an application deletes its own requirements, history and scholarship/document links (cascade, explained in the dialog); universities, programs, scholarships and documents are untouched. Blocked if tasks/events (Phase 7) reference it.
10. **Duplicates:** soft warning when an application already exists for the program (stronger wording for the same intake); "Save anyway" allows different cycles. No unique constraint.

## Migration plan
`supabase/migrations/20261114000100_phase6_applications.sql` (additive, one transaction, manual apply in SQL Editor, rollback notes inside). Applied by the user on 2026-11-14. Before it exists, Applications pages show a setup notice and the dashboard falls back to Phase 5 behaviour.
