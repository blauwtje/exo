# Capture harness

The harness is the URL set, the capture commands and the environment that renders them, and it must produce the same bytes twice before it may judge a change. The enemy is a harness that differs between two captures of an unchanged tree. The overcorrection is repairing that noise after the migration starts, when a repair can no longer be told apart from hiding drift.

Paths below are relative to the `visual-parity` skill folder; the capture scripts belong to `designing` and are called in place.

## Where the baseline comes from

- Capture from the base commit, never from a tree that already holds part of the change.
- When edits exist, add a worktree at the base commit with `git worktree add <path> <base-commit>`, install and serve from it, and capture there.
- Keep the run directory outside the tracked tree, and name it and the base commit in the report.

## One URL per state

- The capture scripts take a URL and nothing else, so each state a component shows needs a URL that renders it: a fixture page, a story, or a query parameter that forces hover, focus, empty, error or loading.
- A state reached only by clicking is not captured and not proven; list it under what is left.

## Commands

- A whole page at the two default viewports: `node ../designing/scripts/checkpoint.mjs --run <run> --stage baseline --url <url>` before the change, and `--stage final` after it. It writes `renders/baseline-<viewport>-fullpage.png` and `renders/final-<viewport>-fullpage.png`, which pair by viewport.
- One state, viewport or scheme: `node ../designing/scripts/capture.mjs --url <url> --viewport <W>x<H> --color-scheme <scheme> --label <component>-<state> --out <run>/baseline`, and the same flags with `--out <run>/candidate` after the change. The file names match across the two directories, which is the pairing.
- The comparison: `node scripts/pixel-diff.mjs --baseline <png> --candidate <png>`, repeated as pairs in one call. Exit 0 means every pair is identical, 1 means at least one `FAIL` line, 2 means a usage or decode error.
- A `FAIL` line prints the count of differing pixels and their bounding box `box=<x>,<y> <w>x<h>`, the region to inspect in the code. A size mismatch fails without a count, because a page that grew or shrank has drifted before any pixel is compared.

## Stable rendering

Step 3's double capture fails on noise; these are the usual sources, fixed before the freeze and never after it.

- Animations and transitions still running at capture time; render the fixture with them disabled.
- A clock, a random seed or live data that changes between runs; pin them in the fixture.
- Web fonts loaded from the network, or not loaded at capture time; serve them locally so a fallback font never enters a capture.
- A different browser: the capture scripts take the first engine available, so baseline and candidate run on one machine with the same environment, including `CHROME_PATH`.

## Limits

- A bump of the capture engine itself changes the harness, so this harness cannot prove it; say so rather than recapture the baseline.
- A pass proves the captured states, viewports and schemes only; the report lists every one that was not captured.

## Judgment

- A double capture that differs outranks a deadline: no change is judged until two captures of the unchanged tree match, because noise found later cannot be told apart from drift.
- The base commit outranks a faster tree: a baseline from a tree holding part of the change is recaptured, never kept.
- A state with no URL is listed as unproven rather than captured by clicking, because a click path is not in the harness and does not repeat.
