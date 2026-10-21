# Rewrite examples

Unless an example says otherwise, the session's CLAUDE.md files, rules and memory state none of the kind-rule lines, so each one shown is uncovered. In-session examples end with the fixed ok line; a note appears only where a suggestion is admitted, as a numbered list with the reply line before the ok line.

<examples>
<example>
Rough: `fix the login bug`. The code read shows `src/auth/login.ts` and tests run by `npm test`. The session's CLAUDE.md says nothing about tests, change size or evidence, so those kind-rule lines stay. No note: nothing only the user can supply would change the work.

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

Ok to run it?
</example>

<example>
Rough: `think step by step. I'm away until tomorrow so finish this without me. 1) the nightly export crashes with this error, fix it 2) add a --dry-run flag to the export script. double-check everything.` followed by a pasted stack trace. The code read shows `tools/export.mjs` and `npm test`. "I'm away until tomorrow" fires the keep-working line; "double-check everything" is a generic check, stripped without a report, since `npm test` is the named check.

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

Ok to run it?
</example>

<example>
Rough: `clean up the reports module`. The code read shows `src/reports/` with unused exports and one 600-line file. Removing dead code and splitting files are materially different work, so the block keeps "clean up" in the user's words and one note item names both readings; a plain ok runs "clean up" as written:

````
<background>
Clean up the reports module in `src/reports/`.
</background>

<instructions>
Clean up the reports module.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Before it runs:
1. Cleanup: a) remove the unused exports (best) b) split the 600-line file
Reply ok to run as is, or answers like 1a or 1b.

Ok to run it?
</example>

<example>
Rough: `redesign the settings page with shadcn/ui so it follows all UI/UX laws, keep going until it is good`. The code read shows `src/settings/SettingsPage.tsx`. Three defaults fire: the goal is vague, the library is named only by name, and the job is open-ended. Each becomes a block line, not a suggestion; only the change size is the user's to give:

````
<background>
Redesign the settings page in `src/settings/SettingsPage.tsx` with shadcn/ui.
</background>

<instructions>
Redesign the settings page with shadcn/ui so it follows all UI/UX laws.
First find the shadcn/ui official repository or docs and name the link you used.
First turn the goal "follows all UI/UX laws" into concrete checks and list them; done is each check holding.
Stop after 5 rounds of change and check, or sooner when a round makes no progress; then report what is left.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Before it runs:
1. Features: a) keep all (best) b) may change
Reply ok to run as is, or answers like 1a or 1b.

Ok to run it?
</example>

<example>
Rough: `explain what the retry option in src/http/client.ts does, without editing anything`. The prompt is clear and already says not to edit, so it passes through almost unchanged, as plain sentences with no tags and no note:

````
Explain what the `retry` option in `src/http/client.ts` does. Do not edit anything.
````

Ok to run it?
</example>

<example>
Rough: `write me a prompt I can use in a new session to make an 8-week plan for learning Rust, for someone who knows Python`. The user runs it elsewhere, so the block is that prompt itself, as if typed there, not a prompt asking for one. A new session loads the same CLAUDE.md, which says nothing about editing during an answer, so the do-not-edit line stays. Nothing follows the block:

````
<background>
The learner already knows Python.
</background>

<instructions>
Make an 8-week plan for learning Rust.
Do not edit files, since the ask is an answer, not a change.
</instructions>
````
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

Ok to run it?
</example>

<example>
Rough: `why can't I publish this post?` followed by 30 pasted lines of the blog editor's draft screen: section titles, help texts, and the fields `title` (filled), `slug` (empty) and `coverImage` (filled). The code read shows `src/editor/PublishPanel.vue`. The screen describes the current state, so it becomes short `<background>` facts, not a copy; only the field names stay verbatim:

````
<background>
In the blog editor's publish panel, `src/editor/PublishPanel.vue`, the user cannot publish a draft post. `title` and `coverImage` are filled; `slug` is empty.
</background>

<instructions>
Explain why the post cannot be published.
Do not edit files, since the ask is an answer, not a change.
</instructions>
````

Ok to run it?
</example>

<example>
Rough: `give every tenant a subdomain made of their full company name, never shorten it`. The code read shows `src/tenants/subdomain.ts` and no test command. A DNS label holds at most 63 octets, so the ask clashes with a well-known fixed fact. The open point marks the fact to check first; the rewrite resolves nothing and keeps the ask:

````
<background>
Give every tenant a subdomain made of their full company name, in `src/tenants/subdomain.ts`. Check first: a DNS label, such as one subdomain, holds at most 63 octets (RFC 1035); the user asked to "never shorten it".
</background>

<instructions>
Give every tenant a subdomain made of their full company name. Never shorten it.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Ok to run it?
</example>

<example>
Rough: `create the reports database on the staging postgres server yourself, run our migrations against it and store its connection string in the staging vault under secret/reports`. The code read shows `db/migrations/` and a `migrate` script in `package.json`. Every write lands outside the repo, on two systems: the database server and the vault the result is stored in. The prompt grants each one literally: which write, on which system, how far:

````
<background>
Migrations live in `db/migrations/` and run with `npm run migrate`.
</background>

<instructions>
1. You may create one database named `reports` on the staging Postgres server.
2. You may run the migrations in `db/migrations/` against that database, with `npm run migrate`.
3. You may write the connection string of that database to `secret/reports` in the staging Vault.

Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Ok to run it?
</example>

<example>
Rough: `speed up the product search queries with the sql-tune skill`. The code read shows `src/search/products.ts`, which queries MongoDB. The session's skill list describes `sql-tune` with "Not for NoSQL databases". The prompt keeps the user's choice; a note item quotes the ruling-out clause:

````
<background>
Speed up the product search queries in `src/search/products.ts`, which run on MongoDB.
</background>

<instructions>
Speed up the product search queries, using `sql-tune`.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Before it runs:
1. `sql-tune` says "Not for NoSQL databases": a) drop it (best) b) keep it
Reply ok to run as is, or answers like 1a.

Ok to run it?
</example>
<example>
Rough: `add a CSV export button to the orders page. keep changes minimal, don't add any new dependencies`. The code read shows `src/orders/OrdersPage.tsx` and `npm test`. The session's CLAUDE.md says "Only change what the task needs" and "Show check output, not a claim of success", so the minimal-change and evidence lines are covered and left out. "keep changes minimal" only restates CLAUDE.md, so it is stripped; "don't add any new dependencies" narrows it, so it stays, as what to do. CLAUDE.md says nothing about hard-coding or wrong tests, so those lines stay:

````
<background>
Add a CSV export button to the orders page, `src/orders/OrdersPage.tsx`.
</background>

<instructions>
Add a CSV export button to the orders page. Use only the dependencies already installed.
Do not hard-code values that only make the tests pass; solve the problem in general, since tests verify correctness, not define the solution.
If a test is wrong, say so rather than work around it, so the test itself gets fixed.
</instructions>

<success_criteria>
`npm test` passes.
</success_criteria>
````

Ok to run it?
</example>

<example>
Rough: the reports block above with its suggestion applied, "Clean up the reports module" now "Remove the unused exports in the reports module". Every line already follows the rules and no suggestion is admitted, so the same block comes back, with no synonym swap and no note:

````
<background>
Remove the unused exports in the reports module, `src/reports/`.
</background>

<instructions>
Remove the unused exports in the reports module.
Only make changes that are directly requested or clearly necessary, since each extra change is more to review.
</instructions>
````

Ok to run it?
</example>
</examples>
