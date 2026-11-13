# Phase 5 Implementation

## Routes
| Route | Purpose |
|---|---|
| `/universities`, `/universities/new`, `/universities/[id]`, `/universities/[id]/edit` | list (search, country, preferred*, sort, pages), create, detail with programs + linked scholarships, edit |
| `/programs`, `/programs/new?university=<id>`, `/programs/[id]`, `/programs/[id]/edit` | list (search incl. university name; university/country/degree/field filters; deadline sort), create, detail, edit |
| `/scholarships`, `/scholarships/new`, `/scholarships/[id]`, `/scholarships/[id]/edit` | list (search, country, funding, deadline filter), **Quick add**, create, detail with link/unlink*, edit |

`*` needs the Phase 5 migration (now applied). Programs were added to the sidebar and the More page (bottom bar unchanged).

## Code
- `src/lib/records/validate.ts` – pure validators (name lengths, URL normalization http(s) only, real calendar dates, money, currency whitelist, enums, amount-requires-currency, FK shape).
- `src/lib/records/params.ts` – search sanitizing (PostgREST filter syntax stripped), sort whitelist, page clamp, `buildHref`.
- `src/lib/records/queries.ts` – bounded list queries (`range`, exact count; `select *` so new columns appear after the migration), `hasExtras()` migration probe (React-cached per request).
- `src/lib/records/actions.ts` – `saveUniversity/Program/Scholarship`, `deleteUniversity/Program/Scholarship`, `linkScholarship/unlinkScholarship`. Each begins with `requireOwner()`; `user_id` is never read from the client; FK existence is checked (clear message) on top of composite FKs + RLS; duplicate soft-warning with "Save anyway"; `revalidatePath("/", "layout")` after every write.
- `src/lib/records/fields.ts` – form definitions. `src/components/records/*` – `RecordForm` (inline errors, aria, pending state, sticky mobile actions, unsaved-changes warning, offline/network-failure message, no queued writes), `FilterBar`, `DeleteButton` (dialog with impact/blocked text), `QuickAdd`, shared display parts.
- Nav (`src/lib/nav.ts`), layout (`AppNav` wrapped in Suspense with a `StaticNav` fallback, required for dynamic `[id]` routes under `cacheComponents`), dashboard deadline links now open the program/scholarship.

## Database
Core CRUD uses the existing schema unchanged. Migration `20261113000100_phase5_relationships.sql` (additive, **applied 2026-11-13**) adds `universities.university_type/is_preferred`, `scholarships.opening_date`, widens `funding_type` (full, partial, tuition_waiver, stipend, other), creates `scholarship_programs` and `scholarship_universities` (owner-only RLS, composite owner FKs, cascade on link rows) and indexes. `application_scholarships` is untouched, so Phase 6 is unaffected.

## Validation rules
Name required, at most 300 characters (country at most 100); URLs at most 500, http(s) with a dotted host (bare domains get `https://`); dates real and 1900-2200; amounts non-negative with at most 2 decimals; currency from a 21-code list and required whenever an amount is set; enums whitelisted; text fields at most 5000. Enforced on the server and mirrored by DB CHECKs.

## Deletion
Blocked server-side (and explained in the dialog) when a university has programs, a program has applications, or a scholarship is attached to applications. DB FKs are `RESTRICT` as the last line. Link rows cascade (they are metadata only).

## Performance
Server pagination (20 per page), selective embeds (`programs(count)`), 350 ms search debounce, URL replace inside a transition (the old list stays until new data arrives), existing `loading.tsx` skeletons, and indexes `universities(user_id, lower(name))` and `scholarships(user_id, created_at)` in the migration. Program search with a term costs one extra small query for matching universities.
