# Scholarship Tracker

A personal scholarship and university application tracker. Phase 2 provides the PWA infrastructure and responsive shell. Phase 3 (Supabase auth, owner-only RLS, private storage) is verified live. Phase 4 adds the dashboard and navigation, and Phase 4.5 hardens logout, timezones, forms and navigation performance, and the emerald design refresh restyles the whole UI. Phase 5 adds Universities, Programs and Scholarships management (see docs/phase-5-handoff.md); its database migration has been applied.

## Local development and production

Requires Node.js 20.9+ and npm. Existing stack: Next.js **16.4.6**, App Router, React, TypeScript, Tailwind CSS, and shadcn/ui.

```sh
npm install
npm run dev
```

Production verification:

```sh
npm run lint
npm run typecheck
npm run build
npm run start -- -p 3100
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

Use **`npm run build`**, including on Vercel: its `prebuild` script generates `public/sw.js` with a fresh revision on every build. Running `next build` directly skips this step. The generated worker is ignored by Git; the template is tracked. Configure the three environment variables described below before deployment. Production must use HTTPS; localhost is permitted for testing. A plain HTTP LAN address on an iPhone does not provide the secure context required for service workers. Deployment is outside the current task.

The existing Google fonts are preserved. Next.js downloads them at build time and serves the resulting font files locally. A clean build needs access to Google Fonts.

## PWA implementation

The implementation follows [Next.js's native PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps) and [App Router manifest convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest). A native service worker keeps the limited cache policy explicit without adding a wrapper dependency or changing the existing Next.js configuration.

- Manifest: Scholarship Tracker / ScholarTrack, standalone, root start URL and scope, unrestricted orientation, white theme/background.
- iPhone: Apple Touch Icon, Apple web app title/status bar metadata, mobile web app capability, `viewport-fit=cover`, safe areas on all four edges, home indicator clearance, zoom enabled, and mobile form controls of at least 16px. Next.js 16.4.6 emits the standard `mobile-web-app-capable` meta tag from `appleWebApp.capable`.
- Shell: bottom navigation below 768px, desktop sidebar, accessible skip link, responsive content width, and existing shadcn/ui components.
- Icons: real opaque PNGs at 192px, 512px, 180px, and a separate 512px maskable variant. The maskable foreground fits inside its central safe circle. The favicon uses the same graduation-cap artwork.
- Run `npm run icons` to reproduce the icons and favicon with Node.js only. No image dependency or external image service is needed.

## Cache and update policy

Each production build has a unique `scholartrack-` cache namespace.

1. Installation atomically precaches the standalone offline HTML, its retry script, and four icon files. Installation fails if required assets cannot be fetched.
2. Same-origin `/_next/static/` JavaScript, CSS, and font files are cached on demand, with at most 80 runtime entries. Only successful, nonredirected responses without `private` or `no-store` directives qualify.
3. Document navigations always use the network. On a network failure, the worker returns the precached offline page at the attempted URL. It never stores page HTML.
4. API/authentication endpoints, authorization-bearing requests, non-GET requests, cross-origin requests, RSC/prefetch responses, and query-bearing asset requests are excluded. No private application data is persisted by this worker.
5. Activation removes only older ScholarTrack caches. It does not delete other applications' caches.

Registration occurs in production on secure origins with root scope and `updateViaCache: "none"`. Worker responses carry `Cache-Control: no-store`, an explicit JavaScript content type, `nosniff`, and a restrictive worker CSP. Development unregisters this application's workers and clears only its caches; if switching a previously controlled localhost tab from production to development, reload once after cleanup.

Updates are checked on startup, when returning to the app, when connectivity returns, and hourly while visible. An installed update waits for the user's **Refresh app** action; it never calls `skipWaiting` during installation. The accepting tab reloads after activation. Other open tabs keep their current page and receive a refresh notice. The initial worker takes control on the next navigation rather than claiming existing pages. Closing all controlled tabs also permits normal browser activation of a waiting worker.

Offline support is a reconnect screen, not an offline dashboard or synchronization system. Already-open pages can remain visible; navigating/reloading offline shows the fallback. Browser storage eviction or clearing site data removes offline availability until installation succeeds again. Offline HTTP errors such as a server 500 are preserved rather than replaced.

## Automated browser validation

With the production server running on port 3100:

```sh
node scripts/verify-pwa.mjs
```

This dependency-free test uses headless Chrome's DevTools protocol. Chrome's default Windows installation is detected by its usual path; on another installation, set `CHROME_PATH` to the browser executable. `PWA_TEST_ORIGIN` can select another **local** production server. Browser execution may need sandbox permission in restricted environments.

The test verifies:

- Manifest response and metadata links, PNG signatures, dimensions, and worker headers.
- Production worker installation and control.
- Responsive login widths 320, 390, 844, and 1440px, protected-route redirects, absence of private navigation before login, and absence of horizontal overflow. Authenticated sidebar/bottom navigation requires separate owner testing.
- Offline fallback, offline retry, and successful recovery after reconnection.
- Static asset caching and exclusion of private/API/document responses.
- New worker detection, no reload before acceptance, accepted refresh, and preservation of another tab's work.
- No browser runtime errors or React hydration errors.

It saves mobile/desktop screenshots under `.next/pwa-390.png` and `.next/pwa-1440.png`. It temporarily changes the generated local worker to simulate deployment, restoring it in `finally`; use a dedicated local test server. Each run uses a fresh temporary Chrome profile.

## Historical Phase 2 validation results

Verified in this Windows workspace with Next.js 16.4.6:

- ESLint: passed.
- TypeScript: passed.
- Production build: passed. The initial sandbox build could not download the existing Google fonts; the permitted rerun succeeded.
- Production HTTP and headless Chrome checks listed above: passed.
- Mobile and desktop screenshots: visually reviewed.
- Physical iPhone/Safari installation, standalone behavior, cutout/home-indicator spacing, and pinch zoom: not tested automatically; follow the device checks below.
- Vercel deployment: not performed in this phase.

## iPhone Safari checks

1. Deploy with `npm run build` on Vercel or another HTTPS host. Open the HTTPS URL in Safari on an iPhone.
2. Confirm the page fits in portrait and landscape. Check that text and bottom navigation clear the notch/Dynamic Island and home indicator; pinch zoom must remain available.
3. Tap **Share → Add to Home Screen → Add**. Confirm the green graduation-cap icon and ScholarTrack name.
4. Open from the Home Screen. Confirm standalone appearance, readable status bar, and navigation spacing. Stay online until the first service worker installation completes, then reload/reopen once so it controls the page.
5. Enable Airplane Mode and disable Wi-Fi, then reload/reopen the app. Confirm **You're offline**, the reconnect message, and **Try again**. Retry while offline should keep the fallback.
6. Restore connectivity and tap **Try again**. Confirm the application returns.
7. Leave the app open, publish a newer build, and return to it. Confirm the update notice appears and the page does not reload until **Refresh app** is tapped. Repeat with another tab open to ensure that tab retains its work and can refresh separately.
8. If developer inspection is available, check the manifest, worker, cache entries, and console using Safari's remote Web Inspector. No application documents, API data, or authentication responses should appear in the worker cache.

## Files changed in Phase 2

| Files | Purpose |
| --- | --- |
| `src/app/manifest.ts` | App Router web manifest |
| `src/app/layout.tsx` | Application/iOS metadata, viewport, PWA manager |
| `src/app/page.tsx` | Minimal responsive placeholder shell |
| `src/app/globals.css` | Safe areas, responsive navigation, mobile input sizing, font token correction |
| `src/app/favicon.ico`, `public/icons/*.png` | Generated academic branding |
| `src/components/pwa-manager.tsx` | Registration, development cleanup, update notification |
| `src/service-worker.js` | Worker template and explicit cache policy |
| `public/offline.html`, `public/offline.js` | Self-contained offline fallback and retry |
| `scripts/generate-service-worker.mjs` | Per-build worker revision |
| `scripts/generate-icons.mjs` | Reproducible dependency-free icons |
| `scripts/verify-pwa.mjs` | Production browser validation |
| `next.config.ts` | Worker response headers; existing options preserved |
| `package.json` | Prebuild, typecheck, and icon commands |
| `.gitignore`, `eslint.config.mjs` | Exclude generated worker |
| `README.md` | Implementation, validation, and device testing instructions |

**Dependencies added in Phase 2: none.** Existing dependencies and prior uncommitted Phase 1 files were preserved. Supabase packages were already installed.

## Phase 3 backend foundation

The integration follows [Supabase's SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client). The browser and request-scoped server clients use the publishable key. No service-role key is used. `src/proxy.ts` refreshes cookies on requests and copies them onto redirects, verifies the user with Auth's `getUser()`, and marks matched responses `private, no-store`. Static assets, PWA metadata and the offline screen remain accessible without login.

`requireOwner()` is the private data boundary: it verifies the current user and requires both the server-only owner UUID and the database's `is_app_owner()` authorization to match. Use it in every future private page, data loader, Server Action and Route Handler; Proxy alone is insufficient. React `cache()` only deduplicates within a render. Session reads run at request time behind Suspense, preserving the existing Cache Components configuration. No private page data is cached by the service worker. Login navigations can show the public offline fallback without caching login HTML.

Email/password login is available at `/login`, with validation, pending/error states, owner checks and a server-side logout action. Sessions use Supabase SSR cookies. There is no signup or password-reset interface. A missing owner ID denies private access and disables login. Database setup errors deny access too; authenticated non-owners are never treated as owners.

### Configure the owner

1. In the intended Supabase Dashboard, verify the project URL matches the app's `NEXT_PUBLIC_SUPABASE_URL`. Do not apply SQL to another project.
2. Disable **Allow new users to sign up** in Authentication settings. Also disable anonymous sign-ins and unused auth providers. A missing registration page does not disable the public Auth API.
3. Manually create the one owner in Authentication → Users, using email/password. Confirm the account/email as needed and copy its user UUID.
4. In this app directory's ignored `.env.local` (or existing `.env`), set `SUPABASE_OWNER_ID` to that UUID. Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env.example` contains names only. Restart the server after changing configuration. Never prefix the owner configuration with `NEXT_PUBLIC_`.
5. Apply the migration, then set the same UUID in the database using the admin-only SQL below. Replace the placeholder locally in SQL Editor; do not commit the configured SQL.

```sql
insert into private.app_owner (singleton, user_id)
values (true, 'REPLACE_WITH_OWNER_AUTH_UUID'::uuid)
on conflict (singleton) do update set user_id = excluded.user_id;
```

The singleton is initially empty and inaccessible to API roles. Only Dashboard/admin SQL can change it. The function has a fixed empty search path and returns only whether the caller is the owner. Neither user-editable metadata nor every authenticated account can grant access. Changing the owner does not transfer existing rows; related data remains protected by its original `user_id`.

### Apply migrations safely

Migration: `supabase/migrations/20261112000100_backend_foundation.sql`.

This checkout has no installed/authenticated Supabase CLI or linked project. **No remote migration has been applied by this implementation.** The owner subsequently reported applying the SQL through Dashboard. The latest read-only probe confirms that all ten required application tables are addressable and deny anonymous reads; it does not establish migration history, constraints, triggers, or policy definitions. See the re-verification results below.

With a locally installed Supabase CLI and your own authenticated session:

```sh
supabase login
supabase projects list
supabase link --project-ref YOUR_VERIFIED_PROJECT_REF
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
```

Compare the selected project's identity with the configured URL before pushing. Review pending migrations and the dry-run first. Do not run `db reset`. Do not put access tokens or database passwords into tracked files or command arguments. The CLI may prompt securely for the database password.

If CLI access is unavailable, open the **verified project's** SQL Editor, paste the complete migration file and run it once. It is transactional and deliberately fails on conflicting application tables or an existing bucket instead of adopting or modifying them. Stop on an error and inspect the existing objects; never delete them to make migration succeed. Then configure `private.app_owner` using the SQL above. Dashboard execution does not record CLI migration history: before later CLI pushes, reconcile it using `supabase migration repair 20261112000100 --status applied --linked` **only after verifying the entire migration exists**.

The schema contains all ten requested application/junction tables, UUID keys, date-only deadlines, timestamptz audit/event times, monetary checks, explicit statuses, indexes, and timestamp triggers. Composite foreign keys enforce matching owners for every relationship. Referenced application data is protected with `ON DELETE RESTRICT`; deleting an application only cascades its junction links. Tasks/events/reminders must be detached or deliberately removed before their referenced record can be deleted. The schema does not schedule or deliver reminders.

Every application table uses forced RLS with authenticated owner-only `USING` and `WITH CHECK`, and no anonymous table grants. Updates cannot transfer rows to another `user_id`. The private singleton has RLS plus revoked schema/table access.

### Private documents

The migration creates private `scholarship-documents`, with a 20 MiB file limit and an allowlist of PDF, JPEG, PNG, plain text, DOC and DOCX. Storage policies require the database owner and an owner UUID path prefix. A restrictive guard prevents other permissive object policies from granting access to this bucket. Review any existing storage policies before applying the migration.

For future document management, call `requireOwner()` first, generate a document UUID, and upload with the authenticated server client to `<user UUID>/<document UUID>/<safe filename>` using `upsert: false`. Insert matching `documents` metadata (`id`, `user_id`, filename, path, MIME type, byte size) after upload; remove the uploaded object if metadata insertion fails. The document constraints check the first two path segments against the row. No full upload/download/delete UI is included in Phase 3.

Download using authenticated `storage.from('scholarship-documents').download(path)`, or generate a short-lived `createSignedUrl(path, 60)` after checking the owner and metadata. Never call `getPublicUrl()`. Signed URLs are bearer credentials until expiry: do not log or cache them. For deletion, explicitly unlink any application relationships first, remove the storage object with the authenticated client, then remove metadata; handle a failed final database write as a recoverable stale metadata row. PostgreSQL metadata and Storage operations are not one atomic transaction.

### Validation and the Phase 3 gate

```sh
npm run lint
npx tsc --noEmit
node --test scripts/verify-auth.mjs
npm run build
node scripts/inspect-backend.mjs
npm run start -- -p 3100
# In another terminal:
node scripts/verify-pwa.mjs
```

The auth regression tests execute the TypeScript implementation with mocked Auth responses. They check input validation, owner/non-owner authorization, database owner mismatch, logout, missing configuration, refreshed cookies on redirects and private cache headers. They do **not** establish live password authentication, RLS or persistence. The read-only backend probe prints status checks without credentials or response bodies; 404 is a failure, not evidence that RLS denied access.

After migration and owner configuration, execute `supabase/tests/verify_foundation.sql` as admin in SQL Editor. It checks RLS/policies, owner CRUD, rejected ownership changes, protected parent deletion, rejected invalid relationships, non-owner read/write denial, anonymous denial, private owner configuration and private bucket policy settings. Fixtures are rolled back. This SQL file has been prepared but has **not been executed against the live project**.

Complete these live checks before starting Phase 4:

1. Sign in as the owner, verify the private shell, reload and reopen the browser to verify session persistence. Confirm an authenticated owner visiting `/login` redirects to `/`. Sign out, then verify private URLs and browser back/reload cannot retrieve private content.
2. Verify invalid credentials and another real authenticated account cannot enter the app. Do not create mock production application records. Use the rollback SQL checks for database fixtures; an isolated test project may be used for additional negative tests.
3. Using the owner's authenticated Storage client and an actual owner document, verify upload, metadata persistence, authenticated download, short-lived signed download and deliberate removal. Verify anonymous/public URL and another user's access fail. Verify other-user prefixes fail. Do not infer API success from bucket catalog checks alone.
4. Re-run the browser PWA suite. It tests the **unauthenticated** login experience and worker behavior. Test the authenticated shell separately after live setup. Physical iPhone Safari/standalone testing remains manual.

Phase 3 is incomplete until the production build and all live auth, RLS and Storage checks pass. Phase 4 must wait for that gate; dashboard queries, statistics, deadlines and feature navigation have not been added. The project is not ready for Phase 5.

Current local validation (November 12, 2026): ESLint, `tsc --noEmit`, all five auth regression tests, and the production build passed. The build required network permission for the existing Google Fonts. Headless Chrome passed the unauthenticated PWA suite at 320, 390, 844 and 1440px, including offline login/retry/recovery, cache exclusions, update consent and preservation of another tab. Mobile and desktop screenshots were reviewed. The first browser run caught a test readiness race with the streamed form; the test now waits for the visible form and passes. No runtime/hydration errors were reported. Live owner login/logout/persistence, SQL/RLS tests, private Storage API operations and physical iPhone testing remain unverified. No deployment occurred.

### Phase 3 re-verification after Dashboard setup

The owner reported creating an Auth user, setting `SUPABASE_OWNER_ID` and executing the migration. Re-verification on November 12, 2026 confirmed:

- Next.js loads `.env.local` and `.env`; both public Supabase variables are present and the server-only owner ID is a valid UUID. No values were printed.
- The configured Auth service is reachable (HTTP 200). Its settings still report **public signup enabled**. Disable **Allow new users to sign up** in the verified project's Authentication settings.
- All ten required application tables return HTTP 401 with PostgreSQL privilege error `42501` to the anonymous client. No application rows were returned. This establishes anonymous read denial, not the full RLS completion gate.
- The `is_app_owner` RPC exists and returns false for anonymous identity. This does not prove that the private owner singleton is populated correctly.
- Anonymous Storage listing returns an empty list. That is consistent with filtered access, but does not establish bucket privacy or prove that an actual owner's document is protected.
- ESLint, `tsc --noEmit`, the production build and all five mocked auth regression tests passed again. Production headless Chrome passed unauthenticated redirects, login widths 320/390/844/1440px without horizontal overflow, offline/retry/recovery, private cache exclusions and service-worker updates without runtime or hydration errors.

`scripts/inspect-backend.mjs` now checks every application table and the owner RPC, bounds request duration, distinguishes PostgreSQL privilege denial from missing relations/invalid keys, and exits unsuccessfully when public signup remains enabled. Its output contains statuses only. Empty Storage results are explicitly distinguished from verified private Storage policies.

The gate remains **blocked**: this environment has no authenticated owner/non-owner test credentials, linked CLI, or database/admin connection. Owner login/logout, browser session persistence, live owner-only CRUD and non-owner denial, private bucket configuration, and Storage API access have not been verified. Neither authentication code nor migrations were recreated. No production rows or objects were created or deleted during these probes.

To resume, disable public signup and run `supabase/tests/verify_foundation.sql` in the verified project's SQL Editor. If it reports `Configure private.app_owner before verification`, use the owner configuration SQL above with the same Auth UUID as `.env.local`; the migration deliberately leaves that singleton empty. Report the SQL test result or exact error. For automated live authentication checks, temporary credentials can be placed in the ignored app `.env.local` as `SUPABASE_TEST_OWNER_EMAIL` / `SUPABASE_TEST_OWNER_PASSWORD`, and, for an existing non-owner test account, `SUPABASE_TEST_NON_OWNER_EMAIL` / `SUPABASE_TEST_NON_OWNER_PASSWORD`. Keep these values out of chat, source control, and public environment variables; remove temporary test credentials after verification.

Phase 4 remains untouched until the live gate passes. Phase 5 cannot begin.

### Latest authenticated re-verification

Owner test credentials were subsequently saved in the app's ignored `.env.local`. Run `node scripts/verify-live-backend.mjs` for the live API suite. It never prints passwords, tokens, user IDs, URLs or response bodies. It checks owner password login, UUID matching, verified identity, refresh/restoration and logout. After database authorization succeeds, it can test real non-owner access and private Storage using a fresh temporary document UUID, removing its object and metadata in `finally`. Full real non-owner API verification requires the separate non-owner credentials in `.env.example`. The suite leaves a failing exit status for any blocked or failed gate check.

Actual latest results:

- **Passed live:** owner email/password login, authenticated user matches `SUPABASE_OWNER_ID`, Auth `getUser()` identity verification, token refresh, restoration in a new client, and API test-session logout.
- **Failed live:** public signup is still enabled (`disable_signup` is a boolean `false`, including a cache-busted request). The database `is_app_owner()` call succeeds but returns `false` for the verified owner. This indicates that `private.app_owner` is empty or configured for another user; the app correctly denies access. Admin inspection is needed to distinguish those cases.
- **Not reached:** private Storage upload/download/delete, owner document metadata tests, and actual authenticated non-owner checks. No temporary Storage objects or document rows were created because the database owner gate failed first. Browser owner session persistence and authenticated page/logout behavior are not established by the API refresh test.
- **Passed again:** lint, TypeScript, production build, all five local auth regression tests, and the unauthenticated Chrome PWA suite (320/390/844/1440px, no overflow/hydration errors, offline recovery, cache exclusions and update handling).
- SQL verification was reported as executed by the owner, but no output was provided for review. The current false owner RPC prevents treating that report as a passing live completion gate.

Required admin correction: run the `private.app_owner` upsert in **Configure the owner** above with the UUID matching the app's configured owner, then rerun `supabase/tests/verify_foundation.sql` and retain its success/error result. Disable public signup in the project matching the app's URL. No application authentication or migration was rewritten to work around the denial. Phase 3 remains incomplete, Phase 4 has not started, and Phase 5 remains out of scope.

### Owner configuration resolved; remaining checks deferred

After the owner reported applying the singleton configuration, the live RPC returned **true** for the authenticated owner. The following additional checks then passed:

- Owner access to all ten application tables, with anonymous reads denied.
- Upload of a fresh temporary text document and insertion of matching PostgreSQL metadata.
- Authenticated download and short-lived signed download with matching file contents.
- Anonymous and public downloads of that existing object denied, plus uploads outside the owner's UUID path denied.
- Temporary metadata/object deletion and verification that the removed object could no longer be downloaded. No application fixtures were inserted and the temporary test data was cleaned up.
- API logout, plus real browser login, reload/new-tab session persistence, persistent-cookie expiry, authenticated `/login` redirect, browser logout, and denial when another tab reloads afterward.
- The existing PWA suite still passed: mobile/desktop login widths, offline recovery, static-only caching, update consent, other-tab preservation, and no runtime/hydration errors. The extended browser test brings tabs to the foreground before checking streamed content; initial harness timeouts were corrected without changing authentication.

`scripts/verify-pwa.mjs` now loads the ignored test credentials and performs owner browser checks when they are available. With separate non-owner credentials, it additionally checks that the login interface denies that account. Browser-restart persistence and physical iPhone Safari remain untested.

The overall Phase 3 gate still fails: the latest live Auth setting reports public signup enabled, and real authenticated non-owner tests have not run because those credentials are unavailable. The owner explicitly deferred those two remaining manual actions. SQL verification was reported as executed, with no result output supplied. Phase 4 remains unstarted until the security gate is satisfied; Phase 5 remains out of scope.

### Phase 3 files and dependencies

| Files | Purpose |
| --- | --- |
| `src/lib/supabase/{config,client,server}.ts` | Environment and SSR/browser clients |
| `src/lib/auth/{owner,session}.ts` | Server-only owner identity and private data boundary |
| `src/proxy.ts` | Session refresh, verified identity, redirects, cache headers |
| `src/app/login/*`, `src/app/error.tsx` | Login action/form/page, logout, recoverable error UI |
| `src/app/page.tsx` | Protect existing shell and add logout |
| `supabase/config.toml`, `supabase/migrations/*` | CLI configuration and backend/storage migration |
| `supabase/tests/verify_foundation.sql` | Rollback-only SQL verification |
| `scripts/verify-auth.mjs`, `scripts/inspect-backend.mjs`, `scripts/verify-live-backend.mjs` | Local regression tests, read-only probe, and authenticated live API/storage verification |
| `src/service-worker.js`, `scripts/verify-pwa.mjs` | Offline login navigation and unauthenticated browser checks |
| `.gitignore`, `.env.example`, `README.md` | Safe configuration and setup documentation |

Dependencies added: **none**. Existing Supabase packages are reused. Existing uncommitted Phase 1/2 changes are preserved.

## Phase 3 final status

Passed on November 13, 2026: public signup disabled; owner login/refresh/logout; `is_app_owner()` true for the owner only; owner reads of all ten tables with anonymous and real non-owner denial; private Storage upload, authenticated and signed download, anonymous/public/non-owner denial, path-ownership guards and cleanup (`node scripts/verify-live-backend.mjs`); `verify_foundation.sql` completed with no raised exception; browser login, persistence, logout and non-owner denial (`node scripts/verify-pwa.mjs`); lint, TypeScript, build and the five auth tests. Physical iPhone Safari and browser-restart persistence remain manual.

## Phase 4 — dashboard and navigation

- Routes under the `src/app/(app)` group share one owner-verified shell (`layout.tsx`, `requireOwner()`): `/` dashboard, `/universities`, `/scholarships`, `/applications`, `/calendar`, `/tasks`, `/documents`, `/settings`, plus mobile-only `/more`. Everything except the dashboard is an empty-state placeholder; no CRUD yet. Every future page must still call `requireOwner()`.
- Navigation (`src/lib/nav.ts`, `src/components/app-nav.tsx`): sidebar on desktop; five-item bottom bar on mobile (Dashboard, Applications, Tasks, Calendar, More) with safe-area padding. "More" lists the other routes and is highlighted on them.
- Dashboard: `src/lib/dashboard.ts` queries with the owner's RLS-scoped client; `src/lib/dashboard-logic.ts` holds pure calculations. Nothing is hardcoded or seeded; an empty database shows zeros and empty states, and a failed query reaches the error boundary.
  - *In progress* = researching, preparing, ready_to_apply. *Submitted* = submitted, under_review, interview, accepted, rejected. *Deadlines (30 days)* = deadlines dated today to +30 days.
  - Deadlines merge program and scholarship deadlines, events (by start date) and open tasks, sorted by date. Open tasks stay listed once overdue; other sources are listed only when not past. Red = overdue, amber = within 3 days.
  - Limits: each source is capped (20 per deadline source, 50 tasks), and "today" is the server's UTC date.
- Tests: `node --test scripts/verify-dashboard.mjs` unit-tests the logic and, with owner test credentials, inserts temporary rows (marked `ZZ`), checks the live loader against a baseline, and deletes them. `verify-pwa.mjs` also visits every route at 390px and 1440px checking navigation, active highlight, overflow and hydration errors.
- Note: Next keeps a previous route's DOM hidden after a client-side redirect, so a logged-out tab may retain hidden private markup until reload. It is not visible; consider a hard navigation on sign-out if this matters.

## Phase 4.5 — UX polish, PWA performance, security hardening

**Secure logout.** `POST /auth/signout` (a Route Handler with an Origin check, not a Server Action, because an action makes Next re-render the current private page mid-stream) revokes the session and clears cookies; `SignOutButton` then does `window.location.replace("/login")`, a hard navigation that discards all client state (Router Cache, hidden route DOM, JS). `SessionGuard` (mounted by the private layout) signs other tabs out through a `BroadcastChannel` and reloads any page Safari restores from the back/forward cache. Responses are already `private, no-store`, so back after logout hits the proxy and lands on `/login`. The service worker never caches documents, RSC or API data.

**Timezone.** `src/lib/time.ts` is the only place that decides what "today" is. Default `Asia/Karachi`; set `APP_TIMEZONE` (IANA name, invalid values fall back) to change it. Date-only columns are plain calendar days and are never converted; timestamps (events) are converted to a calendar day in the app zone; countdowns use whole-day UTC arithmetic on date-only strings, so there is no DST or one-day drift. Everything is computed on the server, so there is nothing for hydration to disagree about. Per-user timezones later mean passing a different zone to the same functions.

**Forms.** Password field has a show/hide toggle (`PasswordInput`: `type="button"`, keeps the value, `aria-label` + `aria-pressed`, 44px target). Login autofocuses email, uses `username`/`current-password`, keeps the typed email after a failed attempt, announces errors with `role="alert"`, and disables inputs and the button while signing in. There are no other password forms.

**Navigation and loading.** The private layout is static chrome that paints immediately. Each data page streams behind `loading.tsx` (dashboard skeleton for `/`, generic skeleton elsewhere); skeletons mirror the real layout, use `role="status"` with screen-reader text, and respect reduced motion. Nav items acknowledge a tap at once (`useLinkStatus`). Loading, empty, error (`(app)/error.tsx`, distinguishes offline) and success are separate states. `experimental.staleTimes.dynamic = 30` reuses a just-visited page for 30 s in memory only. After mutations (Phase 5) call `revalidatePath`/`router.refresh()` so edits show immediately. Placeholder pages are static and carry no data; the proxy still requires the owner. **Any page that reads Supabase must call `requireOwner()`.** The owner check now runs `getUser()` and `is_app_owner()` in parallel (both must pass).

**Measured** (production build, headless Chrome, 390px, 300 ms latency / ~250 KB/s, `node scripts/measure-nav.mjs`; single local runs, noisy):

| | Phase 4 | Phase 4.5 |
| --- | --- | --- |
| Tap to visible acknowledgement (median) | 16–20 ms | 3 ms |
| Tap to content, revisited routes (median) | 16–20 ms (Router Cache) | 17 ms |
| Cold load of `/tasks`, chrome / heading | ~780 / ~780 ms | ~320–450 / ~350–490 ms |
| Cold load of `/`, chrome / heading | ~880–1070 / ~1190–1820 ms | ~650–700 / ~1100–1470 ms |

Cold-load figures include the dashboard's real Supabase queries and vary run to run. A first visit to a route after a hard load still waits for its data (the skeleton shows meanwhile). No bundle-size measurement was made.

**Tests.** `node scripts/verify-ux.mjs` (needs `npm run start -- -p 3100` and owner test credentials): form behaviour, password toggle, slow-network acknowledgement, dashboard skeleton, 390/1440px layout, logout hard navigation, back button, cross-tab sign-out, cache contents, runtime/hydration errors. `scripts/verify-dashboard.mjs` adds timezone boundary tests (UTC 18:59/19:00 vs Karachi midnight, UTC+14, DST-free day math, events across midnight, invalid zone). `verify-pwa.mjs` still covers PWA, offline, updates and the route sweep. `scripts/measure-nav.mjs` prints timings. Run servers with `npm run build` first; `rm -rf .next/dev` if `tsc` complains about stale dev types.

**Not verified / limitations.** Physical iPhone Safari: bfcache restoration, keyboard overlap, standalone safe areas and install behaviour are untested (the code handles them but they need a device). Cross-tab sign-out needs `BroadcastChannel` (Safari 15.4+); older browsers sign out on the next request. The live backend suite occasionally reports a cleanup warning under load; leftovers were checked each time and none were found. The 30 s Router Cache means a page can be up to 30 s old on revisit until Phase 5 adds revalidation.

## Emerald design refresh

**Theme.** All colour lives in tokens in `src/app/globals.css` (`:root`), mapped through Tailwind `@theme inline`, so shadcn components and future pages inherit it. Palette: background `#F5FAF7`, text `#163D2A`, muted text `#587064`, card `#FFFFFF`, border `#DFEAE2`, primary (forest) `#166534`, emerald accent `#16A34A` (icons and decoration only, since white text on it fails AA), soft mint `#DCFCE7`, dark-forest sidebar `#0F3D27`. Semantic pairs `success`, `warning`, `danger`, `info` each have a `-soft` background (use `bg-warning-soft text-warning`). Chart tokens are greens. Measured contrast for text pairs: 4.9:1 minimum (muted on mint), most 5 to 11:1.

**Typography.** Geist via `next/font` (already self-hosted, no layout shift). One scale as component classes: `page-title`, `section-title`, `eyebrow`, `stat-value`, `help-text`. No text below 11px (bottom-nav labels), body 14px or more.

**Shared pieces.** `src/components/ui-kit.tsx` (`IconTile`, `Pill`, `PageHeader`, `EmptyState`) are server components with no client JavaScript; use them for new pages. Cards, inputs and buttons were restyled centrally in `components/ui`.

**Screens.** Dark-forest sidebar with an emerald active indicator; white bottom bar with a mint active pill (safe-area handling unchanged); login card with a forest graduation-cap tile on a mint wash; dashboard stat cards with tinted icon tiles (green for progress, blue for in-progress, amber for deadlines, red only for overdue), date chips on deadlines, status pills on applications, tinted empty states and matching skeletons; placeholder pages and /more share the header and empty-state components. Stat cards are intentionally not links: the destination pages are placeholders.

**Also fixed while testing.** A signed-in owner visiting /login is redirected by the proxy before rendering (the database owner check is kept to avoid redirect loops). Signing out marks the tab as leaving so its own BroadcastChannel message cannot trigger a second navigation. The browser tests now wait for dashboard content (not just the static shell) before signing a second tab out, because navigating away from an in-flight streamed page makes React report error #419 in the abandoned document. Test servers need to be started in the same shell call as the tests in this environment.

**Visual check.** Login, dashboard, /more and a placeholder page were screenshotted headlessly at 390px and 1440px and reviewed. A physical iPhone has not been checked.


## Phase 5 — Universities, Programs, Scholarships

Routes: `/universities`, `/programs`, `/scholarships` (each with `new`, `[id]`, `[id]/edit`). Server Actions in `src/lib/records/actions.ts` call `requireOwner()` and validate on the server (`src/lib/records/validate.ts`); lists are URL-driven (`q`, filters, `sort`, `page`) and server-paginated.

- Tests: `npm test` (unit), `node scripts/verify-phase5-live.mjs` (live Supabase, self-cleaning), `PWA_TEST_ORIGIN=http://localhost:3100 node scripts/verify-phase5-ui.mjs` (browser; needs `npm run build && npx next start -p 3100`).
- **Migration:** `supabase/migrations/20261113000100_phase5_relationships.sql` (scholarship links to programs/universities, preferred/type, opening date, extra funding types) has been applied. Without it the app still works and hides those features.
- Details: `docs/phase-5-audit.md`, `phase-5-implementation.md`, `phase-5-testing.md`, `phase-5-handoff.md`.
