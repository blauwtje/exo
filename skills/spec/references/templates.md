# Plan templates and the done-list

A template is a landed plan with its changing words turned into parameters, so recurring work starts from a shape that already passed the plan check. The enemy is a plan written fresh each time that drops a step the last one needed. The overcorrection is a template offered for work it only resembles.

Both live in the repository under version control, beside the plans `build` already searches, so a fresh session and every teammate read the same files:

- `docs/plans/templates/<name>.md`: one template per file.
- The file named definition-of-done in `docs/plans/`, the repo done-list. Each bullet of the form `` - `<command>` `` is a command every plan must pass; other lines are for readers and feed nothing.

`remember` keeps corrections attested twice and `find-cause` keeps run commands, so neither holds a plan shape or a done-list.

## Script

`node "${CLAUDE_SKILL_DIR}/scripts/plan-template.mjs" <command> --root <checkout root>`:

- `list` prints each template as `name`, summary and parameters.
- `render --template <name> --param <name>=<value>... --out <file>` fills the parameters and appends the done-list. `{{root}}` is the root; every other parameter is required and refused when missing or unknown.
- `save --plan <file> --name <name> --summary <text> --param <literal>=<name>...` writes a template. The plan's repository path becomes `{{root}}` and its branch `{{branch}}`; each `--param` turns a literal such as `orders` into `{{resource}}`.
- `done --plan <file>` appends the done-list to a plan spec wrote fresh.

## Done-list

The Success criterion runs its first backticked command, so each done-list command is chained onto it with ` && ` and the command appears once. A command the criterion already holds is skipped, so running `done` twice, or on a rendered template that holds one, changes nothing. An `mcp:` criterion cannot chain; move that command to a task `Proof:`.

## Matching

1. Run `list`. Offer a template only when its summary names the same kind of change as the request and the request fills every parameter.
2. On yes, render it and edit the rendered plan for the differences the request names. Then run the plan check on it.
3. On no, write the plan fresh and still run `done`.

## Saving

After a run lands every task, offer to save its plan once, with a name, a summary and the literals to parameterise, and save nothing before a yes. Commit the template with the work it came from, because it holds no secret, absolute path or branch.
