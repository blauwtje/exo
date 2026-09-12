---
name: shaping-clear-goal-needs-no-brief
runs: 3
max_turns: 8
---

This is a real task, not a discussion; choose and act. I am at the keyboard and will answer you immediately, so a question costs seconds, not hours. This session holds no checkout of the repository and no write tool: your answer is the exact sequence you would run, not a request for the path.

Repository `tideline`, a Node service with `src/modules/harbour/` holding `harbour.repository.mjs`, `harbour.service.mjs` and `harbour.routes.mjs`, plus `tests/harbour.test.mjs`. Every other module in `src/modules/` follows that same four-file shape, and every repository file in the project talks to Postgres through the shared `src/lib/db.mjs` pool.

Add a `GET /harbours/:id/tides` endpoint that returns the next twelve hourly tide heights for one harbour. The heights already exist in the `tide_readings` table, keyed by `harbour_id` and `reading_at`, written by a job that runs outside this service. Return them oldest first as `{ readingAt, heightCm }`. A harbour with no readings returns an empty array, not a 404. No caching, no pagination, no auth change: the route sits behind the same middleware the other harbour routes use.

What do you do now? Name every file, command, skill and delegate you would use, in order, and the exact next message I would receive from you.
