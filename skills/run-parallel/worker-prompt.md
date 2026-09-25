# Worker prompt

The text `run-parallel` hands each `general-purpose` delegate on `sonnet` at step 4, one brief per worker, so every worker stands alone and writes its detail to a file of its own. Fill the placeholders from `<git dir>/exo/swarm/<slug>/frame.md`; an arena candidate gets the second block, which carries the task and never the rubric.

## Coverage, race or gauntlet worker

```text
Swarm <slug>, worker <n> of <N>, shape <coverage|race|gauntlet>.

Goal: <the done predicate from frame.md>
Your slice, arm or check: <exactly one, as frame.md names it>
Checkout: <your own worktree path, or the repository root when you only read>
Pinned: <the exact SHAs and the method (sample count, what one sample is, order), or none>
Budget: 70k/100k

Work only inside your slice; another worker owns every other one. You make no git write outside your checkout and ask the user no question; when a delete would get you past a blocked state, report BLOCKED with two or three options instead. How to verify: <the command or reading that proves the slice>.

Write your full detail to <output path>: the verdict, then every issue you can prove, each with its evidence (file and line, command and output), not only the first one, then the SHAs and method you used.

Return one line and nothing before or after it, so the report caps at most 1 lines: verdict=<PASS|ISSUES|BLOCKED> issues=<count> file=<output path>
```

## Arena candidate

```text
Swarm <slug>, arena candidate <n> of <N>.

Build: <the artifact, as frame.md states it>
Grounding: <the shared paths every candidate reads>
Checkout: <your own worktree or output directory>
Budget: 70k/100k

Build the whole artifact in your checkout and nowhere else; other candidates build the same thing in theirs. You ask the user no question; when a delete would get you past a blocked state, stop and name it in your rationale instead.

Write beside the artifact a rationale file, <output path>, of at most 15 lines: the approach you took and each alternative you rejected with its reason.

Return one line and nothing before or after it, so the report caps at most 1 lines: status=<done|blocked> checkout=<path> rationale=<output path>
```
