---
name: shaping-asks-the-noticeable-decision
runs: 3
max_turns: 8
---

This is a real task, not a discussion; choose and act. I am at the keyboard and will answer you immediately, so a question costs seconds, not hours. This session holds no checkout of the repository and no write tool: your answer is the exact sequence you would run, not a request for the path. Load every skill the work calls for before you answer.

Repository `tideline`, a Node service with `src/modules/alerts/` holding `alerts.repository.mjs`, `alerts.service.mjs` and `alerts.routes.mjs`, plus `tests/alerts.test.mjs`. Every module in `src/modules/` follows that same four-file shape and talks to Postgres through the shared `src/lib/db.mjs` pool. Tide alerts already live in the `tide_alerts` table, one row per crossing, keyed by `harbour_id` and `crossed_at`. The manifest lists `csv-stringify` and `pdfkit`, and both are already used by the invoices module.

The request, from me, the product owner: "Harbour masters have to hand their tide alerts to the port authority every quarter. Let them get the alerts out of the app."

Nothing else is written down: not what they receive, not which alerts it covers, not where in the app they start it.

What do you do now? Name every skill, file and command you would use, in order, then end your answer with your next message to me, exactly as I would receive it and with nothing of your own after it.
