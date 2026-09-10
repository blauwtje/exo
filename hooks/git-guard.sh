#!/bin/bash
# PreToolUse guard on Bash: deny destructive git commands before they run.
# Deny-only and never rewrites, so the whole command string is inspected and
# a chained form (`make && git reset --hard`) is covered too.
input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
[ -z "$cmd" ] && exit 0

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

# A global option may repeat and may appear in any order before the subcommand:
# `-C <path>` and `-c <name>=<value>` take a separate value, every other one is a
# single token such as `--no-pager`. Matching only a fixed pair let `git --no-pager
# reset --hard` through, so the run is open-ended.
git_prefix='git( +(-[cC] +[^ ]+|-[^ ]+))*'

# `--force-with-lease` is allowed: the pattern requires a space or line end after `--force`.
grep -Eq -- "${git_prefix} +push( +[^ ]+)* +(-f|--force)( |$)" <<<"$cmd" \
  && deny "git-guard: force push discards remote history. Use --force-with-lease, or ask the user to run it."
grep -Eq -- "${git_prefix} +reset( +[^ ]+)* +--hard" <<<"$cmd" \
  && deny "git-guard: git reset --hard discards uncommitted work. Use git stash or ask the user to run it."
grep -Eq -- "${git_prefix} +clean( +[^ ]+)* +-[A-Za-z]*f" <<<"$cmd" \
  && deny "git-guard: git clean -f deletes untracked files. List them with git clean -n and ask the user."
# Force-deleting a branch is allowed only when its pull request is MERGED: a squash
# merge leaves the branch unmerged for `-d`, and ship-issue's Clean stage deletes it
# that way. `-D`, `--delete --force` in either order and a bundle like `-fd` all mean
# the same thing, so the flags are read out of this invocation's own argument segment
# rather than matched as one spelling. `gh` runs in the `-C` directory when the
# command names one.
if grep -Eq -- "${git_prefix} +branch( |$)" <<<"$cmd"; then
  repo_dir=$(sed -nE 's/.*git +-C +([^ ]+).*/\1/p' <<<"$cmd")
  arguments=$(sed -E "s/.*${git_prefix} +branch +//; s/[;&|].*//" <<<"$cmd")
  deletes=false
  forces=false
  branches=""
  for argument in $arguments; do
    case "$argument" in
      --delete) deletes=true ;;
      --force) forces=true ;;
      --*) ;;
      -*)
        case "$argument" in *[dD]*) deletes=true ;; esac
        case "$argument" in *[fD]*) forces=true ;; esac
        ;;
      *) branches="$branches $argument" ;;
    esac
  done
  if [ "$deletes" = true ] && [ "$forces" = true ]; then
    [ -z "${branches// /}" ] && deny "git-guard: force-deleting a branch discards unmerged work. Report the branch and ask the user."
    for branch in $branches; do
      pr_state=$(cd "${repo_dir:-.}" 2>/dev/null && gh pr view "$branch" --json state --jq .state 2>/dev/null)
      [ "$pr_state" = "MERGED" ] \
        || deny "git-guard: force-deleting a branch discards unmerged work; only a branch whose pull request is MERGED may go. Report the branch and ask the user."
    done
  fi
fi
grep -Eq -- "${git_prefix} +stash +(drop|clear)( |$)" <<<"$cmd" \
  && deny "git-guard: dropping a stash deletes the only copy of that work. Ask the user."
# `git restore --staged .` only unstages and stays allowed. Adding `--worktree` makes
# the same command discard the working tree, so the exemption requires the staged flag
# without the worktree flag. The path is matched quoted too: `"."` reaches the same tree.
if grep -Eq -- "${git_prefix} +(checkout|restore)( +[^ ]+)* +(-- +)?[\"']?\.[\"']?( |$)" <<<"$cmd"; then
  unstages_only=false
  grep -Eq -- '(^| )(--staged|-S)( |$)' <<<"$cmd" \
    && ! grep -Eq -- '(^| )(--worktree|-W)( |$)' <<<"$cmd" \
    && unstages_only=true
  [ "$unstages_only" = true ] \
    || deny "git-guard: checking out or restoring the whole tree discards uncommitted work. Name the files, or ask the user."
fi
exit 0
