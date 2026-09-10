#!/usr/bin/env bash
# Resolves the ship-issue argument (read from stdin) to one open issue and prints
# the git and GitHub evidence the stage table in SKILL.md reads. Read-only.
arg=$(cat)
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>&1)
n=$(printf '%s' "$arg" | sed -nE 's#.*github\.com/([^/]+/[^/]+)/issues/([0-9]+).*#\1 \2#p')
if [ -n "$n" ]; then
  case "$n" in "$repo "*) n=${n#* } ;; *) echo "URL belongs to ${n% *}, not to $repo: stop."; n=''; arg='' ;; esac
elif [ -z "$arg" ]; then
  echo "No issue named: stop."
else
  n=$(printf '%s' "$arg" | sed -nE 's/^[[:space:]]*#?([0-9]+)[[:space:]]*$/\1/p')
fi
if [ -z "$n" ] && [ -n "$arg" ]; then
  matches=$(gh issue list --state open --limit 8 --search "$arg" --json number,title --jq '.[] | "#\(.number) \(.title)"' 2>&1)
  if [ "$(printf '%s\n' "$matches" | grep -c '^#')" = 1 ]; then
    n=${matches#\#}; n=${n%% *}
  else
    echo "Candidates for \"$arg\":"; printf '%s\n' "$matches"
    echo "Open issues:"; gh issue list --state open --limit 30 --json number,title --jq '.[] | "#\(.number) \(.title)"' 2>&1
  fi
fi
if [ -n "$n" ]; then
  echo "Issue: $(gh issue view "$n" --json number,title,state,url --jq '"#\(.number) \(.state) \(.title) \(.url)"' 2>&1)"
  echo "Default branch: $(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>&1)"
  echo "Branches: $(git for-each-ref --format='%(refname:short)' "refs/heads/issue-$n-*" "refs/remotes/origin/issue-$n-*" 2>&1)"
  echo "Worktrees:"; git worktree list 2>&1
  echo "PRs:"; for b in $(git for-each-ref --format='%(refname:short)' "refs/heads/issue-$n-*" "refs/remotes/origin/issue-$n-*" | sed 's#^origin/##' | sort -u); do gh pr list --state all --head "$b" --json number,state,headRefName,url --jq '.[] | "#\(.number) \(.state) \(.headRefName) \(.url)"'; done 2>&1
fi
