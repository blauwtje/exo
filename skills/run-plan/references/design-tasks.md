# Design tasks

Route a plan task that carries a `Design:` line by how settled its direction is. The enemy is handing an unsettled direction to a delegate: it still needs the user's judgment, and a delegate cannot ask. The overcorrection is building every `Design:` task in the session, where a frozen direction only fills the context.

## Routes

The plan's `## Visual direction` picks the route:

- **It names the chosen direction.** This session loads `design-ui` itself: write the plan's `Contract:` to `$RUN/contract-selected.json` and the task's `Files:` lines to `$RUN/files.md` as `<path>:<first>-<last>`, then enter `design-ui` at Route rung 2. Once `design-ui` reports, run the task's `Run:` and commit as step 5 does for an in-session build.
- **It reads `Direction: pending at rung <n>`.** The task builds in this session under `design-ui`, from its Direction phase.
- **It records no direction.** The task builds in this session under `design-ui`, from its `## Route`.

## Judgment

- The recorded direction outranks the delegate's own reading of the task, because the direction was settled with the user.
- A direction that is neither named nor pending routes as no recorded direction does, because only a frozen direction leaves the session.
