# IMS-Frontend — Comprehensive Architecture, UI, API, Performance & Reliability Audit

**Date:** 2026-07-02
**Scope:** Entire repository (~32,500 lines: vanilla JS + Tailwind multi-page app, no framework, no bundler, no modules; backend is a single remote PHP RPC endpoint `api.php?action=...`).
**Method:** Four independent deep-dive audits (UI/UX consistency, API usage & caching, architecture & technical debt, frontend performance), cross-verified, deduplicated, and prioritized by: 1) data-integrity risk, 2) reliability risk, 3) performance, 4) maintainability, 5) UX.

> **Note on scope of sections 5–6 (backend/database):** this repository is frontend-only. Backend and database findings are assessed from the client-observable API contract (~90 distinct `action` values, response envelopes, error semantics). They are real architectural findings, but server-side code was not inspected.

---

# Executive Summary

This application works, but it is a **copy-paste-scaled prototype operating as production datacenter tooling**. The token/design system underneath (CSS variables + Tailwind theme) is healthy; almost everything built on top of it bypasses it. The most important facts a decision-maker needs:

1. **Live FTP credentials are committed to git** (`.vscode/sftp.json`), and deployment is *save-file-in-editor → upload to production over plaintext FTP within 8 seconds*, unreviewed, unbuilt.
2. **Hardware compatibility validation — the core value proposition of a datacenter IMS builder — is either commented out or literally fabricated with `Math.random()`.** The UI can bless physically incompatible builds and mask API outages with invented data.
3. **The edit path has zero validation** while the add path validates — any record can be corrupted after creation.
4. **Every deploy risks serving year-stale JavaScript**: `.htaccess` marks all JS/CSS `Cache-Control: public, max-age=31536000, immutable` on the (false) premise that assets are query-string versioned; only 3 of ~25 script references carry a `?v=` param.
5. There are **8 parallel API client implementations** with divergent auth, 401, refresh, and error behavior; **9 copies of the HTML-escape helper**; **~9 modal implementations**; **5+ toast systems**; **~7 primary-button styles**; and **~6,900 lines (~23% of the codebase) of dead or duplicated code**.
6. **Zero tests, zero CI, zero linting, zero type checking, zero error telemetry.**

The root cause behind nearly every finding is the same: **no module system, no build step, and no shared component layer**, so every feature was built by copying the previous one, and every copy has drifted. The permanent cure is a strangler-style migration to **Vite (MPA mode) + ES modules + TypeScript** with one API client, one validation schema, and a small set of design-system components — not another round of hand-patching the copies.

**Estimated total to a defensible baseline: 6–9 engineer-weeks.** The P0 security/data-integrity items are ~3 days.

---

# Top 10 Issues at a Glance

| # | Issue | Category | Severity | Priority basis |
|---|---|---|---|---|
| 1 | FTP credentials committed to git; save-on-upload plaintext-FTP deploy to prod | Security / Operations | **Critical** | Reliability + security |
| 2 | Compatibility checking disabled / fabricated with `Math.random()`; mock data masks API failures | Data Integrity | **Critical** | Data integrity |
| 3 | Edit form has zero validation (add form validates); no serial-number validation anywhere | Data Integrity | **Critical** | Data integrity |
| 4 | 1-year `immutable` caching with no cache-busting → year-stale JS after deploys | Reliability / Operations | **High** | Reliability |
| 5 | Stale in-memory caches after mutations: deleted servers still shown, new servers missing | Reliability (live bug) | **High** | Data integrity (perceived) |
| 6 | 8 divergent API clients; token refresh works in only 1; refresh race conditions; stale axios tokens | Reliability / Architecture | **High** | Reliability |
| 7 | XSS surface: 183 `innerHTML` sinks, 9 escape helpers, 39 inline `onclick` handlers, `'unsafe-inline'` CSP, tokens in localStorage | Security | **High** | Reliability |
| 8 | No modules/bundler/types/tests/CI; 30 window globals; script-order fragility (already broken on one page) | Architecture | **High** | Maintainability |
| 9 | ~6,900 lines dead/duplicated code (acl.js, server-list.js, test.html, duplicate login page, 10 clone pages…) | Technical Debt | **High** | Maintainability |
| 10 | No design system adoption: 9 modals, 5 toasts, 7 button styles, 5 status-badge systems with contradictory mappings | UI/UX | **High** | UX + maintainability |

---

# P0 — Critical Findings (fix this week)

## P0-1. Committed FTP credentials + save-to-production deployment

* **Category:** Security / Operational Safety
* **Severity:** Critical
* **Location:** `.vscode/sftp.json` (host `server1.quickvirtuals.com`, `protocol: "ftp"` port 21, username, plaintext password, `uploadOnSave: true`, `watcher.autoUpload: true`)
* **Root Cause:** IDE-plugin deployment adopted as *the* deployment mechanism; `.vscode/` never gitignored. The credential is in 50 commits of history and in every clone/fork.
* **Business Impact:** Anyone with repo access (or any past clone) can modify production frontend code — which handles auth tokens for the datacenter inventory system. Plaintext FTP also exposes the credential to network interception. Save-on-upload means a half-finished edit ships to production users within 8 seconds, per-file (users can receive mixed old/new files mid-save-burst).
* **Technical Impact:** No reviewable, atomic, or rollback-able deploys; combined with P0-4 caching, production state is unknowable.
* **Why superficial fixes fail:** Deleting the file in a new commit does **not** revoke the credential — it remains in git history.
* **Recommended Fix (in order):** (1) Rotate the FTP password immediately. (2) Disable plaintext FTP on the host; require SFTP/FTPS. (3) Scrub the file from history (`git filter-repo`) and gitignore `.vscode/`. (4) Replace editor-upload with a scripted deploy (CI job, rsync-over-SSH, atomic release directory).
* **Effort:** Rotation: 1 hour. History scrub + minimal pipeline: 1–2 days.
* **Long-Term Value:** Prerequisite for every other reliability improvement.
* **Mandatory.**

## P0-2. Hardware compatibility validation is fake, disabled, or silently mocked

* **Category:** Data Integrity
* **Severity:** Critical (this is the core domain function of the product)
* **Location:**
  * `assets/js/server/configuration.js:510-512, 1124-1126` — `loadMockComponents()` fallback is live: on API failure the picker silently renders **fabricated demo inventory**.
  * `configuration.js:1205` — `compatibilityScore: 0.9 + Math.random()*0.1`; `:1200-1202` random price/rating; `:1275-1282` **random CPU clocks, TDP, cache**; `:1239` random storage capacity; `:1530-1902` ~700 lines of hardcoded demo components with invented scores.
  * `assets/js/server/server-builder.js:667` — the *active* `checkCompatibility()` only checks "is a required slot empty". The real socket/type/RAM-pairing checks are commented out (`:579-666`, removal block `:695-731`); a full dead copy of the old method remains at `:579`.
* **Root Cause:** Demo scaffolding shipped to production; client-side rule engine abandoned mid-refactor instead of being replaced by an authoritative server-side check.
* **Business Impact:** An operator can assemble a configuration the UI blesses — or decorates with a fabricated 0.9x compatibility score — that is physically incompatible (socket mismatch, etc.). For a datacenter: wasted rack time, RMAs, deployment failures, and mistrust of inventory data. Worse, when the API is down, the picker shows invented inventory instead of an error — operators can make decisions on data that does not exist.
* **Technical Impact:** API outages are invisible; compatibility semantics are undefined; the commented-out code makes intended rules ambiguous to every future maintainer.
* **Why superficial fixes fail:** Re-enabling the commented client-side checks recreates duplicated rules that drift from the backend. Compatibility rules must be authoritative in exactly one place.
* **Recommended Fix:** Delete all mock/fallback/`Math.random()` paths — fail loudly and visibly when the API is unavailable. Delete the commented-out rule engine. Render only backend-computed compatibility (the API already returns `compatibility_score` / `compatibility_reason`, `configuration.js:676-677`); treat the backend as the single source of truth and have the client display, never invent.
* **Effort:** 3–5 days frontend (+ backend verification of rule coverage).
* **Long-Term Value:** Restores the product's core promise; removes ~900 lines of dangerous dead weight.
* **Mandatory.**

## P0-3. Add/Edit validation divergence; no serial-number validation

* **Category:** Data Integrity
* **Severity:** Critical
* **Location:** `assets/js/forms/add-form.js:1759` (`validateForm()`: required-visible-field checks + purchase/installation/warranty date-ordering); `add-form.js:2006` (comment: "no serial number validation"); `assets/js/forms/edit-form.js:185` (`handleSubmit` posts DOM contents with **zero validation** — no required fields, no date checks).
* **Aggravator:** `add-form.js:1759-1777` decides which fields are required by inspecting `getComputedStyle(field).display !== 'none'` — **CSS is the validation configuration**. A stylesheet refactor silently changes what gets validated.
* **Root Cause:** Validation written per-form instead of per-entity; edit form written later and never given rules.
* **Business Impact:** Any inventory record can be made invalid through the edit path (the add-path rules are theater). No serial format/uniqueness checking on an *inventory* system invites duplicate/unfindable physical assets.
* **Recommended Fix:** One shared field-schema module per component type (fields, types, constraints, required-ness) that **both renders the forms and validates them** (both forms already render dynamically, so this is structurally easy). Mirror the same schema server-side as the authoritative layer. Kill computed-style-based requiredness.
* **Effort:** 1 week.
* **Long-Term Value:** Single place to evolve entity definitions; add/edit can never diverge again.
* **Mandatory.**

## P0-4. Year-stale JavaScript: `immutable` caching with no cache-busting

* **Category:** Reliability / Operations
* **Severity:** High (Critical in combination with P0-1's un-versioned deploys)
* **Location:** `.htaccess` (root) and `assets/.htaccess`: `Cache-Control: public, max-age=31536000, immutable` on all JS/CSS, with a comment claiming assets "are versioned by query string in the app" — **they are not**. Verified: only `pages/dashboard/servers.html:178-180` and one script in `pages/server/configuration.html` carry `?v=3`; every other script/CSS reference on every page is unversioned (including `dashboard.js`, 152 KB, and `tailwind.css`). The scattered `?v=3` marks show this failure mode has already occurred at least three times.
* **Root Cause:** Cache policy written for a build pipeline that does not exist.
* **Business Impact:** After any deploy, returning users can run up to year-old JS against a changed API — stale validation logic on an inventory system is a data-integrity incident generator; stale API contracts cause silent breakage that support cannot reproduce.
* **Recommended Fix:** Content-hashed filenames from a build step (falls out of the Vite migration, P2-1) + keep `immutable` for hashed assets, `no-cache` for HTML. **Interim (same day):** drop `immutable` and reduce asset `max-age` to something short (e.g. 5 minutes) until hashing exists. Remove hand-maintained `?v=` strings.
* **Effort:** Interim fix: 30 minutes. Permanent: part of P2-1.
* **Mandatory.**

## P0-5. Live correctness bugs (verified in code)

* **Category:** Reliability
* **Severity:** High
* **Findings:**
  1. **Deleted servers keep showing; new servers don't appear.** `dashboard.js:2368` (`handleDeleteServer`) and create-server (`:1056`) call `loadServerList()` without `forceRefresh`; the `this.allServers` in-memory cache (`:469`) short-circuits the fetch, so the list renders stale data until a manual hard refresh. For an inventory tool, the UI lying about what exists is a data-integrity problem in practice. **Fix:** invalidate `allServers` on every mutation.
  2. **"Add selected components" is broken.** `configuration.js:2777-2782` references `configUuid`, `componentType`, `componentUuid` — all undefined in scope → ReferenceError on first use. The feature cannot ever have worked.
  3. **Dashboard 5-minute auto-refresh never runs.** `dashboard.js:3120-3127` checks `if (dashboard && ...)` at top-level script evaluation, before `DOMContentLoaded` (`:3109-3111`) assigns `dashboard` — always false. Dead feature; the `beforeunload` cleanup is unreachable.
  4. **Global search calls the API and discards the result.** `dashboard.js:786-795` — `api.search.global(query)` fires per debounced keystroke (≥2 chars) on every page with a navbar, and the success branch is an empty `if` block. 100% wasted API traffic; the navbar version (`navbar.js:189-192`) is an empty stub.
  5. **Stale axios tokens destroy refreshable sessions.** `server-api.js:8-11` and `rack-api.js:9-10` freeze the token into `axios.defaults` at construction. After `api.js` refreshes the token, the axios layers keep sending the old one → 401 → `server-api.js:56-59` wipes ALL tokens and hard-redirects to login mid-edit, killing a session that was still valid.
* **Root Cause (common):** No tests; no code review gate (deploy is save-to-FTP); duplicated clients/caches with no invalidation discipline.
* **Recommended Fix:** Fix all five now (each is ≤1 hour); they also motivate P1-1 (single API client) and P2-2 (CI + tests).
* **Effort:** ~1 day total.
* **Mandatory.**

---

# 1. UI/UX Consistency Audit

**Overall:** the token layer (`assets/css/globals.css:43-122` CSS variables; `tailwind.config.js` theme) is healthy and worth building on. But **three generations of UI code coexist**: a dead Bootstrap-era layer (`server-list.js`, `acl.js`, `create-role.html`, `pages/index.html`), an inline-style/legacy-variable layer (parts of `dashboard.js`, `configuration.js`), and the current Tailwind-token layer. Counts across the app: **~9 modal implementations, 5 live toast paths (+2 dead), ~7 primary-button styles, 6 loading patterns, 6+ empty-state patterns, 5 status-badge systems, 3 pagination patterns, 3 copies of the theme-toggle script.**

## 1.1 High-severity UI findings

| Finding | Location | Root cause | Permanent fix | DS component |
|---|---|---|---|---|
| `hover:bg-primary-600` is a **visual no-op** on ~47 primary CTAs (`primary-600` === `primary` DEFAULT `#0F766E`) and, because utilities beat the components layer, it *cancels* `.btn-primary`'s real hover | `tailwind.config.js:19,31`; e.g. `pages/dashboard/cpu.html:100`, `acl.html:96-104` | Token scale defined with 600=DEFAULT; buttons restated per page | Ratify one Button recipe in `@layer components`; fix the 600 token or use `primary-700`; strip per-page restatements | **Button** (top priority) |
| **Undefined CSS variables silently break live UI**: `var(--primary-color)`, `var(--danger-color)`, `var(--text-secondary)`, `var(--bg-secondary)`, `var(--border-color)`, `var(--sidebar-bg)` are used but never defined (only `--color-*` names exist) — loading/error/empty states render with inherited/initial colors | `dashboard.js:1220,1395,1471,2607,2623`; `configuration.js:3048-3058` | Legacy variable names survived a token rename | Rename to `--color-*` or Tailwind classes; add stylelint rule banning unknown custom properties | — |
| **9 modal implementations; none except `utils.confirm` closes on Escape; zero `role="dialog"`, zero `aria-modal`, zero focus traps in the repo** | `dashboard.js:2252-2318` (+ 2 more modal lifecycles in same file `:1382,1523`), `utils.js:267-343`, `requests.js:107,743`, `request-types.js:407`, `rack-view.js:506-513` (global always-on Escape listener at `:63`), `server-builder.js:1981`, `configuration.js:2880-2885`, `index.html:313` | No shared Modal module | One Modal module: open/close, Escape, focus trap, aria, size variants, `z-modal` token | **Modal** |
| **5 toast systems + native `alert()`/`confirm()` mixed with styled `utils.confirm`** — users see two different confirmation UIs depending on which delete button they press; type vocabularies disagree (`danger` vs `error`); `utils.showAlert` and `script.js showAlert` have **reversed argument orders** | `toast.js:6-160` (canonical); `utils.js:7-69` (w/ second full fallback impl); `script.js:492-535`; `server-builder.js:3570-3584`; `configuration.js:3007-3015` (falls back to native `alert()`); `requests.js:768-772`; native `confirm()` in 10+ places (`dashboard.js:1617,1705,3021`; `requests.js:598`; `rack-view.js:339,485`; …) vs `utils.confirm` in 5 | Each feature rolled its own | Standardize on `toast.js` + `utils.confirm`; delete every fallback; one type vocabulary | **Toast/Confirm** |
| **Status/badge color maps duplicated with contradictions**: the action keyword `'added'` renders **green** in dashboard recent-activity (`dashboard.js:371`), **blue** in server history (`dashboard.js:2190`), **gray/unmapped** on the activity-log page (`activity-log.html:166-168`). Config statuses 0-3 have 3 separate implementations; dead `server-list.js:262-270` maps the same codes to *different labels*. Light-only chips (`bg-green-100 text-green-700`) have no dark variants → unreadable in dark mode | `utils.js:197-217` + `globals.css:348-378`; `dashboard.js:631-640`; `rack-view.js:516-518`; `requests.js:710-741` | No single badge utility | One `statusBadge(domain, value)` in utils with token-based colors + dark variants | **Badge** |
| **13 hand-synced component pages, already drifted**: 11 byte-identical modulo title; `cpu.html:201-207` + `storage.html` retain a legacy `#loadingOverlay` the other 11 deleted (behavioral difference: it's the fallback target of `utils.showLoading`, `utils.js:90`); `vendors.html` fully forked the table design | `pages/dashboard/*.html` | No templating mechanism | One parameterized ListPage shell driven by `data-component-type` | **ListPage shell** |
| **Two navbar strategies + 3 copies of the theme-toggle script**: 19 pages inline a ~50-line navbar copy + ~60-line inline theme script (×15 pages), while `builder.html:15`/`configuration.html` use `#navbar-placeholder` + `navbar.js` (which contains the same theme logic again, `navbar.js:97-235`) | e.g. `cpu.html:20-72, 221-284` | Componentization started, never finished | `navbar-placeholder` everywhere; shared `theme-init.js` | — |
| **Dark mode absent at the auth boundary; FOUC on several pages**: pre-paint theme snippet missing from `builder.html`, `configuration.html`, `create-role.html`, `pages/forms/*.html` (theme applies at DOMContentLoaded → light flash); login/`reset-password.html`/`pages/index.html` have no dark support at all (hardcoded `#FFFFFF/#DFE3E6`, `index.html:52-66`) | as listed | Theme snippet is hand-copied per page | Shared inline theme-init via the page template | — |

## 1.2 Medium-severity UI findings (summary)

* **Buttons:** 7 live primary patterns (padding-based vs `h-10` height-based sizing; three different hover tokens: `primary-dark`, `primary-600`, `primary-hover`; slate-colored one-off cancel `dashboard.js:992`). Secondary buttons: two different visuals both named `btn-secondary` (`globals.css:201-203` vs `cpu.html:104-108`).
* **Radius:** `.btn-primary` is 6px (`rounded`, `globals.css:198`) while page-level restatements add `rounded-lg` (10px) on the same element — same-named buttons render with different radii depending on call site. Dashboard index alone mixes `rounded-2xl` ×12, `rounded-xl` ×15, `rounded-lg` ×5.
* **Hardcoded colors:** 18 hex occurrences in JS. Live pages: `configuration.js:3063-3092` (off-token greens/reds in an injected `<style>`), `script.js:191` (`#ff416c` — a pink in no palette, on the login error path). Dead code carries a previous indigo brand (`server-list.js:98-189`). Off-palette Tailwind (`bg-emerald-500`, `bg-indigo-500/10`, `bg-blue-100`, `bg-slate-*`) throughout `index.html`/`dashboard.js`; rack dark palette uses gray-800 family (`racks.html:165-168`) instead of the app's dark surfaces (`globals.css:103-110`).
* **Typography:** arbitrary sizes (`text-[9px]`…`text-[15px]`) bypass the token scale; three h2 treatments for the same slot; two table-header type styles (cpu vs vendors); `racks.html` uses a non-brand mono stack.
* **Tables:** canonical `.table-base`/`.components-table` with mobile card-collapse (`globals.css:764-876`) vs vendors' forked design (`vendors.html:114-146`) vs card grid (servers) vs stacked cards (requests) vs a third inline-built table (`activity-log.html:162+`). No `scope="col"` anywhere.
* **Forms:** `edit-form.js` is the model citizen (proper `form-*` classes + `for=` attributes); `add-component.html` restates utilities on every field, has **0 `for=` attributes**, misuses `form-input` on a `<select>`, and carries a 118-line inline style block; location option lists are duplicated as hardcoded arrays in both add and edit paths (will drift); ACL modal, create-server modal, and login each use further distinct recipes.
* **Loading:** 6 patterns, no skeletons anywhere; inline `fa-spinner` blocks each hand-rolled with different sizes/colors, one styled by an undefined CSS var (`dashboard.js:1395`).
* **Empty/error states:** 6+ empty patterns (including legacy inline-style ones using undefined vars); 4 error patterns; dead `acl.js` renders `.empty-state` divs whose class has no CSS at all.
* **Pagination:** numbered (`dashboard.js:713-760`), prev/next-only (`requests.html:180-186`), info-only (`vendors.html:141-144`), and absent (ACL, activity-log, racks); two competing formats write `paginationInfo` ("Showing 0 of 0 items" vs "Showing 1-25 of N items").
* **Breakpoints:** raw media queries mix 639/640/767/768/1023/1024/1280; **off-by-one at `globals.css:1831`** (`max-width:1024px` overlapping `min-width:1024px` at `:2169` — both mobile and desktop sidebar rules apply at exactly 1024px). Touch targets mix 40px and 44px minimums.
* **Accessibility:** no focus traps; unlabeled checkboxes (`cpu.html:118`, per-row `dashboard.js:588`); icon-only buttons inconsistently labeled; server cards are click-only `<div>`s — not focusable, no `role`/keydown (`dashboard.js:643`) — while rack cards do it correctly (`racks.html` `.rk-rackcard:focus-visible`); contrast failures: placeholder-as-label `#9CA4AB` on white ≈ 2.3:1, micro-text at 9–10px in muted colors, blue-on-blue chips in dark mode; no skip links.

**Design-system build order (recommendation):** Button → Modal → Badge/Status → FormField → Table → EmptyState/ErrorState → Spinner/Skeleton → Pagination → ListPage shell. Bake aria/Escape/focus behavior into the components so accessibility is automatic rather than per-call-site discipline.

---

# 2. API Usage Audit

## 2.1 Eight API client layers (should be one)

| # | Client | File | Transport | 401 handling | Refresh |
|---|---|---|---|---|---|
| 1 | `window.api` | `assets/js/dashboard/api.js:80-186` | fetch + FormData | body `code===401` + message string-match → refresh + retry | **Yes** (`:189-226`) |
| 2 | `ServerAPI` | `assets/js/server/server-api.js:36-64` | axios (global default header set once, `:8-11`) | wipe tokens + hard redirect | No |
| 3 | `RackAPI` | `assets/js/rack/rack-api.js:13-37` | axios (same frozen-token pattern) | wipe + redirect; errors **returned** `{success:false}`, not thrown | No |
| 4 | `RequestsManager` | `requests.js:118-135` | raw fetch (**sessionStorage-first** token — opposite of #1) | none (no `response.ok` check) | No |
| 5 | `RequestTypesManager` | `request-types.js:49-68` | copy-paste of #4 | none | No |
| 6 | Login page | `script.js:400-473` | fetch + URLSearchParams | n/a | own `refreshAccessToken()` (`:668-707`), never used post-login |
| 7 | `add-form.js` fallback | `add-form.js:1954-1967` | raw fetch, own hardcoded base-URL fallback | none | No |
| 8 | Reset-password inline | `reset-password.html:246` | raw fetch | n/a | n/a |

**Observable consequence today:** on token expiry, dashboard actions self-heal via refresh while server-builder/rack/requests actions hard-fail, silently return empty lists, or bounce the user to login mid-edit. Four different error contracts (throw / `{success:false}` / raw JSON / redirect) force every caller to handle errors differently.

**Auth-flow defects (all High unless noted):**
1. Refresh only triggers on HTTP-200-with-body-`code:401` — `api.js:134-137` throws on any real HTTP 401 *before* the check at `:140`; the "expired" detection string-matches the error message (`:140-141`) — contract-by-coincidence.
2. **No refresh mutex** (`api.js:189-226`): N concurrent expired requests fire N parallel refreshes with the same refresh token; if the backend rotates refresh tokens, losers invalidate the session → random logouts on busy pages.
3. Frozen axios tokens (see P0-5.5).
4. `auth-verify_token` fires on **every page load** (`api.js:723-746`) — one extra API round trip per navigation that gates nothing (Medium). Decode JWT `exp` locally instead.
5. Token storage priority conflict: localStorage-first (#1) vs sessionStorage-first (#4/#5) — with remember-me + a later non-remember login, two different tokens are in play on one page (Medium).
6. **Three logout implementations** (`api.js:255-269`, `navbar.js:171-184`, `server-list.js:453-465`); only one revokes the refresh token server-side (Medium).
7. Axios global `Authorization` default (`server-api.js:11`) attaches the bearer token to **any** axios request to **any** origin from those pages — one future `axios.get(thirdPartyUrl)` leaks the token (Medium, 1-hour fix).

**Fix (permanent):** One `ApiClient` module: per-request token read, status-401-first refresh behind a shared in-flight promise, normalized `{ok, data, error}` result, timeouts, AbortController, machine-readable error codes. Delete the other seven clients and the axios dependency (only 2 of 8 clients use it, yet it loads from CDN on 5 pages). **Mandatory, 3–5 days.**

## 2.2 N+1 and chatty patterns

| Pattern | Location | Severity | Fix |
|---|---|---|---|
| ACL page: `roles-get` × N roles just to show counts (`Promise.all(this.roles.map(r => this.getRoleById(r.id)))`) after 3 *sequential* list calls that could be `Promise.all` | `acl-manager.js:34,42,65,167-176` | High | Backend: counts in `acl-get_all_roles` (row renderer already supports the fields, `:187-199`) |
| Bulk delete = sequential `{type}-delete` per selected id (50 selected = 50 round trips) while a `bulkUpdate` pattern already exists (`:2087`) | `dashboard.js:2113-2121` | High | Backend `{type}-bulk_delete` action |
| Template component-name resolution: sequential await per component; `lookupComponentNameByUuid` uses raw `fetch`, **bypassing `ServerBuilder.jsonCache`** → the same multi-hundred-KB JSON re-downloaded per component | `server-builder.js:907-921, 948` | Medium | Use `fetchJSON` + build a uuid→name index once |
| Template import: sequential `server-add-component` per item (ordering constraint noted at `template-manager.js:93`) | `template-manager.js:149` | Medium | Server-side transactional `server-import-template` action |
| Component picker: 9 spec JSONs fetched sequentially in a `for` loop | `requests.js:636-641` | Low | `Promise.all` + shared cache |

## 2.3 Over-fetching / client-side filtering of full datasets

* `server-list-configs` fetched with **no params** ("get all servers", `dashboard.js:471`); all search/filter is client-side (`:495-554`) even though the API supports `limit/offset/status` (`server-api.js:83-90`). **High at fleet scale.**
* `vendor-list`, `users-list`, `roles-list` — unpaginated, filtered in memory.
* Component-page status filter filters only the current 50-row page (`dashboard.js:438-458`) → "Showing X of Y" counts are wrong and matching items on other pages are invisible. **Medium (correctness).**
* Template import caps inventory lookups at `limit=100` (`template-manager.js:88`) — items beyond 100 silently reported as "No matching inventory". **Medium (silent truncation).**
* Entire spec-JSON catalogs (`/ims-data/*-level-3.json`) are downloaded and deep-scanned in the browser to resolve single UUIDs (`dashboard.js:1797`, `server-builder.js:948`, `configuration.js:621-627`) — the database is shipped to the client per lookup. Needs a `spec-get?uuid=` action.

## 2.4 Missing request infrastructure

* **AbortController: zero occurrences repo-wide.** Concrete race: serial search fires per debounced keystroke (`dashboard.js:529`); out-of-order responses render stale results; switching component type in configuration.js doesn't cancel the prior type's in-flight load.
* **Timeouts: none** (fetch untimed; axios default 0). A hung `api.php` leaves the full-screen loading overlay up **forever** (`global-loading.js:137-183` counts active requests with no ceiling/timeout). High UX risk.
* **Retry/backoff: none** beyond the single 401-refresh retry.
* **Deduplication:** only `SidebarManager.pendingRequests` (`sidebar-manager.js:276-302`); nothing dedupes the double `dashboard-get_data` on the index page (sidebar + `dashboard.js:255` both fetch it within milliseconds).
* **Debounce:** present and adequate on all text searches (300–500ms) — the one gap is the range-slider filter (see §4.2).

## 2.5 Per-call disposition table (merge / defer / eliminate)

| Call | Disposition |
|---|---|
| `dashboard-get_data` ×2 on index | **Merge** through SidebarManager (single flight) |
| `auth-verify_token` every page | **Eliminate** (local JWT `exp` check; rely on 401-refresh path) |
| `dashboard-get-logs` on index (`dashboard.js:354`, serialized after stats) | **Defer** (below the fold; skip for non-admins who always get the fallback row) |
| N× `roles-get` on ACL | **Merge** into list endpoint |
| `server-list-configs` (all rows) | **Paginate** server-side |
| `server-builder.js` + `template-manager.js` loaded up-front on servers.html | **Lazy-load** when the builder opens (add/edit forms already lazy-load correctly, `dashboard.js:860-885, 1735-1743`) |
| `search-global` per keystroke with discarded result (`dashboard.js:786-795`) | **Eliminate** (or implement the feature) |
| Sidebar counts after mutations | **Background-refresh** (`sidebarManager.getComponentCounts(true)` after add/delete/bulk) |
| Form HTML + spec JSON re-fetched on every add/edit open (`dashboard.js:1731`, `add-form.js:216`) | **Memoize** in module scope |

---

# 3. Caching Strategy Audit

**What exists (and is good):** `SidebarManager` is the only disciplined cache in the app — 3 tiers: memory 5 min (`sidebar-manager.js:9`), localStorage 30 min (`:390-410`), in-flight dedup (`:276-302`). `ServerBuilder.jsonCache` (static Map, `server-builder.js:8-19`) is correct but **bypassed by 5 call sites** (`server-builder.js:948`, `configuration.js:1154`, `dashboard.js:1797`, `add-form.js:216`, `requests.js:638`).

**Problems:**

| Cache | Problem | TTL / Invalidation | Severity | Fix |
|---|---|---|---|---|
| Sidebar counts (mem + localStorage) | `invalidateCache()`/`clearCache()` (`sidebar-manager.js:311,415`) have **zero callers** — counts stale up to 30 min after any add/delete, across sessions | 5m/30m, never invalidated | Medium | Invalidate on every mutation |
| `dashboard.allServers` | Never invalidated on mutation → P0-5.1 (deleted servers shown) | none | High | Null on mutation |
| `bdc_user` blob (roles + permissions) | Written at login (`script.js:278`) and refresh (`api.js:215`), **never re-fetched** — permission revocations don't propagate to sidebar gates (`sidebar-manager.js:73-93`), page gates (`dashboard.js:71-90`), requests perms (`requests.js:37-47`) until re-login. UI-only (backend must still enforce), but stale-authz UI is confusing and risky | ∞ | Medium | `auth-verify_token` should return the fresh user; client updates storage |
| HTTP asset cache | 1-year `immutable` with no hashing → P0-4 | 1y | High | Content hashes |
| `bdc_sidebar_counts` in localStorage | Not cleared on logout (`navbar.js:171-184`) — persists across users on shared machines | 30m | Low | Clear on logout |
| Form auto-save (`script.js:643-676`) | Writes every text/email input to localStorage keyed by element id — **including the login page** (username persistence side-channel) and across users | ∞ | Medium | Scope to intended forms; clear on logout |
| Browser/HTTP caching of API | Impossible: all reads are POST (see §5) | — | Medium | Reads on GET with ETags, or accept and cache client-side deliberately |
| Service worker / CDN / edge | None (acceptable for an internal tool; revisit after asset hashing) | — | Low | Optional |

**No optimistic updates anywhere** — every mutation is spinner → full refetch (except where the refetch is broken, P0-5.1). Acceptable pattern for this domain (correctness over perceived speed), but invalidation must actually happen.

---

# 4. Frontend Performance Audit

**Measured totals:** ~856 KB unminified first-party JS; `tailwind.css` 119,457 B (minified); largest files: `server-builder.js` 154,336 B, `dashboard.js` 152,716 B, `configuration.js` 130,641 B, `add-form.js` 82,275 B.

## 4.1 Asset delivery (High)

* **Every page ships the 152 KB `dashboard.js` monolith** (all 19 dashboard pages); `servers.html` ships **396 KB** of local JS (dashboard.js + server-builder.js + more) plus axios and Bootstrap from CDN. Component pages: 226 KB across 7 files. dashboard.js is ~60–70% dead code on any single page. → per-page entry points via a bundler.
* **No JS minification** (only Tailwind CSS is minified): ~856 KB raw vs ~350 KB minified (~110 KB gzip) — a 2–3× transfer/parse saving available.
* **Dead dependencies:** npm `axios` in package.json is never served (CDN axios is used instead) — remove one or the other; **Bootstrap bundle (~80 KB) loaded on 3 pages** (`servers.html:172`, `builder.html:74`, `racks.html:337`) is referenced **only by dead code** (`server-list.js:288,306`) and no Bootstrap CSS is linked anywhere — fully removable.
* **Font/CSS chain:** `tailwind.css:1` starts with `@import` of Google Fonts CSS → serial chain HTML → tailwind.css → fonts CSS → font files (3 RTTs before text settles, ~300–600 ms FCP on cold cache); Font Awesome full set render-blocking in `<head>` on every page; some pages double-declare fonts with *different weight sets*. Fix: `<link rel=preconnect>` + direct font links (or self-host), subset the icons.
* Positive: local scripts sit at end of `<body>` (not render-blocking); the inline theme snippet is correctly placed for anti-FOUC where it exists.

## 4.2 Computation & rendering

* **Filter loop does ~12,000 DOM queries per filter event (High):** `configuration.js:1922-1976` runs `document.querySelector('.filter-pill[data-filter=...]')` and `getElementById` **inside** the per-component filter callback — components × filters queries per event. Fix: read filter values once into a plain object before `.filter()`. Estimated 50–300 ms → <5 ms.
* **Range slider re-filters + fully re-renders per `input` event with no debounce/rAF** (`configuration.js:462`) — dozens of events/sec while dragging, each triggering the query storm above plus a full innerHTML rebuild (`:1978`). Visible jank on any non-trivial catalog. (High)
* **configuration.js renders the entire unpaginated catalog** — all compatible *plus* incompatible components in one call, matched against full spec JSONs, all rows written to the DOM, no pagination/virtualization (`configuration.js:606-629, 2079-2108`); holds two full copies of the dataset in memory (`components` + `filteredComponents`). (High at inventory scale)
* Full-table innerHTML rebuild on every change is the universal pattern (`dashboard.js:577`, `requests.js:201`, `acl-manager.js:178,317`, `rack-view.js:117,236`) — but correctly **batched** (`map().join('')` + one write; zero `innerHTML +=`-in-loop patterns found) and dashboard tables are paginated at 50/page, so acceptable *except* configuration.js above.
* `utils.slideUp/slideDown` (`utils.js:505-540`) animates `height` in a rAF loop — layout per frame; move to CSS transitions (`grid-template-rows` or transform). (Low-Medium)

## 4.3 Listeners, timers, memory

* 207 `addEventListener` vs 2 `removeEventListener`, but most attach once per page load or to nodes destroyed by innerHTML replacement — **no unbounded leak found** (MPA navigation resets the heap; the cost surfaces as re-download/re-parse instead). Local issues: per-row listeners re-attached per render (`requests.js:203`, `dashboard.js:1443-1444`) — use delegation (also required to remove the 39 inline `onclick` handlers blocking CSP tightening); sidebar menu links get **duplicate** click listeners via two attach paths (`sidebar-manager.js:118-120` + `:189`); verify every `closeModal` path removes `modal._outsideClickHandler` (`dashboard.js:2288-2290`) or handlers stack on the persistent node.
* The only `setInterval` in the app is the dead auto-refresh (P0-5.3). No MutationObserver/ResizeObserver. Toast timeouts self-clean.

## 4.4 Per-navigation MPA cost (High)

Every sidebar click is a full page load: ≈ **470 KB+ and 12–16 requests**, including HTML, tailwind.css (119 KB), Font Awesome, fonts, 7+ local JS files, `sidebar.html`/`navbar.html` fetches, `auth-verify_token` POST, sidebar-counts POST (cached), and the page's data call — 2–3 API round trips before content. Worst flow: server-builder "add component" **navigates to configuration.html and back — two full page loads to add one part** (`server-builder.js:3304`). Fixes in order of leverage: asset hashing + minification + split bundles (P2-1); eliminate `auth-verify_token` per page; memoize fragment fetches; long-term, a persistent shell (SPA or islands) removes ~90% of per-nav cost.

---

# 5. Backend/API Architecture Audit (client-observable)

The backend is a single RPC endpoint: `api.php?action=<name>`, POST-only (`api.js:108`), ~90 distinct actions.

| Finding | Evidence | Severity | Recommendation |
|---|---|---|---|
| **RPC-over-POST-only defeats HTTP semantics** — reads are not GET, so no browser/proxy caching, no conditional requests, ever | `api.js:108`; clients #4/#5 inconsistently *do* use GET-with-query (`requests.js:131`) | High | Reads on GET (or explicit client caching); consistent method policy |
| **No API versioning; error contract is string-matching** — clients match `message.includes('expired')` (`api.js:141`), `includes('not found')` (`configuration.js:2483`) | as cited | High | Stable machine-readable codes (`{code:'TOKEN_EXPIRED'}`) + versioned actions |
| **Inconsistent envelopes** — HTTP-200-with-body-401 vs real statuses; `data.components` vs `data.configuration.components` (`server-builder.js:205-215` vs `template-manager.js:55-58`); `pagination` object vs bare `total_count` (`dashboard.js:414-424`); `result.data.data` double nesting (`dashboard.js:1433`) — every variant has defensive client code | as cited | High | One response envelope, enforced server-side |
| **Missing aggregation/batch endpoints** (each maps to an N+1 above): `roles-list-with-counts`, `{type}-bulk_delete`, transactional `server-import-template`, paginated `server-list-configs` actually used, `spec-get?uuid=`, `auth-verify_token` returning the fresh user object | §2.2, §2.3, §3 | High | Extend the good `dashboard-get_data` precedent |
| **Authorization is client-gated UI over an unverifiable server contract** — permission checks read a never-refreshed localStorage blob; the backend must be the enforcement point (cannot be confirmed from this repo — **verify server-side enforcement of every action**) | `sidebar-manager.js:73-93`, `dashboard.js:71-90` | High (verify) | Server-side authz audit; fresh user in verify response |
| No idempotency keys on mutating actions (retries unsafe); no rate-limit signaling besides a 429 branch in one client (`api.js`) | client-wide | Medium | Idempotency keys for create/import actions |
| **Observability: none** — no telemetry, no correlation IDs, no `window.onerror`/`unhandledrejection` handler; 128 `console.*` calls are the only signal, and the mock fallback (P0-2) actively hides outages | repo-wide | Medium | Global error handler + error beacon (Sentry or a tiny endpoint); correlation ID header |

Single-file RPC is workable for an internal tool **if** the envelope, error codes, method semantics, and batch endpoints above are fixed. What is not workable is the current informal contract enforced by string-matching on human-readable messages.

# 6. Database Audit (inferred from API behavior)

Not directly inspectable from this repo. Client-observable signals worth a server-side follow-up:

* Endpoints that return unbounded sets (`server-list-configs`, `users-list`, `vendor-list`) suggest missing/unused pagination at the query layer.
* Per-role detail fetches for counts (ACL N+1) suggest missing aggregate queries/denormalized counts.
* Sequential per-component "import template" writes with an ordering constraint (`template-manager.js:93`) suggest **no transactional import** — a partial failure leaves a half-imported configuration. This is the highest data-integrity item to verify server-side.
* Serial numbers accepted without format/uniqueness validation client-side — verify a DB uniqueness constraint exists.
* Activity-log presence implies an audit trail exists; verify it covers all mutating actions (especially bulk paths).

---

# 7. Consistency Audit

* **Code style, three generations:** ES6 classes (`dashboard.js`, `acl-manager.js`, forms) vs object-literal namespaces (`api.js`) vs top-level procedural (`script.js`, `acl.js`). File naming (kebab-case) is consistent — good.
* **Field-casing leaks unmanaged:** `SerialNumber` PascalCase (`add-form.js:1891`) beside `config_uuid`/`rack_uuid` snake_case beside camelCase locals — no mapping layer at the API boundary.
* **Folder misplacement:** `add-server-form.js` lives in `dashboard/` (and is dead); ACL feature JS is in `server/` while its page is `pages/dashboard/acl.html`; `script.js` (712 lines of login/auth) sits at `assets/js/` root; grouping reflects accretion order, not domains.
* **Duplicated helpers:** `escapeHtml` ×9 (`utils.js:220`, `toast.js:90`, `server-list.js:211`, `configuration.js:3020`, `server-builder.js:3589`, `acl.js:969`, `rack-view.js:524`, `requests.js:774`, `request-types.js:439`) with three call styles; `formatDate` ×2 (`utils.js:120`, `server-list.js:275`) plus raw `toLocaleString` scattered (`dashboard.js:377`); loading-overlay logic in three places; theme toggle in three places; location option lists in two.
* **No standards exist to violate:** no ESLint, no Prettier, no EditorConfig, no CONTRIBUTING. **Proposed standard:** ESLint (with `no-unsanitized`, `no-restricted-syntax` banning raw `alert/confirm`, unknown-CSS-var stylelint) + Prettier + TypeScript strict as the enforcement mechanism — conventions without tooling will not survive in this codebase's culture of copy-paste.

---

# 8. Technical Debt Inventory

| Item | Location | Size | Risk | Action |
|---|---|---|---|---|
| Mock/demo data + `Math.random()` specs (P0-2) | `configuration.js:510-1910` | ~900 ln | **Critical** | Remove — **Mandatory** |
| Dead ACL twin with hardcoded permission catalog (loaded by no page; will silently diverge from backend permissions; a maintainer *will* edit the wrong file) | `assets/js/server/acl.js` | 984 ln | High | Delete — **Mandatory** |
| Dead Bootstrap-era server list (conflicting status map, previous brand colors, duplicate toast) — loaded by no page | `assets/js/server/server-list.js` | 471 ln | High | Delete — **Mandatory** |
| Committed experiment page ("3D Motherboard Explorer"), publicly served, linked from nowhere | `pages/dashboard/test.html` | 1,997 ln | Medium | Delete — **Mandatory** |
| Duplicate drifted login page (different CSP, missing `config.js` → runs on a hardcoded prod-URL fallback in `script.js:2`) | `pages/index.html` | 336 ln | Medium | Delete + redirect — **Mandatory** |
| 10 clone component pages (drift already begun) | `pages/dashboard/*.html` | ~2,500 ln net | High | Consolidate — **Mandatory** |
| Orphaned role-modal mockup page (no auth, hardcoded permissions) | `pages/server/create-role.html` + `create-role.js` | ~280 ln | Medium | Delete |
| Dead form module | `assets/js/dashboard/add-server-form.js` | 44 ln | Low | Delete |
| Commented-out compatibility engine + dead method copy | `server-builder.js:579-666, 695-745` (~106 commented lines) | ~150 ln | High (rule ambiguity) | Delete after P0-2 |
| Unused Bootstrap CDN bundle ×3 pages; unused npm axios | `servers.html:172`, `builder.html:74`, `racks.html:337`; `package.json` | ~80 KB | Low | Remove |
| Form auto-save writes all inputs to localStorage incl. login page | `script.js:643-676` | — | Medium (shared machines) | Scope + clear on logout |
| Empty `data/`, `tasks/` dirs (only `.htaccess`) | — | — | Low | Remove or document |
| TODO/FIXME/HACK comments | repo-wide | **0** | — | Debt is undocumented, not absent |

**Dead/duplicated total: ~6,900 lines ≈ 23% of the codebase.** Deleting the dead layer alone removes 2 of the toast systems, 2 modal systems, 1 contradictory status map, the last Bootstrap references, and ~270 KB of shipped bytes — with zero behavior change.

---

# 9. Root-Cause Engineering

Nearly every finding above traces to **four root causes**. Fixing symptoms without these guarantees recurrence:

1. **No module system / no build step.** Consequences: 30 window globals with implicit script-order dependencies (already broken on `pages/index.html`, papered over by a hardcoded fallback); no minification; no content hashing (→ P0-4); no dead-code detection (→ 23% dead code); no types (→ the undefined-variable bug in P0-5.2 was undetectable). *Why patching fails:* every fix hand-applied across 19 HTML pages is a new copy to drift. *Cure:* Vite MPA + ES modules + TypeScript (P2-1).
2. **Copy-paste as the scaling mechanism.** Consequences: 13 clone pages, 8 API clients, 9 escape helpers, 9 modals, 5 toasts, contradictory status maps, add/edit validation divergence. *Why patching fails:* synchronizing copies by hand is exactly what has already failed (the drift is measurable). *Cure:* shared modules + design-system components; delete, don't fix, the dead generation.
3. **No authoritative single source for domain rules.** Consequences: compatibility logic fabricated client-side (P0-2), validation defined per-form (P0-3), permission data cached forever (§3), status semantics defined in 3–5 places. *Cure:* backend-authoritative rules; client renders and fails loudly; one schema module for form definitions.
4. **No safety net: no tests, no CI, no review gate, save-to-prod deploy.** Consequences: broken features ship and stay shipped (dead auto-refresh, broken batch-add, discarded global search — all live in production today undetected). *Cure:* CI with lint + typecheck + a smoke-test tier, and a deploy step that isn't a file-save side effect (P1/P2).

---

# 10. Enterprise-Infrastructure Lens

Judged as datacenter-infrastructure software rather than a generic web app, the ranking above shifts even harder toward these:

* **Reliability > convenience:** the mock-data fallback (P0-2) is the single most dangerous pattern in the codebase — it converts outages into confident-looking lies. In infrastructure tooling, *loud failure is a feature.*
* **Data accuracy > speed:** stale-cache bugs (P0-5.1, sidebar counts) mean the UI misrepresents physical inventory. Every mutation must invalidate; every list must be trustworthy or visibly stale-marked.
* **Validation failures are expensive:** the edit path's zero validation and absent serial-number rules (P0-3) directly enable the wrong-part-in-the-wrong-server class of operational error.
* **Operational safety:** save-on-upload deploy + year-long immutable caching means neither the operator nor the developer can answer "what code is running right now?" — unacceptable for the control panel of physical infrastructure.

---

# Prioritized Roadmap

## P0 — This week (~3 days, all mandatory)
1. Rotate the FTP password; disable plaintext FTP; kill `uploadOnSave`; scrub `.vscode/sftp.json` from git history; gitignore `.vscode/`.
2. Remove all mock/`Math.random()` compatibility data and fallbacks — fail visibly (P0-2 first stage).
3. Interim cache fix: drop `immutable`/reduce asset `max-age` until hashed builds exist.
4. Fix the five live bugs (P0-5): stale `allServers`, broken batch-add, dead auto-refresh, discarded global search, per-request token read in the axios layers.
5. Delete dead code: `acl.js`, `server-list.js`, `test.html`, `pages/index.html`, `add-server-form.js`, `create-role.html`, Bootstrap tags, npm axios.

## P1 — Next 2–4 weeks (mandatory)
1. **Single API client** (per-request token, mutex'd status-401 refresh, timeouts, AbortController, normalized envelope handling, error codes); delete the other seven.
2. **Shared validation schema** for add/edit forms; kill computed-style requiredness; serial-number rules; server-side mirror (P0-3 completion).
3. **Backend batch/aggregation actions:** roles-with-counts, bulk-delete, transactional template import, paginated server list actually consumed by the client; consistent response envelope + machine-readable error codes.
4. **Consolidate the 13 component pages** into one parameterized ListPage; adopt `navbar-placeholder` + shared theme-init everywhere.
5. **XSS hardening:** replace 39 inline `onclick` handlers with event delegation, consolidate to one escape helper, then drop `'unsafe-inline'` from `script-src`.
6. **Minimal CI:** ESLint (incl. `no-unsanitized`) + Prettier + Tailwind build + scripted SFTP/rsync deploy on tag.
7. Cache invalidation discipline: sidebar counts + `allServers` on every mutation; fresh user object from `auth-verify_token`; clear caches on logout.

## P2 — Next quarter (mandatory foundation; framework optional)
1. **Vite (MPA mode) + ES modules + TypeScript migration**, strangler-style, starting with the component pages; content-hashed assets restore the `immutable` cache policy safely; per-page entry points + minification cut per-nav JS by ~60–70%.
2. **Design-system components** in build order: Button → Modal → Badge → FormField → Table → Empty/Error → Spinner/Skeleton → Pagination — with aria/Escape/focus-trap baked in.
3. Error telemetry (global handler + beacon/Sentry) and correlation IDs.
4. Optional but recommended: Preact or Lit for the rendering-heavy pages (~60% of the JS is string-templated DOM that a component model collapses); HttpOnly-cookie auth with the backend team (removes the localStorage-token XSS exfiltration class). A full SPA rewrite is **not** recommended — MPA with islands is the right cost/benefit for this team size.

---

*Cross-verification note: one sub-audit initially reported that no server cache configuration exists; direct inspection confirmed `.htaccess` and `assets/.htaccess` do exist and set the 1-year immutable policy described in P0-4. All P0 findings in this report were verified directly against the working tree.*
