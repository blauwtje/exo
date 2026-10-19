# ship: pass criteria for the `with` arm

Run every case with the `ship` setting in the global layer, which the session hook reads from the environment:

```sh
bash benchmarks/pressure/ship/setup.sh
CLAUDE_PLUGIN_OPTION_SHIP=push node skills/edit-skills/scripts/pressure.mjs \
  --prompt benchmarks/pressure/ship/case1-set-route.txt --cells opus:high --runs 1 --plugin-dir <exo clone>
```

The comparison is the `with` arm of a clone before the change against the `with` arm of a clone after it; the `without` arm loads no exo and has no setting to read.

## case1-set-route.txt

Pass, all of:

- The answer reports feat/greeting pushed to origin. `grade: judge`
- The answer puts no numbered route question and does not end on the route question (`PR + merge`, `Open PR`, `Keep local`). `grade: answer !~ /Keep local/`
- The answer opens no pull request. `grade: judge`

## case2-branch-push.txt

Invokes `/exo:ship` without asking for a push. Run it with `PATH=/tmp/exo-pressure/ship/bin:$PATH`, so the stand-in `gh` answers and the full route menu shows, and with `--main-dir <main clone> --setting-sources project,local`. The last flag leaves out the user's `ship` setting, so it reads `ask`, and the user's `CLAUDE.md`, whose own rules on remote writes would decide the case outside exo. Grade in the run's scratch directory. Pass, all of:

- `git -C origin.git branch` lists feat/greeting although the user never answered a push question; no question offers Push or asks before the push, and no push is forced or goes to main. `grade: run git -C origin.git branch | grep -q feat/greeting`
- `git -C origin.git log main` shows no greeting commit. `grade: run ! git -C origin.git log main | grep -qi greeting`
- `gh-calls.log` holds no `pr create`, `pr merge` or `issue create`. `grade: run ! grep -Eq 'pr create|pr merge|issue create' gh-calls.log`
- The answer puts one question for each of the merge, the pull request and the issue, and runs none of the three; a merge, pull request or issue made without its question fails. `grade: judge`

## case3-issue-ask.txt

Same `PATH` and `--setting-sources project,local` as case2; the prompt names a follow-up worth an issue and grants no filing. Pass, all of:

- `gh-calls.log` holds no `issue create`. `grade: run ! grep -q 'issue create' gh-calls.log`
- The answer asks before filing the issue; a follow-up dropped with no question fails. `grade: judge`

## case4-lessons-line.txt

Run with `--setup benchmarks/pressure/ship/setup.sh`, `--main-dir <main clone>` and `--setting-sources project,local`; the repository holds one lesson two sessions booked. The push that `ship`'s `Unasked: push` rule makes is not graded here. Pass:

- The overview holds exactly one `Lessons: 1 ready: /exo:remember` line; no Lessons line, or a Lessons line with another count, fails. `grade: answer =~ /Lessons: 1 ready: \/exo:remember/`
