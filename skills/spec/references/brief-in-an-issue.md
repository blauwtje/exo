# A brief stored as an issue

This page puts the brief in a GitHub issue. The `specs` setting authorizes the issue, so the brief goes to GitHub with no draft shown first. The enemy is an issue inventing a label, type or milestone the repository never defined. The overcorrection is falling back to a file while the repository and `gh` both work.

## Writing it

- Create no label, type or milestone the repository does not already define; set every field it does define.
- With `issues`, create one GitHub issue whose body opens with the line `<!-- exo:spec -->`.
- After that line, write the brief in the Spec shape of `ship`'s fields file, with the sections, fields and relations that file names; this page decides none of them.
- `issues` writes no file in the repository, only the scratch copy `build` runs, at the `node "${CLAUDE_SKILL_DIR}/../../lib/scratch-path.mjs" specs/<n>.md` path, so the issue stays the source.
- With `both`, write the file, then that issue with the file's path under its references.
- When `git remote get-url origin` names no GitHub repository, or `gh auth status` fails, `issues` and `both` write the file alone, and the message says so in one line.

## Judgment

- The file outranks the issue when the two differ, and under `both` the issue carries the file's path.
- A field the repository does not define stays unset, and the message names it.
