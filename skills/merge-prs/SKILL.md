---
name: merge-prs
description: Review and merge the open pull requests of this repository one at a time behind hard gates read from the GitHub API. Use when the user asks to merge open or listed PRs. Not for reviewing code, for a PR the user did not name or list, or for anything that deletes a branch.
disable-model-invocation: true
---

# Merge pull requests, one at a time

Merge only what the API proves mergeable, one PR per step, and re-read the API
before every claim. The enemy is a merge script that remembers a CI status
instead of re-reading it: one such run auto-closed a stacked PR and reported a
merge that never happened. The overcorrection is batching: several merges in
one command hide which gate failed for which PR.

Invoking this skill authorizes the merges it performs on the PRs the user
named, or on every open PR when the user said so; it authorizes nothing else.

## Steps

1. **List.** `gh pr list --state open --json number,title,baseRefName,headRefName`.
   Keep the user's order when they named PRs; otherwise take the list order.
   Print the table before touching anything.
2. **Gate, per PR, from the API.** Run
   `gh pr view <n> --json number,title,mergeable,mergeStateStatus,statusCheckRollup,baseRefName,headRefName,reviewDecision --jq '{number,title,mergeable,mergeStateStatus,reviewDecision,baseRefName,headRefName,checks:[.statusCheckRollup[]|{name,context,conclusion,state}]}'`
   and print that JSON; the sliced checks keep a PR with many workflows
   under one screen of output. Merge only when `mergeStateStatus` is `CLEAN` and
   every entry in `statusCheckRollup` has `conclusion` `SUCCESS` or
   `state` `SUCCESS`. `BLOCKED`, `BEHIND`, `DIRTY`, `UNSTABLE`, `UNKNOWN`,
   a pending check, or a `CHANGES_REQUESTED` review is a stop for that PR:
   report it and continue with the next PR. Never read the status from
   memory or from an earlier step.
3. **Stack check.** A PR is a base when another open PR's `baseRefName`
   equals its `headRefName`. Merge bases before the PRs stacked on them, and
   never pass `--delete-branch` for a PR that is a base: GitHub closes the
   stacked PR when its base branch disappears. Say which PRs this applies to.
4. **Merge one.** `gh pr merge <n> --squash` (or the repository's documented
   merge method) without `--delete-branch`. Branch deletion is a separate,
   explicitly authorized step and never runs here.
5. **Re-verify.** `gh pr view <n> --json state,mergedAt` must show
   `state` `MERGED`. Report a merge only after that read; otherwise report
   the PR as not merged with the JSON that says so. Stacked PRs then need a
   fresh gate, since their base just moved.
6. **Report.** One table: PR, gate result, merged yes/no, blocking reason.
   Stop and report as soon as anything is ambiguous. Do not retry a failed
   merge unchanged.

## Judgment

- API JSON read in this step outranks any earlier read or remembered status.
- A stop for one PR outranks finishing the list: report it, never force,
  never relax a gate.
- The user's authorization outranks this skill's defaults, except the
  `--delete-branch` and `git branch -D` prohibitions, which need their own
  explicit instruction naming the branch.
