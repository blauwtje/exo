# A brief stored as an issue

The `specs` setting authorizes the issue, so the brief goes to GitHub with no draft shown first. The enemy is an issue that invents a label, type or milestone the repository never defined. The overcorrection is falling back to a file while the repository and `gh` both work.

## Writing it

- `issues` creates one GitHub issue whose body opens with the line `<!-- exo:spec -->` followed by the brief in the Spec shape of the file-issues skill's fields file, with its sections, fields and relations as that file says and none of them decided here.
- `issues` writes no file in the repository, only the scratch copy `run-plan` runs, so the issue stays the source.
- The setting is the authorization, so no draft is shown first, and for that same reason this path creates no label, type or milestone the repository does not already define, sets every field it does define, and names in its message each field left unset.
- `both` writes the file, then that issue with the file's path under its references, and the file is the source when the two differ.
- `issues` and `both` write the file alone when `git remote get-url origin` names no GitHub repository or `gh auth status` fails, and the message says so in one line.

## Judgment

- The file outranks the issue when the two differ, because under `both` the issue carries the file's path.
- A field the repository does not define stays unset and named in the message, never created.
