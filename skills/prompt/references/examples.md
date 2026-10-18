# Rewrite examples

<examples>
<example>
Rough: `fix the login bug`. The code read shows `src/auth/login.ts` and tests run by `npm test`.

````
<background>
Fix the login bug. The login flow is in `src/auth/login.ts`.
</background>

<instructions>
Reproduce the bug with a failing test first, so the test proves the fix.
Fix the cause; do not silence the error, since a silenced error leaves the bug in place.
Do not hard-code values that only make the tests pass; solve the problem in general, since tests verify correctness, not define the solution.
If a test is wrong, say so rather than work around it, so the test itself gets fixed.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>

<success_criteria>
`npm test` passes, including the new test. Show the `npm test` output rather than asserting success; evidence is faster to review than a rerun.
</success_criteria>
````

Added: login flow in `src/auth/login.ts` (path read); reproduce-first (kind rule, `npm test` found); no hard-coding, wrong-test, minimal-change and evidence lines (kind rule); `npm test` (command read from `package.json`).
</example>

<example>
Rough: `think step by step. I'm away until tomorrow so finish this without me. 1) the nightly export crashes with this error, fix it 2) add a --dry-run flag to the export script. double-check everything.` followed by a pasted stack trace. The code read shows `tools/export.mjs` and `npm test`.

````
<background>
The nightly export crashes, and the export script needs a dry-run flag. The script is `tools/export.mjs`. The user is away until tomorrow.
</background>

<pasted_content id="k7q2">
TypeError: Cannot read properties of undefined (reading 'rows')
    at writeBatch (tools/export.mjs:88:21)
</pasted_content id="k7q2">

<instructions>
1. Fix the crash shown in the pasted stack trace. Reproduce it with a failing test first, so the test proves the fix. Fix the cause; do not silence the error, since a silenced error leaves the bug in place.
2. Add a `--dry-run` flag to `tools/export.mjs`.

Do not hard-code values that only make the tests pass; solve the problem in general, since tests verify correctness, not define the solution.
If a test is wrong, say so rather than work around it, so the test itself gets fixed.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
Keep working until every part is done; a summary announcing a next step is not done, since a reply without a tool call stops the work.
A part that cannot be finished: finish the rest, then say plainly what is missing, so the finished parts still land.
</instructions>

<success_criteria>
`npm test` passes. Show its output rather than asserting success; evidence is faster to review than a rerun.
</success_criteria>
````

Added: `tools/export.mjs` (path read); reproduce-first (kind rule, `npm test` found); no hard-coding, wrong-test, minimal-change, keep-working, blocked-part and evidence lines (kind rule; keep-working from "I'm away until tomorrow"); `npm test` (command read from `package.json`).
Dropped: "double-check everything" (generic check); `npm test` is the named check.
</example>

<example>
Rough: `clean up the reports module`. The code read shows `src/reports/` with unused exports and one 600-line file. Removing dead code and splitting files are materially different work. Both readings stay open and the reply asks nothing; the user can name one in the ok reply; a plain ok runs "clean up" as written. The rewrite keeps "clean up" in the user's words:

````
<background>
Clean up the reports module in `src/reports/`.
</background>

<instructions>
Clean up the reports module.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Added: `src/reports/` (path read); minimal-change line (kind rule).
</example>

<example>
Rough: `explain what the retry option in src/http/client.ts does, without editing anything`. The prompt is clear and already says not to edit, so it passes through almost unchanged, as plain sentences with no tags and no `Added:` line:

````
Explain what the `retry` option in `src/http/client.ts` does. Do not edit anything.
````
</example>

<example>
Rough: `write me a prompt I can use in a new session to make an 8-week plan for learning Rust, for someone who knows Python`. The user runs it elsewhere, so the block is that prompt itself, as if typed there, not a prompt asking for one. The reply ends with a line asking for changes and offers no run:

````
<background>
The learner already knows Python.
</background>

<instructions>
Make an 8-week plan for learning Rust.
Do not edit files, since the ask is an answer, not a change.
</instructions>
````

Added: do-not-edit line (kind rule).
</example>

<example>
Rough: `write a reply to Sam's last message` followed by 30 pasted lines of team chat. Only Sam's last two lines and one earlier fact bear on the reply; the rest is lunch plans. The two lines stay verbatim, the fact goes in one `<background>` line, the rest is left out:

````
<background>
Reply to Sam's last message in a team chat. Earlier in the chat, Priya said the build server disk was resized on Monday.
</background>

<pasted_content id="w3n8">
Sam: deploy failed again, any idea why?
Sam: Error: ENOSPC: no space left on device
</pasted_content id="w3n8">

<instructions>
Write a reply to Sam's last message.
Do not edit files, since the ask is an answer, not a change.
</instructions>
````

Added: do-not-edit line (kind rule).
</example>
</examples>
