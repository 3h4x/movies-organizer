<!-- tamtam inspected 2026-05-21 -->
# FilmPick

Personal movie discovery engine with a Next.js web UI and SQLite database.

## Tech Stack

- **Web app:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** SQLite via `better-sqlite3`
- **Data sources:** TMDb API, Filmweb (one-time import only — no scheduled sync)
- **Testing:** Vitest
- **Package manager:** pnpm 11 (do not use npm)
- **Secrets:** bioenv (Touch ID-protected Keychain)

## Commands

```bash
pnpm install
eval "$(bioenv load)"    # Load TMDB_API_KEY
pnpm dev                 # http://localhost:4000
pnpm dev:docker          # Docker Compose dev server on http://localhost:4000
pnpm type-check          # TypeScript check
pnpm test                # Run vitest
pnpm backup              # Backup SQLite DB
```

### Structure

```
├── app/
│   ├── page.tsx                      — Dashboard (Library + Recommendations tabs)
│   ├── global-error.tsx              — Next.js global error boundary
│   ├── search/
│   │   ├── page.tsx                  — Standalone TMDb search entry page
│   │   └── [query]/page.tsx          — TMDb search results page
│   └── api/
│       ├── movies/route.ts           — GET/POST library (GET supports `?type=` and `?q=` FTS search)
│       ├── movies/[id]/route.ts      — GET/DELETE single movie
│       ├── movies/[id]/full/route.ts — DELETE movie from disk and DB (use ?disk_only=1 to keep DB row)
│       ├── movies/[id]/play/route.ts — Launch local player
│       ├── movies/[id]/stream/route.ts — Stream video file
│       ├── movies/[id]/subtitles/route.ts — Subtitle management
│       ├── movies/[id]/standardize/route.ts — Standardize file naming
│       ├── movies/[id]/episodes/route.ts — TV episode watch progress (GET list / PUT mark watched / DELETE clear)
│       ├── movies/merge/route.ts     — Merge duplicate entries
│       ├── search/route.ts           — TMDb search
│       ├── recommendations/route.ts  — Generate recommendations
│       ├── recommendations/dismiss/route.ts — Dismiss recommendation
│       ├── recommendations/event/route.ts — Record recommendation interaction events
│       ├── recommendations/count/route.ts — Recommendation count
│       ├── recommendations/mood/route.ts — Mood-based recommendations
│       ├── person-ratings/route.ts   — Director/actor/writer ratings
│       ├── pl-title/route.ts         — Polish title lookup
│       ├── import/route.ts           — Import from filesystem directory
│       ├── sync/route.ts             — Re-scan library path, add/remove
│       ├── settings/route.ts         — GET/PATCH app settings
│       ├── backup/route.ts           — Trigger manual DB backup
│       ├── cda-refresh/route.ts      — Refresh CDA availability cache
│       └── tv/
│           ├── route.ts              — Fetch TV guide (EPG)
│           ├── refresh/route.ts      — Trigger EPG refresh
│           ├── enrich/route.ts       — Enrich TV show entries from TMDb
│           ├── enrich/cache.ts       — In-memory cache for TV enrichment results
│           └── blacklist/route.ts    — Manage EPG channel blacklist
├── components/
│   ├── AppNav.tsx                    — Top app navigation bar with tab routing and search input
│   ├── CardActionStack.tsx           — Reusable overlay action buttons for movie cards
│   ├── TabNav.tsx                    — Pill-style tab navigation
│   ├── MovieCard.tsx                 — Poster card (user rating + global rating badges)
│   ├── MovieDetail.tsx               — Full movie detail view; MY RATING badge (♥) always visible, click to toggle 1–10 picker inline
│   ├── PersonView.tsx                — Person filmography view
│   ├── SearchModal.tsx               — TMDb search + add modal
│   ├── ImportModal.tsx               — Filesystem import modal
│   ├── SyncModal.tsx                 — Sync progress modal
│   ├── ConfigPanel.tsx               — Settings/config panel
│   ├── RecommendationRow.tsx         — Grouped recommendation row
│   ├── RecommendationSkeleton.tsx    — Loading skeleton
│   ├── SortFilterBar.tsx             — Sort (6 options) + genre filter
│   ├── TvTab.tsx                     — TV guide tab
│   ├── Toast.tsx                     — Toast notifications
│   └── views/                        — Full tab-level view components
│       ├── LibraryView.tsx           — Library grid view
│       ├── RecommendationsView.tsx   — Recommendations view
│       ├── WishlistView.tsx          — Wishlist view
│       ├── SearchView.tsx            — Search view
│       └── ConfigView.tsx            — Settings/config view
├── lib/
│   ├── db.ts                         — SQLite schema, CRUD, settings, migrations
│   ├── tmdb.ts                       — TMDb API client
│   ├── cda.ts                        — CDA Premium streaming links
│   ├── cda-fetch.ts                  — CDA availability fetch + cache
│   ├── cda-scheduler.ts              — Scheduled CDA refresh job
│   ├── epg-fetch.ts                  — EPG/TV guide fetch + in-memory cache
│   ├── epg-scheduler.ts              — Scheduled EPG refresh job
│   ├── epg-presets.ts                — Built-in EPG source presets
│   ├── mood-presets.ts               — Mood recommendation presets
│   ├── backup.ts                     — Programmatic DB backup (used by backup API)
│   ├── types.ts                      — Shared TypeScript types (Movie, RecType, AppTab, etc.)
│   ├── utils.ts                      — Shared utilities
│   ├── search.ts                     — Shared search types (SearchMatches, TmdbSearchMovieState)
│   ├── latest-only-runner.ts         — Utility: run async tasks, discard stale (latest-wins)
│   ├── scanner.ts                    — Filesystem video scanner + filename parser
│   ├── subtitles.ts                  — Subtitle format sniffing (SubRip/MicroDVD/MPL2/TMP/VTT/ASS), encoding detection, conversion to SubRip
│   ├── ffprobe.ts                    — probeFps: video frame rate via ffprobe, used to time frame-based subtitles
│   ├── hooks/                        — React hooks
│   │   ├── useLibrary.ts             — Library fetch + filtering state
│   │   ├── useRecommendations.ts     — Recommendations fetch + state
│   │   ├── useSearch.ts              — TMDb search state
│   │   └── useSettings.ts            — App settings fetch/update
│   └── engines/                      — Recommendation engines
│       ├── index.ts                  — Engine registry
│       ├── director.ts               — By director
│       ├── actor.ts                  — By actor
│       ├── genre.ts                  — By genre
│       ├── movie.ts                  — Similar movies (TMDb)
│       ├── hidden-gem.ts             — Hidden gems
│       ├── star-studded.ts           — Star-studded blockbusters
│       ├── random.ts                 — Surprise me
│       ├── watchlist.ts              — From watchlist
│       ├── mood.ts                   — Mood-based recommendations
│       └── cda.ts                    — CDA Premium available
├── scripts/
│   ├── backup-db.sh                  — SQLite backup with tiered retention
│   ├── restore-db.sh                 — Restore a SQLite backup to a target DB path
│   ├── import-filmweb.ts             — Import Filmweb ratings export (JSON)
│   ├── enrich-tmdb.ts                — Enrich existing movies with TMDb posters/genres
│   ├── fix-credits.ts                — Re-fetch director/writer/actors from TMDb for all movies
│   ├── fetch-cda.ts                  — Fetch CDA Premium movies into recommended_movies
│   ├── dedupe-movies.ts              — Merge rows sharing a tmdb_id into a canonical row (uses lib/dedup.ts)
│   └── ensure-native-abi.mjs         — Pre-test native ABI check (run by pnpm pretest)
├── __tests__/                        — Vitest tests
└── data/
    ├── movies.db                     — SQLite DB (gitignored)
    └── backups/                      — Tiered backup retention (gitignored)
```

## Docs Reference

| File | Topic | Load when |
|------|-------|-----------|
| `docs/superpowers/plans/2026-04-17-cda-refresh-scheduling.md` | Task plan for CDA refresh scheduling UI/API/scheduler work | Read when implementing or reviewing the CDA refresh scheduler rollout step-by-step |
| `docs/superpowers/specs/2026-04-17-cda-refresh-scheduling-design.md` | Approved design spec for CDA refresh scheduling architecture | Read when changing CDA refresh behavior, settings, API semantics, or scheduler startup flow |

### Features

- **Library tab:** Movie grid with posters, user ratings (indigo ♥ badge), global ratings (yellow ★ badge)
- **Rating UX:** In detail view, MY RATING (♥) is always shown left of GLOBAL (★); click the indigo badge to open an inline 1–10 picker; current score is highlighted; picker closes on selection
- **Sorting:** My Rating, Global Rating, Year, Title, Date Added, Date Rated — asc/desc toggle
- **Genre filter:** Dropdown with all genres from collection
- **Import:** Scan a directory for video files, parse filenames, fetch TMDb metadata
- **Sync:** Re-scan saved library path, add new files, remove deleted ones
- **Recommendations tab:** TMDb-based suggestions grouped by reason
- **Search:** TMDb search to manually add movies
- **Library search (FTS):** `GET /api/movies?q=` runs an SQLite FTS5 prefix search over title, pl_title, director, writer, and actors (backed by the `movies_fts` virtual table); the Library search box debounces and queries this endpoint
- **TV episode progress:** TV/series detail view tracks watched episodes per season/episode via `app/api/movies/[id]/episodes` (`TvEpisodeProgressSection`); progress is stored in `tv_episode_progress` and removed on movie delete via `ON DELETE CASCADE`
- **Wishlist:** Flag movies with `wishlist=1`; dedicated tab; watchlist recommendation engine picks from it
- **TV guide (EPG):** Fetches and caches an M3U/EPG feed; configurable via settings; scheduled refresh; channel blacklist
- **Mood recommendations:** Predefined mood presets map to TMDb genre/keyword queries
- **CDA integration:** `cda.ts` resolves streaming URLs; `cda-scheduler.ts` refreshes availability cache on a schedule
- **URL hash deep-link:** `#movie/<tmdbId>` opens a TMDb-backed movie detail modal directly on page load; use `#movie/local/<dbId>` for local-only entries
- **hasFileOnly filter:** Library can be filtered to show only movies with a local file path (`hasFileOnly=1`)
- **Lazy enrichment:** `GET /api/movies/[id]` lazily fetches and stores `pl_title` and `description` from TMDb on first access
- **TMDb TTL cache:** `lib/tmdb.ts` keeps an in-memory TTL cache for `getMovieLocalized` and `getTmdbMovieDetails` to reduce redundant API calls
- **Config tabs:** Current Config sections are `Library`, `Integrations`, `Recommendations`, and `TV`

### Database Schema

**movies**: id, title, year, genre, director, writer, actors, rating, user_rating, poster_url, source, imdb_id, tmdb_id, type (`movie`|`tv`), file_path, extra_files (JSON), video_metadata (JSON), filmweb_id, filmweb_url, cda_url, pl_title, description, rated_at, created_at, wishlist (0|1)

**Other tables**: settings (key/value), dismissed_recommendations (tmdb_id), recommendation_events (tmdb_id, engine, event, created_at), recommendation_impressions (tmdb_id, engine, shown_count, last_shown_at — populated by `app/api/recommendations/route.ts` only for rotation-aware engines, currently `hidden_gem`; consumed via `getImpressionCounts` to demote titles surfaced repeatedly within a recent window), recommendation_cache (engine, data, movie_count, created_at — `created_at` drives the TTL checked by `getCachedEngine(db, engine, maxAgeHours)`), recommended_movies (tmdb_id, engine, reason, title, year, genre, rating, poster_url, pl_title, cda_url, description), tv_episode_progress (id, movie_id, season_number, episode_number, watched_at, created_at, updated_at — UNIQUE(movie_id, season_number, episode_number), FK to movies ON DELETE CASCADE), _migrations (migration guard)

**movies_fts**: FTS5 virtual table (external content over `movies`, rowid = movies.id) indexing title, pl_title, director, writer, actors; kept in sync by AFTER INSERT/UPDATE/DELETE triggers on `movies` and queried by `getMovies(db, type, query)` for `?q=` search

### Environment

Secrets managed via `bioenv`:

```bash
bioenv init                          # First time setup
bioenv set TMDB_API_KEY <token>      # Store TMDb read access token
eval "$(bioenv load)"                # Load into shell before running dev
```

### Scripts

```bash
# One-time import of Filmweb ratings export (run once after exporting from Filmweb)
pnpm dlx tsx scripts/import-filmweb.ts <path-to-json> [--enrich]

# Enrich existing movies with TMDb posters (requires TMDB_API_KEY)
eval "$(bioenv load)" && pnpm dlx tsx scripts/enrich-tmdb.ts

# Backup DB (also available as: pnpm backup)
bash scripts/backup-db.sh

# Restore backup to the app DB (validates integrity before replacing target; add --force to overwrite)
bash scripts/restore-db.sh data/backups/<backup-file>.db data/movies.db --force

# PM2 scheduled backup (every 15 min)
pm2 start scripts/backup-db.sh --name movies-backup --cron-restart='*/15 * * * *' --no-autorestart
```

### Disaster recovery

Stop the app before restoring, then pick the newest backup with `ls -1t data/backups/*.db | head -1` and restore it with `bash scripts/restore-db.sh "$(ls -1t data/backups/*.db | head -1)" data/movies.db --force`. The restore script copies the backup to a temporary file, runs SQLite `integrity_check`, and only then replaces the target database. Start the app again and run `pnpm test -- __tests__/backup-restore.test.ts` when validating the restore path locally.

### Logs

Next.js dev server logs to stdout. When running in the background:

```bash
# Start dev server with logs to file
nohup pnpm dev > /tmp/movies-dev.log 2>&1 &

# Tail logs
tail -f /tmp/movies-dev.log

# Check for errors
grep -i error /tmp/movies-dev.log
```

Each request is logged as `GET /path STATUS in Xms`. API errors show as 500 with a stack trace including the failing source file and line number.

Common errors:

- **`better-sqlite3` native addon not found** — run `pnpm rebuild better-sqlite3` from the repo root after confirming `pnpm-workspace.yaml` still allows its build script
- **SWC binary missing** — install `@next/swc-linux-arm64-gnu` (or musl) for ARM64 Linux environments

## Docker

### Run with docker-compose (recommended)

```bash
# Pull and start using the pre-built image from GHCR
TMDB_API_KEY=<your_key> docker compose up -d

# Or with bioenv:
eval "$(bioenv load)" && docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The `docker-compose.yml` uses `ghcr.io/3h4x/film-pick:latest` (built by GHA on push to master). Data is persisted in `./data/`.

Watchtower is included in `docker-compose.yml` and polls GHCR every 5 minutes. When GHA pushes a new `:latest`, Watchtower pulls it and restarts the `filmpick` container automatically. No credentials needed — the image is public. Watchtower is scoped to the `filmpick` label only and will not touch other containers on the host.

### Build locally

```bash
docker build -t filmpick .
TMDB_API_KEY=<your_key> docker run -p 4000:4000 -v $(pwd)/data:/app/data -e TMDB_API_KEY filmpick
```

- **Image:** `ghcr.io/3h4x/film-pick:latest` (auto-built by GHA)
- **Port:** 4000
- **Data volume:** `./data` → `/app/data` (SQLite persistence)
- **Env:** `TMDB_API_KEY` required
- **Next.js output:** standalone mode (`next.config.ts`)

## Development

- Use `pnpm` 11 exclusively (not npm)
- Conventional commits are enforced (see Scope & Safety Rules §1)
- Type check with `pnpm type-check` before committing
- Target the versions already in the repo: Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Node 24 (see Dockerfile). Follow current framework patterns instead of introducing legacy APIs.

## Coding Conventions

1. **TypeScript strict mode is on.** All code must pass `pnpm type-check` with no errors. Avoid `any` even though the ESLint rule is disabled — use proper types or `unknown`.
2. **Path alias `@/*` maps to the project root.** Use it for all cross-directory imports (e.g. `import { getDb } from "@/lib/db"`). Avoid `../..` relative chains.
3. **React components are functional only.** No class components.
4. **All DB access uses `getDb()` from `lib/db.ts`.** Never instantiate `new Database()` directly — always call `getDb()` to get the singleton. For common operations, use the CRUD helpers exported by `lib/db.ts`; for complex queries not covered by helpers, calling `.prepare()` on the returned db instance is acceptable within route handlers.
5. **All TMDb API calls go through `lib/tmdb.ts`.** Never call `fetch("https://api.themoviedb.org/...")` directly outside that module.
6. **Async/await only.** No raw `.then()` chains.
7. **ESLint + lint-staged run automatically** on `git commit` (ESLint `--fix` + type-check + full test suite). Do not skip hooks with `--no-verify`.
8. **Pre-push hook runs `pnpm type-check && pnpm lint && pnpm test`.** Ensure all pass before pushing.
9. **File naming:** React components and view files use PascalCase (`MovieCard.tsx`). Library modules and hooks use kebab-case (`cda-fetch.ts`, `useLibrary.ts`).
10. **Keep TypeScript identifiers camelCase unless mirroring persisted schema fields.** SQLite column names and raw row fields stay snake_case (`user_rating`, `file_path`, `created_at`), but local variables, helper return shapes, and component props should be camelCase unless they intentionally match the database/API contract.
11. **API error responses** always use `Response.json({ error: "..." }, { status: N })`. Use 400 for bad input, 404 for missing resources, 500 for unexpected failures. Never throw unhandled errors from route handlers — catch and return a 500.
12. **Shared TypeScript types** belong in `lib/types.ts`. Do not define `Movie`, `RecType`, `AppTab`, or similar cross-cutting types in individual modules.
13. **React hooks** for data fetching and complex state belong in `lib/hooks/`. Route handlers and components must not duplicate fetch logic that already exists in a hook.
14. **Default to Server Components in `app/`** and add `"use client"` only for components that need browser APIs, event handlers, local state, refs, or effects.
15. **Prefer async/await with explicit concurrency.** Use `Promise.all` only for independent work with a known small fan-out; avoid unbounded parallel TMDb/CDA/EPG requests.
16. **Use the existing lint setup and let it auto-fix where possible.** Run `pnpm lint` for manual verification when touching multiple files or before pushing.
17. **Keep imports direct and explicit.** Use `@/` aliases for project modules, avoid deep relative imports across directories, and do not introduce barrel files unless the repo already has them.
18. **Log unexpected server-side failures with useful context** before returning a 500 so the failing route or operation is visible in stdout logs.
19. **Treat `process.env.TMDB_API_KEY` / `bioenv` as the preferred secret source during development and automation.** The Config UI stores `tmdb_api_key` plaintext in SQLite; do not write or seed that setting from scripts, tests, fixtures, or docs unless the user explicitly asks for the less-secure path.

## Testing Rules

1. **Test runner:** Vitest (`pnpm test` = `vitest run`; `pnpm test:watch` = interactive). Vitest is configured with `globals: true`, but `tsconfig.json` has no `types: ["vitest/globals"]`, so relying on the globals fails `pnpm type-check` (which both lint-staged and the pre-push hook run). Import `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` from `"vitest"` explicitly, as every existing test in `__tests__/` does.
2. **Tests live in `__tests__/`** and are named `<subject>.test.ts`. No colocated tests.
3. **Use a real SQLite file for DB tests** (pattern: `new Database(TEST_DB)` + `initDb(db)` in `beforeEach`; close and `unlinkSync` in `afterEach`). Never mock the database layer — integration test against real SQLite.
4. **Mock external HTTP** (TMDb, CDA) with `vi.fn()` assigned to `global.fetch`. Do not make real network calls in tests.
5. **Run `pnpm test` after every code change** to verify nothing regressed. The lint-staged config also runs the full suite on commit.
6. **New API routes and business logic require tests.** Trivial pass-through wrappers and UI-only components do not.
7. **E2E tests** use Playwright (`pnpm test:e2e`). They live in `e2e/` (not `__tests__/`). These are separate from unit tests and are not run by the pre-push hook.
8. **Prefer focused test runs while iterating, then finish with the full suite.** Use Vitest file targeting or Playwright spec targeting during development, but `pnpm test` remains the final check.
9. **Playwright uses `http://localhost:4000`** and starts `pnpm dev` automatically when needed. Keep new e2e flows compatible with that port and dev-server startup model.
10. **Mock network boundaries, not parsing/business logic.** For TMDb/CDA/EPG tests, stub `fetch` inputs/outputs and exercise the real route/helper code around them.
11. **Vitest runs in `environment: "node"`**, not `jsdom`. For component tests, prefer `renderToStaticMarkup`, pure helper extraction, or targeted module tests over introducing browser-only test infrastructure.
12. **Restore test-global mutations in `afterEach`.** If a test changes `global.fetch`, fake timers, `process.env`, module-level caches, or singleton DB state, clean it up before the next test so Vitest file order does not affect results.

## Architecture Patterns

1. New API routes belong under `app/api/<resource>/route.ts` following Next.js App Router conventions.
2. New React components belong in `components/`.
3. Shared utility logic belongs in `lib/utils.ts`; domain-specific modules get their own file under `lib/`.
4. New recommendation engines go under `lib/engines/` and must be registered in `lib/engines/index.ts`.
5. Database schema changes require a migration block inside `initDb()` in `lib/db.ts` (additive `ALTER TABLE` or new table — never destructive).
6. New tab-level views belong in `components/views/` as `<Name>View.tsx`. Smaller reusable UI pieces belong directly in `components/`.
7. Scheduler modules (`cda-scheduler.ts`, `epg-scheduler.ts`) follow the same pattern: export `init*Scheduler(db)`, `reschedule*Job(db)`, and `run*Now(db)`; manage a single `activeTimer`; read interval from settings; initialize from `instrumentation.ts`, not from routes or React components.
8. **Client-side server state stays in hooks, not global stores.** Reuse `lib/hooks/` for fetch/caching/state orchestration before adding new top-level component state or a state library.
9. **Route handlers own persistence and orchestration.** UI components should call existing API routes/hooks rather than reading the filesystem, hitting SQLite, or calling third-party APIs directly.
10. **Caching belongs in the existing cache layers.** TMDb TTL logic stays in `lib/tmdb.ts`, recommendation cache logic stays in `lib/db.ts`/`recommendation_cache`, and EPG/CDA refresh behavior stays in their scheduler/fetch modules.
11. **Keep filesystem-sensitive behavior inside the existing scanner/streaming/standardize modules and routes.** Do not duplicate path parsing, rename logic, or video-file detection in UI code.
12. **Preserve the current standalone deployment contract** when touching build/runtime config: `next.config.ts` must keep `output: "standalone"` and `serverExternalPackages: ["better-sqlite3"]` unless every Docker/deployment path is re-verified.
13. **Direct `new Database(...)` calls are an exception reserved for isolated backup/test code.** Production reads/writes should continue to go through `getDb()`; the current allowed non-singleton cases are `lib/backup.ts` (readonly backup handle) and Vitest DB setup/fixtures.
14. **Standalone maintenance/import scripts under `scripts/` may also open their own `new Database(dbPath)` handle** because they run as one-off Node processes outside the app singleton lifecycle. Keep that exception scoped to `scripts/`; do not copy it into `app/`, `components/`, or long-lived `lib/` runtime code.
15. **Never infer a subtitle's format from its extension.** Files named `.srt` routinely hold MicroDVD or MPL2, and mislabelling them makes players render nothing. Route `lib/subtitles.ts` (`normalizeSubtitle` on upload, `subtitleExtensionForContent` on rename) over the bytes instead; frame-based formats need the movie's fps from ffprobe.
16. **App startup side effects belong in `instrumentation.ts`.** Background jobs such as backups and scheduler initialization should start from `register()` behind the existing `NEXT_RUNTIME === "nodejs"` guard, not from route handlers, components, or ad-hoc module top-level code.

## Dependency & Supply-Chain Security

1. **Always commit `pnpm-lock.yaml`.** Never install without a lock file.
2. **Run `pnpm audit` after any dependency change** and resolve high/critical findings before committing.
3. **Only `better-sqlite3`, `esbuild`, and `sharp` are allowed to run install scripts** (`allowBuilds` in `pnpm-workspace.yaml`). Do not add packages with `postinstall`/`prepare` scripts without explicit user approval.
4. **Never add a new dependency without explicit user approval.** Justify every new dep in the commit message.
5. **Verify new packages before adding:** check npm download counts, publish date, and maintainer history to guard against typosquatting. Flag anything suspicious before installing.
6. **Inspect lifecycle scripts before approving a dependency update.** `prepare`, `postinstall`, and `install` scripts are code execution and must be treated as a security review point.

## Scope & Safety Rules

1. **Conventional commits are enforced** by commitlint + husky `commit-msg` hook (not optional). Format: `type(scope): description` — types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`.
2. **Never commit to a feature branch and force-push master** — this repo deploys automatically on push to `master` via GHA + Watchtower. Every push to master triggers a Docker build and live deployment.
3. **Never commit secrets or `.env` files.** Use `bioenv` for all secrets.
4. **Never modify `data/` contents** (SQLite DB and backups are gitignored and must stay that way).
5. **Schema migrations must be additive.** Never drop columns or tables — the live DB on the server has real user data.
6. **Do not push to `master` or trigger deployment-related changes casually.** Any push to `master` ships via GHA + Watchtower, so pushing is a separate deliberate action from committing.
7. **Do not bypass Husky/commitlint/lint-staged hooks** with `--no-verify` or similar flags unless the user explicitly instructs it for a one-off emergency.
8. **Do not change ports, image names, deployment wiring, or container volume paths without verifying all downstream references** (`README.md`, `docker-compose.yml`, Playwright base URL, and docs).
9. **Never place real TMDb credentials in committed fixtures, screenshots, docs, or seeded SQLite data.** Use `bioenv` for local runs and obvious placeholders in any artifact that can land in git.
10. **Mutating and TMDb-hitting API routes are rate-limited.** `lib/rate-limit.ts` ships an in-memory per-IP token bucket; new write routes must call `rateLimit(request, "mutation")` (default 10 rpm/IP) and new TMDb-hitting routes must call `rateLimit(request, "tmdb")` (default 30 rpm/IP) at the top of the handler. `X-Forwarded-For` is only trusted when `TRUSTED_PROXY=1` in the environment. Limits are bypassed under Vitest unless `RATE_LIMIT_ENFORCE_IN_TESTS=1`.
