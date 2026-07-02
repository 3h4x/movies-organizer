<!-- tamtam inspected 2026-05-21 -->
# CDA Refresh Scheduling Design

Date: 2026-04-17
Status: Approved, implemented

## Overview

FilmPick refreshes CDA Premium availability on demand and, when configured, on a recurring interval. The recurring job is a server-process background task initialized from Next.js instrumentation, not from UI code or a route's first request.

## Architecture

### Startup

`instrumentation.ts` exports `register()` and returns immediately unless `process.env.NEXT_RUNTIME === "nodejs"`. In the Node.js runtime it imports `getDb()`, initializes the backup interval, then calls:

```typescript
initCdaScheduler(getDb());
initEpgScheduler(getDb());
```

This keeps scheduler startup in one process-level entrypoint.

### CDA Scheduler

`lib/cda-scheduler.ts` is a singleton module with module-scoped timers for the
CDA refresh job and the CDA dead-link health-check job.

It exports:

- `initCdaScheduler(db)`: resets stale refresh and health-check `"running"` statuses to `"idle"` after process restart, then calls `rescheduleCdaJob(db)` and `rescheduleCdaHealthJob(db)`.
- `rescheduleCdaJob(db)`: clears the current interval, reads `cda_refresh_interval_hours`, and starts a new `setInterval` only when the interval is non-zero.
- `runCdaRefreshNow(db)`: exits early if `cda_refresh_status` is already `"running"`, otherwise sets the status to `"running"` and calls `fetchAndStoreCdaMovies(db)`.
- `rescheduleCdaHealthJob(db)`: clears the current health interval, reads `cda_health_interval_hours`, and defaults to a 12-hour cadence when missing.
- `runCdaHealthCheckNow(db)`: exits early if `cda_health_status` is already `"running"`, otherwise probes a slow rolling batch of cached CDA links.

Successful refreshes update `cda_last_refresh`, `cda_movie_count`, and `cda_refresh_status = "idle"`. Failed refreshes log the failure and set `cda_refresh_status = "error"`.

Successful health checks update `cda_health_last_run`, `cda_dead_link_count`,
and `cda_health_status = "idle"`. Links returning 404 or 410 are hidden from
the CDA recommendation engine until a later pass observes a live 2xx/3xx status.

### API Entry Points

`POST /api/cda-refresh` is the manual trigger. It checks the persisted running status and returns `409` if a refresh is already active. Otherwise it calls `runCdaRefreshNow(db)` and returns `{ status: "started" }`.

`PATCH /api/settings` accepts `cda_refresh_interval_hours` values of `0`, `6`, `12`, or `24`. After persisting a valid value, it calls `rescheduleCdaJob(db)` so interval changes apply immediately.

`GET /api/settings` returns:

- `cda_refresh_interval_hours`
- `cda_last_refresh`
- `cda_movie_count`
- `cda_refresh_status`
- `cda_health_last_run`
- `cda_dead_link_count`

## Settings

| Key | Stored type | Values | Default behavior |
|-----|-------------|--------|------------------|
| `cda_refresh_interval_hours` | string | `0`, `6`, `12`, `24` | Missing/null is `0` |
| `cda_last_refresh` | string | ISO 8601 timestamp | Missing/null is never refreshed |
| `cda_movie_count` | string | integer count | Missing/null is unknown |
| `cda_refresh_status` | string | `idle`, `running`, `error` | Missing/null is `idle` |
| `cda_health_interval_hours` | string | integer hours, `0` disables | Missing/null is `12` |
| `cda_health_status` | string | `idle`, `running`, `error` | Missing/null is `idle` |
| `cda_health_last_run` | string | ISO 8601 timestamp | Missing/null is never checked |
| `cda_dead_link_count` | string | integer count | Missing/null is unknown |

## Constraints

- Do not add `node-cron` or child-process execution for this scheduler. The implemented design uses `setInterval` and calls `fetchAndStoreCdaMovies(db)` directly.
- Do not initialize CDA or EPG schedulers from `app/layout.tsx`, React components, route module top level, or ad-hoc first-use code.
- Keep the timer singleton module-local. Rescheduling must clear the prior timer before starting a replacement.
- Manual and scheduled refreshes share the same `runCdaRefreshNow(db)` concurrency guard.
- Scheduled health checks share the same `runCdaHealthCheckNow(db)` concurrency guard and must keep request volume low.
