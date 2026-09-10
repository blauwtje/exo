---
name: ship-issue
description: Take one open GitHub issue, named by number, URL, title or description, to merged and cleaned up, one stage per invocation, routing the build to debug, implement, shaping or planning by the kind of issue. Use when the user names an issue number to build, land, or resume. Not for several issues in one session, a PR this skill did not open, or a change without an issue.
argument-hint: <number, #number, issue URL, title, or what the issue is about>
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *)
shell: bash
---

# Ship one issue, two stages

Resolve the stage from git and the GitHub API, run that stage to its end, and
stop. The enemy is the single-session marathon: issue, investigation, build,
review and merge in one context, where every later step reads a larger and
staler context. The overcorrection is a stop after every step, where each
re-invocation re-reads the issue and the PR for a minute of work. Build ends
at the pull request and Land ends at the merge; a stop inside a stage is a
wait or a second failure, never a habit. The branch and the API say what
landed; a note may only say what to do next. Start this skill on the
session's model: Build plans and debugs there, and `/exo:implementing` runs its own
turns on Opus, building through Sonnet agents.

Invoking this skill with an issue number authorizes, for that issue only: a
worktree and branch, commits and pushes on that branch, one pull request, its
merge once every gate is green, and removal of the worktree and branch after
the API reports `MERGED`. Nothing else.

## Stage resolution

The argument names one issue as a number, `#number`, an issue URL of this
repository, its title, or a description of what it is about. Text resolves
against open issues only: this skill ships open issues, and closed ones only
reach Clean, after their PR merged, when named by number or URL.

```!
cat <<'SHIP_ISSUE_ARG' | bash "${CLAUDE_SKILL_DIR}/scripts/resolve-issue.sh"
$ARGUMENTS
SHIP_ISSUE_ARG
```

An `Issue:` line above means the argument resolved. `Candidates` means it did
not: pick the one candidate the description clearly names and say which;
when two fit or none does, ask and stop. A command error stops here with its
output. Take the first row that matches; when several PRs exist, the highest
number is the PR. Never infer a stage from memory or an earlier turn: the
issue closes when its PR merges, so a closed issue alone proves nothing.

| Evidence above | Stage |
|---|---|
| A PR is `OPEN` | Land |
| The newest PR is `MERGED` and its branch or worktree still exists | Clean |
| The newest PR is `MERGED` and nothing remains | Report done, stop |
| The newest PR is `CLOSED` without merge | Report it and stop: the user decides whether to reopen or rebuild |
| A branch exists and no PR | Build, resuming |
| Issue `OPEN`, no branch | Build, fresh |
| Issue `CLOSED`, no branch | Report it and stop |

## Enter the worktree

Every stage runs inside the issue's worktree, never on the default branch.
Branch and worktree are both named `issue-<n>-<slug>`, the slug being three to
five kebab-case words from the title.

- Worktree listed: `EnterWorktree` with its `path`.
- Branch without worktree: `git worktree add "$(git rev-parse --show-toplevel)/.claude/worktrees/issue-<n>-<slug>" issue-<n>-<slug>`, then enter that path.
- Nothing yet: `git fetch origin`, then the same command with `-b issue-<n>-<slug> origin/<default>` before the path, then enter it.

Then read `$(git rev-parse --git-dir)/ship-issue-next.md` when it exists: a
previous context left the next step there. Delete it once that step is done.

## Build

1. **Read the issue.** `gh issue view <n> --json body,labels,comments --jq '{body: .body[0:4000], labels: [.labels[].name], comments: [.comments[-5:][] | .body[0:1500]]}'`.
   Restate in at most five lines: symptom or goal, what done means, non-goals.
   When the issue does not say what done means, ask one question and stop.
2. **Classify and route.** Decide from the body and the evidence; a label is
   a hint, not a verdict. Name the kind of issue, then load that one skill;
   its own gates and references govern from there.

   | Kind of issue | Route |
   |---|---|
   | Existing behavior is wrong: bug, error, crash, regression, wrong output, slowdown | `debug`. Expect a finished, proven fix back, never a diagnosis alone. |
   | Named exact change with a decided solution: refactor, rename, extract, config, dependency, decided feature | `implementing-batch`. No reproduction step. |
   | Capability without a chosen solution, or trade-offs to weigh | `shaping` for the brief, then `implementing-batch`, which orders the edits inline. `planning` at deliverable depth only when the brief touches more than six files or crosses a migration, credential, or security boundary: it writes the plan into this worktree's `docs/plans/` and this stage stops; the user clears and runs `/exo:implementing`, which finishes the plan on the `issue-<n>-<slug>` branch through the branch review and the pull-request question, then names `/ship-issue <n>` for Land, or for Clean when it merged. A deliverable plan cost a median 52 minutes before the first edit on 2026-09-07, which a small issue cannot afford. |
   | Visual-only surface | The frontend-design skill the session has loaded (`designing` or `impeccable`), then `implementing-batch`. |

3. **Resuming:** read `git log origin/<default>..HEAD --oneline` and
   `git diff --stat` before any edit; the branch, not memory, says what landed.
4. **Build under the routed skill.** Tell it that a pull-request review follows, so it skips its fresh-eyes step: Land reviews once per head, and a review here would read the same diff twice.
5. **Commit and push.** Conventional Commits, one commit per logical change,
   no tool or assistant attribution anywhere. `git push -u origin issue-<n>-<slug>`.
6. **Open the PR.** `gh pr create --base <default> --title "<type>(<scope>): <summary>" --body-file <file>`
   with three lines on what and why, the proof command and its result from the
   routed skill, and `Closes #<n>`. Print the PR URL. Continue into Land in
   this turn when no context-budget report has arrived and
   `git diff --stat origin/<default>..HEAD` names at most five files;
   otherwise stop, and the user runs `/ship-issue <n>` again for Land after
   clearing.

## Land

Land runs from review to merge in one invocation and stops only where a wait
or a second failure needs a fresh read.

1. **Review once per head.** `gh pr view <pr> --json headRefOid,comments --jq '{head: .headRefOid, reviewed: [.comments[].body | select(startswith("Reviewed "))]}'`.
   When no `Reviewed <head sha>` comment exists: run the `code-review` skill on
   the PR at medium effort. Fix confirmed correctness findings on the branch, an
   unproven cause under `debug`, then commit and push. Post
   `gh pr comment <pr> --body "Reviewed <head sha>: <count> findings, <fixed> fixed"`
   with the head sha after that push, and continue.
2. **Wait for checks.** `gh pr checks <pr> --watch --fail-fast --interval 30 > "$(git rev-parse --git-dir)/ship-issue-checks.log" 2>&1`
   as a background command with the Bash `timeout` set to 600000, then
   `tail -n 20` of that log once it exits. `no checks reported` right after a
   push means the rollup is not filled yet: retry after thirty seconds, at most
   five times. Still pending at the timeout: stop, the user re-invokes when CI
   is done. A failed check: take its `link` from
   `gh pr checks <pr> --json name,state,link`, read
   `gh run view <run id from the link> --log-failed | tail -n 40`, fix under
   `debug` (a failing check is a failure with evidence), push, and watch once
   more; a second failure stops with its forty lines.
3. **Gate.** Read `../merge-prs/SKILL.md` and run its Step 2 for this PR: one
   `gh pr view` read, printed raw. `BEHIND`: `git fetch origin`,
   `git rebase origin/<default>`, `git push --force-with-lease`, post
   `Reviewed <new head sha>: rebase only` because the content did not change,
   then Land Step 2 and this gate read once more. `DIRTY`: resolve the
   conflicts, push, then Land Steps 1 and 2 and this gate read once more.
   `UNKNOWN`: GitHub is still computing, re-read once after thirty seconds.
   Any status other than `CLEAN` on the last read: report the JSON and stop.
4. **Merge.** Run `merge-prs` Steps 4 and 5 for this PR, never with
   `--delete-branch`; a merge is reported only after the re-read shows `MERGED`.
5. Clean follows in this turn: it needs no reads beyond the `MERGED` one just
   made.

## Clean

Only after `state` `MERGED` in a read from this turn.

1. `gh pr list --state open --base issue-<n>-<slug>` must be empty; otherwise
   keep the branch and report which PR stacks on it.
2. `ExitWorktree` with `keep` to leave the directory, then
   `git worktree remove "<worktree path>"`.
3. `git branch -D issue-<n>-<slug>`: a squash merge leaves the branch unmerged
   for `-d`, so the `MERGED` read above is the proof. Then
   `git push origin --delete issue-<n>-<slug>` unless
   `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge` prints `true`,
   and `git fetch --prune`.
4. Report issue, PR, merge commit, and what was removed.

## Context discipline

- One stage per invocation, then stop, with one exception: a Build of at most
  five files with no context-budget report continues into Land and Clean,
  because a fresh Land context costs the user a clear and a re-read for a
  review that fits in the remaining budget. A larger Build stops: Land reads
  the PR fresh, and a build context carries the diff twice.
- A stage that cannot finish (a compaction notice, a routed skill that stops,
  or the same step failing twice) writes the next step and the evidence to
  `$(git rev-parse --git-dir)/ship-issue-next.md`, reports, and stops.
- Cap every read: `--jq` with slices on `gh`, the last five issue comments,
  forty lines of a failed job log, never a full CI log or the whole thread.

## Parallel issues

One issue per session. A second issue runs in a second session with its own
worktree, on files the first does not touch. Land stages serialize through the
gate: `BEHIND` means rebase and re-gate, never merge on a stale read. Never fan issues out
to subagents from one session: that pays the orchestrator context plus a full
reload per agent and returns nothing a second session would not.

## Judgment

- API and git reads from this turn outrank memory and earlier turns.
- A gate stop outranks finishing: never relax a gate, never force-push the
  default branch, never delete anything before `MERGED`.
- The routed skill's gates outrank the routing table: when `debug` finds the
  cause already proven it fixes directly; when `implementing-batch` counts zero size
  facts it makes the direct edit.
- The `merge-prs` rules on stacked PRs and branch deletion apply; this skill's
  invocation is the explicit deletion authorization `merge-prs` requires, for
  this issue's branch only.
