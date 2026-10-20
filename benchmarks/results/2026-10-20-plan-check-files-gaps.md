# plan-check finds Files: gaps in any test layout

Tested on 2026-10-20 as a $0 offline replay of recorded real-use transcripts. Scripts, prereg and notes are local and untracked in the main checkout under `.exo/self-improve/s6/`.

$0 spent, offline. Prereg: r1-test-F4-prereg.md (unchanged). Scripts: tests/f4/ (ext, files, replay, ctrl, fin .mjs; they read /tmp/s6f4 intermediates, rerun order ext, files, ctrl, replay, fin).

## Numbers
- Corpus: 39 `Plan repair of task N` solve-hard dispatches (non-exo, non-sweep real use). 37 replayable (base repo + pre-repair Files: found); orbit T19 and routemax T43 not replayable (counted as misses). Snapshot = last commit on any ref before the repair started.
- Recall (rule G1 tests by stem/import/name, G2 lockfile of a listed manifest): 14/39 = 35.9%, Clopper-Pearson lower 95% bound 21.2% (needs > 30%, point >= 40%). Replayable-with-known-missing-path subset: 14/35 = 40.0% (needs >= 60%). Fails.
- False warnings on 40 control tasks (plans on disk, not repaired, first 40 by path; HEAD snapshot): 33/40 tasks flagged (82.5%, Wilson 68-91%), 5.35 warnings per task (needs <= 20% of tasks). Fails, by a wide margin. Bias: HEAD holds tests that later tasks created, which inflates this; I did not debias (not preregistered) but 33/40 is too far above 0.20 for that to rescue it.
- Priced (prereg item 3): caught repairs saved gross $8.51 (repair solve-hard $2.36 + measured rebuild $2.37 + $0.30 lead/run-unit estimate each, minus $0.03 warning fix) = 12.7% of the REPAIR bucket B ($67.0) but 1.08% of run cost ($784.8). At the measured warning rate the false-warning charge ($0.03 x 5.35 x ~900 tasks = $144) exceeds the gain: net -$135.9 = -203% of B, -17.3% of run cost; bootstrap 95% CI of net/B -209% to -196% (lower bound must be > 0). Fails. Even at zero false-warning cost the gain is 1.1% of run cost (wall/variance only).

## What the 39 cases are (why recall tops out near 40%)
- Caught 14: test files outside Files: that import or share a stem with a Modify source (roblox-kit, routemax, new-data-os C# architecture tests).
- Missed, rule out of scope by design: new untracked files (CSS modules an architecture test demands, snapshot pngs, har files; 9), manifests the task must newly add to (owClimb package.json, tsconfig include, 3), caller or config files that are not tests (src/config.ts, seed json; 5), empty/unparsable missing set (2), unreplayable (2).
- Directory-entry cases (4, newdataos and exo audit): obsolete. `isCovered` in lib/plan-tasks.mjs (line 333) already treats an entry ending `/` as covering its files, so land-task no longer refuses them; G3 dropped as the prereg required after that check. They stay in n as misses; excluding them gives 14/35.
- Lockfile cases (owClimb 2): the manifest was not in Files: at all, so a "listed manifest needs lockfile" rule (G2) cannot see them.

## Verdict
FAIL on recall bound, subset recall, false-warning rate, priced net, and bootstrap. The rule is not worth shipping: the import reach that catches the real test gaps also flags a test on most tasks that landed first try. No branch, no worktree. A narrower variant (flag only a test that imports a Modify source, no name/stem match) may cut false warnings, but it would be tuned after seeing these results; a fresh prereg is required.
