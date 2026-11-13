# Phase 5 Audit

## Existing architecture
- Next.js 16.4 App Router, `cacheComponents: true`, React 19.3, Tailwind 4, `@base-ui/react` shadcn components, no form/validation/test libraries.
- Auth: `src/proxy.ts` gates every route; `requireOwner()` (`src/lib/auth/session.ts`) re-verifies Auth user == `SUPABASE_OWNER_ID` and `is_app_owner()` RPC at every private boundary. Pages stream behind `(app)/loading.tsx`.
- Client navigation cache: `staleTimes.dynamic = 30`. Server Actions that call `revalidatePath` clear it.
- Dashboard (`src/lib/dashboard.ts`) already counts `universities`/`scholarships` and lists program/scholarship deadlines; deadline links pointed at `/universities` and `/scholarships` lists.
- Dates: `src/lib/time.ts` (`Asia/Karachi`, date-only values never pass through a timezone).
- Service worker excludes RSC, query-bearing and private responses; no change needed.
- Reusable: `ui-kit.tsx` (PageHeader, Pill, EmptyState, IconTile), `ui/*` (button, card, dialog, input, textarea, label, badge, skeleton), `skeletons.tsx`.

## Existing database (migration `20261112000100_backend_foundation.sql`)
- `universities(name*, country*, city, website, notes)`, `programs(university_id*, name*, degree_type default 'masters', field_of_study, intake, duration, tuition_fee, currency, application_deadline, official_url, requirements)`, `scholarships(name*, provider, country, funding_type in full|partial|other, funding_amount, currency, eligibility_requirements, application_deadline, official_url, notes)`.
- Composite `(id, user_id)` FKs prevent cross-owner links; all FKs `ON DELETE RESTRICT` (programs->universities, applications->programs, application_scholarships->scholarships). RLS forced, owner-only policy on every table; `user_id` defaults to `auth.uid()`.
- CHECKs: tuition/funding amount require a currency; URLs must start with http(s); name lengths.
- Live data (owner session, 2026-11-13): 0 universities, 0 programs, 0 scholarships, 0 applications. `scholarship_programs` does not exist.

## Missing
- All Phase 5 UI/routes/actions (Universities and Scholarships were placeholders; no Programs route).
- No scholarship <-> program/university relationship (only `application_scholarships`, which must stay "applied for").
- No university type / preferred flag, no scholarship opening date, funding types limited to full/partial/other.

## Risks
- **No DDL access** from this environment (no service role / DB URL). The migration cannot be applied by the agent. Mitigation: core CRUD works on the existing schema; new capabilities are feature-detected (`scholarship_programs` probe) and hidden with a notice until the migration is applied.
- Dashboard stale for 30 s -> every write calls `revalidatePath('/', 'layout')`.
- PostgREST `or()` filter injection via search text -> search is sanitized before interpolation.
- Funding/tuition require currency (DB CHECK) -> mirrored in validation so users see a field error, not a DB error.

## Decisions
- Server Actions (one `"use server"` module) with `requireOwner()` + server-side validation inside every action; no service-role key anywhere.
- Hand-written pure validators (no zod): `src/lib/records/{validate,params}.ts`, tested with `node --test`.
- URL search params drive lists (`q`, `country`, `sort`, `page`, filters); server-paginated 20/page with exact count.
- Deletion: blocked when dependents exist (programs for a university, applications for a program/scholarship), re-checked on the server; DB FKs remain the last line.
- Duplicates: soft warning with "Save anyway".
- Migration (pending manual apply): `supabase/migrations/20261113000100_phase5_relationships.sql`.

## Planned files
Routes `universities|programs|scholarships` (`page`, `new`, `[id]`, `[id]/edit`), `src/lib/records/*`, `src/components/records/*`, nav + dashboard link updates, `tests/*.test.ts`, `scripts/verify-phase5*.mjs`, docs.
