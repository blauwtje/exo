# design-ui: pass criteria for the `with` arm

The cases fall in seven groups. Run every prompt but `a-orders-overview.txt`, `a-orders-character.txt`, `a-dispatch-user.txt`, the build-stack cases and `d-orders-theme.txt` on `sonnet:high`, the cell of design-ui's `build` kind, and read the final answer.

- `a-landing.txt` covers the one-pass default. It needs the fixture `setup.sh` lays down, and runs with `--main-dir` against main.
- `a-labels.txt`, `b-open-picker.txt` and `c-side-by-side.txt` cover the opt-in picker's `direction-preview` reference. They need no fixture: each prompt asks for the next file or tool calls and runs nothing, so run them from the root of an exo clone.
- `a-orders-overview.txt` covers the full-scope completion, the mood and the motion bar. It needs no fixture.
- `a-orders-stack.txt`, `b-vue-stack.txt` and `c-landing-stack.txt` cover the build stack: the default stack in an empty folder, an existing project's stack, and where Magic UI effects belong.
- `d-users-form.txt` and `e-directions-answer.txt` cover the intake form's Users and Directions questions. They need no fixture and run in the `sonnet:high` cell with `--main-dir` against main.
- `d-orders-theme.txt` covers the shadcn theme in the default stack. It needs no fixture.
- `d-playful-generator.txt` and `d-playful-no-generator.txt` cover illustration in the friendly and playful mood, with and without an image generator. They need no fixture.

## One-pass default

Pass for `a-landing.txt`, all of:

- No A/B/C preview offer, sketch tab or picker, and no `exo:survey-ui`, `exo:build-ui`, `exo:critique-ui` or QA delegate.
- A plan naming color hex values, fonts and an ASCII layout precedes the first edit, and is checked against the request's items.
- `scripts/capture.mjs` runs with viewports 390x844 and 1440x900, both PNGs are read, and one fix pass follows with no second capture.

## Full scope and motion

Run `a-orders-overview.txt` in the `opus:high` cell with `--runs 3`, both arms, and `--main-dir` set to a main checkout to compare against the previous main. The case adds no pressure, because the empty result is a default tendency seen in four real runs, and `pressure-scenarios.md` gives such a tendency none.

- `a-orders-overview.txt`: the stated scope names navigation, search or filtering, a chart or KPI visualisation, and empty, loading and error states. It names one mood of the four in `skills/design-ui/references/intake.md`. Its motion names at least a staggered entrance, a count-up and a sliding panel. A run fails when any scope group is missing, or when it calls the motion minimal, feedback-only or stillness.
- `a-orders-overview.txt`, the app minimum: the stated scope, and any screen built from it, carries navigation with icons, search, a user menu, stat counters each with a sparkline, a chart, and a detail panel. It also carries a table with avatars, status badges, sortable columns, row checkboxes and a bulk action bar, and a run missing any item fails.

## Character

Run `a-orders-character.txt` like `a-orders-overview.txt`, in the `opus:high` cell with no fixture and no pressure.

- Pass: the plan names one standout element, tinted ground and surfaces rather than white boxes on grey with one accent, and at least two block anatomies; a businesslike or strict mood does not excuse any of them.

Pre-edit baseline on 2026-10-04 (0.80.1, two runs each arm): all four built white cards on a light grey or off-white ground with one cobalt or green accent and one card anatomy for every block.

## Plan for the user

Run `a-dispatch-user.txt` in the `opus:high` cell with `--runs 2`, `--main-dir` on a main checkout, no fixture and no pressure: the cliché look is a default tendency seen in two real runs.

- Pass, all of: the plan names the dispatcher's three most important tasks and orders the layout by them; each major layout choice names its Laws of UX rule; each face and the accent hue carries a clause naming the user fact it answers, after a shortlist of three.

Pre-edit baseline on 2026-10-04 (0.80.5, six runs of the pre-edit skill): no plan named three tasks or a Laws of UX rule; all six chose a cobalt or navy accent and four chose Archivo. After the edit, five runs: all named tasks and laws; accents went teal, teal, violet, cobalt, teal; Archivo stayed in four, with Inter listed first as a decoy.

## Build stack

Run `a-orders-stack.txt`, `b-vue-stack.txt` and `c-landing-stack.txt` in the `sonnet:high` cell of design-ui's `build` kind and the `opus:high` cell of the session that runs the one pass, with no pressure: the hand-built page is a default tendency seen in a real run. `b-vue-stack.txt` needs the `orders-vue` fixture `setup.sh` lays down; the other two need none. Each answer is a setup written before any file, so read the final answer.

- `a-orders-stack.txt`, all of: the stack is Vite, React, TypeScript, Tailwind, shadcn/ui and lucide-react, scaffolded with a Vite create command and `shadcn init`; components come through `shadcn add`, with no block such as `dashboard-01` as the base; the revenue chart is a shadcn chart on Recharts; the orders table is the shadcn data table on TanStack Table with sorting, filtering and row selection; toasts are sonner and the stat counters `@number-flow/react`; motion comes from Motion; fonts come from a Fontsource package; the preview is the Vite dev server. A single HTML file, hand-written CSS or JS components, a hand-drawn SVG or canvas chart, a Google Fonts `<link>` or `@import`, a `file://` preview, or a Magic UI effect on this app screen fails it.
- `b-vue-stack.txt`: the setup keeps the fixture's Vue 3, Vite, plain CSS and `vue-chartjs`, builds the chart on `vue-chartjs`, and previews through `npm run dev`. Adding React, shadcn/ui, Tailwind or TypeScript, or scaffolding a new project, fails it; a Vue package for a job the project lacks, such as a table or toasts, passes.
- `c-landing-stack.txt`: the stack and fonts match `a-orders-stack.txt`, the preview is the Vite dev server, and the hero or section effects may come from Magic UI through `shadcn add`. A single HTML file, a Google Fonts CDN link or a `file://` preview fails it.

Pre-edit baseline on 2026-10-04 (0.80.4, one run each arm): with the skill, `opus:high` planned one static `index.html` with an inline SVG chart, Google Fonts and `open index.html` in `a` and `c`, and `sonnet:high` did the same in `c`; without it, both cells chose Vite, React, shadcn, Fontsource and the dev server, yet wrote their own count-up hook, named no Motion and no row selection. Every arm kept the Vue stack in `b`.

## Shadcn theme

Run `d-orders-theme.txt` like the build-stack cases, in the `sonnet:high` and `opus:high` cells with no fixture and no pressure: stock shadcn shapes are a default tendency seen in real runs. Read the final answer.

- Pass: `--radius` and every color token, `--card` and `--popover` included, come from the direction, not the preset; button, card, table, input, select, tabs and checkbox each change classes or `cva` variants, and the plan adds a variant for a named role such as order status. A visible control marked "kept as fetched", or a `className` override at the call site instead of a variant, fails it.

Pre-edit baseline on 2026-10-04 (0.80.5, one run each arm): without the skill, both cells marked `button`, `input`, `tabs`, `checkbox` and the menus "kept as fetched" and set `--card` to pure white in `opus`; with the pre-edit skill, both still kept `input`, `select`, `tabs` or `checkbox` as fetched. After the edit, both `with` cells recut every visible control and kept only token-carried parts such as `chart`, `sonner` and `separator` as fetched.

## Playful illustration

Run both `d-playful-*` cases in the `sonnet:high` cell with no pressure, and read the plan in the final answer.

- `d-playful-generator.txt`: the plan generates its illustrations with `mcp__imagegen__generate`, each showing the page's own content in the plan's palette; when the tool proves absent at build time, a labelled placeholder with a request passes. A plan with no illustration, one that waits for permission to generate, a hand-drawn SVG figure, or a prompt for an owl, Duolingo green or another product's character fails it.
- `d-playful-no-generator.txt`: the plan places a labelled placeholder and asks for the real illustration; a hand-drawn SVG mascot or figure fails it.

Pre-edit baseline on 2026-10-04 (0.80.5, two runs of the generator case, one of the other): with the skill, one generator run built no illustration and asked permission to generate; without it, one run hand-drew a mascot in SVG in near-Duolingo green, and the other kept a hand-drawn SVG fallback. Without the skill the no-generator run hand-drew the mascot; with it, the run used letter tiles and no figure.

Post-edit on 2026-10-04 (same runs): with the skill, one generator run planned four generated PNGs of the page's own content with "no owl, no copy of their look", the other planned one and placed a labelled placeholder once the tool proved absent; the no-generator run placed labelled placeholders and asked for the images. Every run without the skill hand-drew its mascot in SVG.

## Picker comps

The cases cover the `direction-preview` reference: `a` looks a key list up, `b` applies the check before the picker, `c` asks for a picker mode the reference does not hold.

- `a-labels.txt`: the answer is one JSON object in Dutch with `lang` set to `nl` and exactly the keys of `skills/design-ui/assets/pick-labels.json` (`title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `tabs`, `typeRole`, `steer`, `done`, `failed`, `lang`); `fallbackTitle` keeps `{n}`, and no `zoom` or `close` key appears.
- `b-open-picker.txt`: every comp outline holds all seven sections in the page's order and stays near the 400-line budget, not one screenful. The calls run `pick.mjs --check` on the written comps, then Read the captures at both 390 and 1440 wide plus each variant's `check-ui.json`, then fix and rerun the check on a fault, and only then start `pick.mjs` under `run_in_background` with `--labels` and `--recommend`. A picker start before that check, a check at one width only, captures that are never read, or `--unchecked` without a `--check` exit 3 fails the case. One `build-ui` delegate per comp fails it too.
- `c-side-by-side.txt`: the reply tells the user the picker shows one full-size comp per tab, switched with the arrow keys or a seat's letter, and the command adds no invented flag (`--grid`, `--side-by-side`, a zoom) and no hand-built page of scaled comps.

Pre-edit baseline on 2026-10-03 (`--main-dir` on `main` at 0.78.1, one run): `a` wrote `zoom` and `close`; `b` planned a render check at 390 only, read no capture, and dispatched one `build-ui` agent per comp; `c` promised a side-by-side grid, which the pre-edit picker had.

## Users and directions

- `d-users-form.txt`: the form's first question is a single-select Users question of three or four options, each naming a role, a device, how often and a main task. Scope and Mood follow, then a single-select Directions question with the options 1, 2 and 3. Four questions at most.
- `e-directions-answer.txt`: the calls deal three contracts with `direction.mjs --plan --variants 3`, start the sketch tab's `--serve`, write one `$RUN/sketches/001-direction.html` with three options, and start `--wait`. The user line is written to `$RUN/user.md`. A preview offer or any other question before the sketch, full comps or `pick.mjs` fails it.

Pre-edit baseline on 2026-10-04 (`--main-dir` on `main` at 0.80.5, one run): `d` sent only Scope and Mood; `e` planned three sketches as the with arm did but recorded no user, and a stricter earlier wording that allowed no reads planned three full comps for `pick.mjs`.
