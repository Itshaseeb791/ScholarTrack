# Phase 6 Testing

Final run 2026-11-14 against a clean production build on `localhost:3100` and the live Supabase project with the Phase 6 migration applied (owner and non-owner test accounts). Test records are tagged `ZZ-P6-*` / `ZZ-P5-*`; every script reports 0 leftovers.

## Results
| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |
| `npm test` | 19/19 pass (status groups, grouping counts, transitions, deadline precedence, urgency + timezone, requirements progress, duplicate detection, application/requirement/status validation, list params, plus Phase 5) |
| `node scripts/verify-phase6-live.mjs` (live Supabase) | **65 checks pass, 0 failures, 0 skipped** |
| `node scripts/verify-phase6-ui.mjs` (390px + 1440px browser) | **pass, run twice** (21 checks each) |
| `verify-dashboard` (9 tests incl. the live loader against the migrated schema) | pass |
| Phase 5 regression: `verify-phase5-live` (26), `verify-phase5-ui` (25), `verify-phase5-extras` (18) | pass |
| `verify-auth`, `verify-pwa` (5), `verify-live-backend` (15) | pass |
| `verify-ux` | 5 of 5 consecutive passes (plus 3 of 3 earlier in the phase) |

## Live Supabase verified (`verify-phase6-live.mjs`)
- **Creation:** `create_application` is atomic (an invalid checklist item rolls back the application; a missing or unknown program is rejected); fee needs currency; non-http portal URL and unknown status rejected; `waitlisted` accepted; several applications for one program (different intakes) allowed.
- **Status and history:** history is written by the trigger (initial row, plain UPDATE from the edit form, RPC with note); previous/new status and note recorded; same-status change rejected without history; an invalid status changes nothing and writes no history; unknown id reports not found; the submission/decision dates are filled only when empty and never overwritten; manual dates preserved; non-status updates add no history; history cannot be edited or deleted through the API, and a forged `user_id` is rejected.
- **Deadlines and list view:** application deadline overrides the program deadline, the program deadline is used as fallback and is never modified; search across university/program/reference, combined filters and effective-deadline sorting work on `application_overview`.
- **Requirements:** create, complete (stamps `completed_at`), un-complete, edit, delete; counts in the view; invalid application and blank title rejected.
- **Scholarships:** link, duplicate rejected, invalid scholarship rejected, one scholarship on several applications, outcome default/valid/invalid, outcome independent of admission status, a scholarship used by an application cannot be deleted.
- **Deletion:** a program with applications cannot be deleted; deleting an application removes only its requirements, history and links and keeps the university, program and scholarship.
- **Security:** anonymous cannot call either RPC or read any new table/view; the non-owner account sees no rows in any of them and cannot create an application, change a status or add a requirement.

## Browser verified (`verify-phase6-ui.mjs`)
Create from a program page (preselect, grouped picker), fee-needs-currency, override deadline with source label, starter checklist, safe portal link, program deadline untouched; dashboard lists the application deadline once and shows the status breakdown, then drops it once submitted; requirements toggle/add/edit/two-step delete with derived progress; scholarship link, outcome change without touching the admission status, unlink; status dialog (only allowed options, note, history, submission date, un-submit not offered); the edit form rejects an invalid transition and records an allowed one; duplicate warnings (same intake / other intake, "Save anyway"); search, combined filters, sort whitelist, hostile input; no horizontal overflow at 390 and 1440 on every Phase 6 page and the dashboard; desktop column headers vs mobile cards; sidebar active route; malformed and unknown ids give not-found; delete dialog states what is removed and shared records survive; no console or hydration errors.

## What the test run found
- **Product bug (fixed):** before the migration the dashboard hid a program's deadline when it had an application but the application deadline could not load. Program deadlines are now replaced only when application deadlines are available.
- Four failures in the new browser script were wrong assertions, not product defects: a wait or count matched text in a dropdown (scholarship names, intake filter, university option) and one expected count was wrong. The assertions were fixed to inspect only the relevant list rows and the correct counts; none was loosened.

## Not covered
- The installed iPhone PWA and a real offline save (offline/network error messages exist; only emulated browsers were used).
- Browser Back / iOS swipe-back on a dirty form (not intercepted).
- Server Actions are exercised through the browser flows, not an isolated harness. "Authorization failure" is covered by the RLS and RPC checks above and the proxy redirect, not by calling an action with an expired session.
- The migration was applied by the user in the SQL Editor; it was never run against a local Postgres.
