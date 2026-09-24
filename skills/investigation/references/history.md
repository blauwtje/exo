# History

The reason code has its shape lives in the commit that set it, the pull request around that commit, and the issue or incident it answered. The enemy is the answer read off the code, its comment or the newest commit that touched the line. The overcorrection is an archaeology dig for a `how` question that the running code already answers.

## The trail, in order

1. `git blame -L <start>,<end> -- <file>` names the last commit that touched each line; that is often a move, a rename or a tidy-up, not the origin.
2. `git log --follow -p -- <file>` follows the file across renames; read every commit that changed the lines in question.
3. `git log -S'<literal>' --all --oneline` (pickaxe) finds each commit that added or removed the value, across files, which catches a constant moved to a new module.
4. `git log -G'<regex>' --oneline` catches a changed expression that `-S` misses because the count of matches stayed the same.
5. `git show <sha>` reads the full message and diff; the body often names the incident, ticket, pull request or limit that forced the change.
6. With `gh` authenticated: `gh pr list --search <sha> --state merged` and `gh pr view <number> --json title,body,comments,reviews` read the discussion; `gh issue view <number>` reads a named issue.
7. An MCP source the session has (an issue tracker, chat, docs, incident tool) is searched for a named ticket or incident; its absence is recorded, never a blocker.

## Pitfalls

- **Recency.** The newest commit is the least likely origin; a message that restates a reason for a value it did not change is a claim to check against the commit that did.
- **Comments added later.** A comment's own commit dates it; a comment younger than the value is a second author's guess until history agrees.
- **Squash merges.** One commit may hold a whole branch; its pull request carries the per-change discussion.
- **Mechanics are not motive.** A diff from 500 to 50 shows the change; only a message, pull request, ticket or incident shows the reason.
- **Defensive code.** A retry, sleep, timeout, cap or feature flag often answers an incident; search messages for `incident`, `INC-`, `outage`, `hotfix` and `revert` near its introduction.
- **An empty trail.** An initial import or a bot commit ends the trail; say so, list what was searched, and mark the reason unknown.

## Record the search

Keep one line per source: the command or query, and what it found or that it found nothing. The answer's sources line comes from these, and a null result is a finding, because the next reader otherwise searches again.

## Judgment

- A pull request or issue reachable from a commit outranks the commit message alone.
- The newest commit on a line outranks nothing; treat it as a lead to trace back, not the origin.
- An empty trail is reported with what was searched; it is never filled with a guess from the code's shape.
