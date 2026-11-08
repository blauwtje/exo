# Merging a pull request and menu routes

## Step 5 verdicts

- `PASS` or `PASS+NOTES` → record verdict and `patch-id=` under `## Verification`, via `gh pr edit <n> --body-file <f>` on an open PR.
- Reuse a recorded verdict past `--verdict-current <patch-id>`; `stale` reruns it.

## Step 7, named pull requests

- Print `gh pr list --json number,title,baseRefName,headRefName` in order.
- Each gets a step 5 verdict via `gh pr view <n> --json headRefOid,baseRefName,title,body`; `FAIL` drops out.
- Then run step 7's `--merge` command.

## Step 3, routes the menu skips

- An `Unasked: push` line runs `--route push` unforced before the question, dropping the menu's Push.
   - Plan `Land:` from `gate` sets the route with no question: `push-main` gives `push`, `pr` gives `open-pr`, `local` gives no route.
