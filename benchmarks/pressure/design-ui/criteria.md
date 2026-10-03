# design-ui: pass criteria for the `with` arm

The cases fall in three groups. Run every prompt but `a-orders-overview.txt` on `sonnet:high`, the cell of design-ui's `build` kind, and read the final answer.

- `a-landing.txt` covers the one-pass default. It needs the fixture `setup.sh` lays down, and runs with `--main-dir` against main.
- `a-labels.txt`, `b-open-picker.txt` and `c-side-by-side.txt` cover the opt-in picker's `direction-preview` reference. They need no fixture: each prompt asks for the next file or tool calls and runs nothing, so run them from the root of an exo clone.
- `a-orders-overview.txt` covers the full-scope completion, the mood and the motion bar. It needs no fixture.

## One-pass default

Pass for `a-landing.txt`, all of:

- No A/B/C preview offer, sketch tab or picker, and no `exo:survey-ui`, `exo:build-ui`, `exo:critique-ui` or QA delegate.
- A plan naming color hex values, fonts and an ASCII layout precedes the first edit, and is checked against the request's items.
- `scripts/direction.mjs --deal` and `scripts/font-candidates.mjs` with `--history /private/tmp/designing` run before the plan, neither with `--seed`.
- The plan's accent sits within 30 degrees of the dealt hue.
- The plan's ASCII layout follows the dealt `nav`, `body` and `lead`, or `plan.json` states a content reason in `layout.override.reason`.
- `scripts/direction.mjs --check-plan` reports `"status":"ok"` before the first edit.
- `scripts/capture.mjs` runs with viewports 390x844 and 1440x900, both PNGs are read, and one fix pass follows with no second capture.

## Full scope and motion

Run `a-orders-overview.txt` in the `opus:high` cell with `--runs 3`, both arms, and `--main-dir` set to a main checkout to compare against the previous main. The case adds no pressure, because the empty result is a default tendency seen in four real runs, and `pressure-scenarios.md` gives such a tendency none.

- `a-orders-overview.txt`: the stated scope names navigation, search or filtering, a chart or KPI visualisation, and empty, loading and error states. It names one mood of the four in `skills/design-ui/references/intake.md`. Its motion names at least a staggered entrance, a count-up and a sliding panel. A run fails when any scope group is missing, or when it calls the motion minimal, feedback-only or stillness.

## Picker comps

The cases cover the `direction-preview` reference: `a` looks a key list up, `b` applies the check before the picker, `c` asks for a picker mode the reference does not hold.

- `a-labels.txt`: the answer is one JSON object in Dutch with `lang` set to `nl` and exactly the keys of `skills/design-ui/assets/pick-labels.json` (`title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `tabs`, `typeRole`, `steer`, `done`, `failed`, `lang`); `fallbackTitle` keeps `{n}`, and no `zoom` or `close` key appears.
- `b-open-picker.txt`: every comp outline holds all seven sections in the page's order and stays near the 400-line budget, not one screenful. The calls run `pick.mjs --check` on the written comps, then Read the captures at both 390 and 1440 wide plus each variant's `check-ui.json`, then fix and rerun the check on a fault, and only then start `pick.mjs` under `run_in_background` with `--labels` and `--recommend`. A picker start before that check, a check at one width only, captures that are never read, or `--unchecked` without a `--check` exit 3 fails the case. One `build-ui` delegate per comp fails it too.
- `c-side-by-side.txt`: the reply tells the user the picker shows one full-size comp per tab, switched with the arrow keys or a seat's letter, and the command adds no invented flag (`--grid`, `--side-by-side`, a zoom) and no hand-built page of scaled comps.

Pre-edit baseline on 2026-10-03 (`--main-dir` on `main` at 0.78.1, one run): `a` wrote `zoom` and `close`; `b` planned a render check at 390 only, read no capture, and dispatched one `build-ui` agent per comp; `c` promised a side-by-side grid, which the pre-edit picker had.
