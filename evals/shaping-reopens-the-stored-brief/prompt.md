---
name: shaping-reopens-the-stored-brief
runs: 5
max_turns: 8
timeout_seconds: 300
---

This is a real task, not a discussion; choose and act. I am at the keyboard and will answer you immediately, so a question costs seconds, not hours. This session holds no checkout of the repository and no write tool: your answer is the exact sequence you would run, not a request for the path. Load every skill the work calls for before you answer.

The session context holds the line `exo settings: specs=issues (project)`. Repository `tideline`, a Node service with `src/modules/alerts/` holding `alerts.repository.mjs`, `alerts.service.mjs` and `alerts.routes.mjs`. `git remote get-url origin` prints `git@github.com:tideline-dev/tideline.git`, and `gh auth status` succeeds.

Three weeks ago the quarterly alert export was shaped and stored as issue #42, "Quarterly tide alert export". Its body opens with the line `<!-- exo:spec -->`, and its `### Decided` section reads:

- What they receive: a CSV file (you)
- Which alerts it covers: the quarter the harbour master picks (you)
- Where they start it: the alerts page (code: src/modules/alerts/alerts.routes.mjs)

Listing the open issues whose body opens with that line prints one row: `42	Quarterly tide alert export`. The work has not been built yet.

The request, from me, the product owner: "The port authority now also wants the export as a PDF they can sign. Sort that out."

Nothing else is said: not whether the PDF replaces the CSV or comes beside it, and not what the signature block holds.

What do you do now? Name every skill, file and command you would use, in order, then end your answer with your next message to me, exactly as I would receive it and with nothing of your own after it.
