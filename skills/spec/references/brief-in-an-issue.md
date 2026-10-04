# A brief stored as an issue

The `specs` setting authorizes the issue, so the brief goes to GitHub with no draft shown first. The enemy is an issue that invents a label, type or milestone the repository never defined. The overcorrection is falling back to a file while the repository and `gh` both work.

## Writing it

- Create no label, type or milestone the repository does not already define.
- Set every field the repository does define.
- `issues` creates one GitHub issue whose body opens with the line `<!-- exo:spec -->`.
- The body after that line is the brief in the Spec shape of the file-issues skill's fields file, with its sections, fields and relations as that file says and none of them decided here.
- `issues` writes no file in the repository, only the scratch copy `build` runs, at the `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" specs/<n>.md` path, so the issue stays the source.
- `both` writes the file, then that issue with the file's path under its references.
- `issues` and `both` write the file alone when `git remote get-url origin` names no GitHub repository or `gh auth status` fails, and the message says so in one line.

## Judgment

- The file outranks the issue when the two differ, because under `both` the issue carries the file's path.
- A field the repository does not define stays unset, and the message names it.
