# A brief stored as an issue

The `specs` setting authorizes the issue, so the brief goes to GitHub with no draft shown first. The enemy is an issue inventing a label, type or milestone the repository never defined. The overcorrection is falling back to a file while the repository and `gh` both work.

## Writing it

- Create no label, type or milestone the repository does not already define; set every field it does define.
- `issues` → one GitHub issue whose body opens with the line `<!-- $spec -->`.
- Body after that line → the brief in the Spec shape of the file-issues skill's fields file, with sections, fields and relations as that file says, none decided here.
- `issues` writes no file in the repository, only the scratch copy `build` runs, at the `node "{{EXO_ROOT}}/harnesses/codex/run.mjs" "{{EXO_ROOT}}/lib/scratch-path.mjs" specs/<n>.md` path, so the issue stays the source.
- `both` → write the file, then that issue with the file's path under its references.
- `git remote get-url origin` names no GitHub repository, or `gh auth status` fails → `issues` and `both` write the file alone; the message says so in one line.

## Judgment

- File outranks issue when the two differ; under `both` the issue carries the file's path.
- Field the repository does not define → stays unset; the message names it.
