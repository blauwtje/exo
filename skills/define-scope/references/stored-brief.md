# Reopening a stored brief

One outcome keeps one brief, and new wishes edit it where it stands. The enemy is a second brief for the same outcome that disagrees with the first by the next edit. The overcorrection is folding a different outcome into an old brief because its title shares a word.

## Steps

1. **Find it** in the first source that names one: a `#<n>`, URL or path in the request; the branch's handoff; an open issue whose body opens `<!-- exo:spec -->`; a file under `docs/specs/` or `docs/plans/` whose title names the same outcome. `gh issue list --state open --limit 200 --json number,title,body --jq '.[] | select(.body | startswith("<!-- exo:spec -->")) | "\(.number)\t\(.title)"'` lists those issues.
2. **One match is the brief**, named in one line above the first question. Two or more is one question naming them, a new brief last. None is a new brief.
3. **Load its decisions as closed**, each with its source. Only a decision the new wishes contradict or leave unanswered goes on the map.
4. **Edit in place.** A file is edited where it stands. An issue whose body opens `<!-- exo:spec -->` is rewritten with `gh issue edit <n> --body-file <file>`, keeping that first line and its sections, because the issue's edit history keeps the earlier body. Any other issue was written by a person: leave its body alone and name it under the new brief's references.
5. **The tasks follow the brief.** The brief's task list is edited with its decisions, and the next-stage question offers `/exo:run-plan` on the brief.

## Judgment

- A stored brief outranks a new one while both name the same outcome; two candidates are one question to the user, never exo's pick.
- A body a person wrote stays theirs: only an issue whose body opens `<!-- exo:spec -->` is rewritten.
