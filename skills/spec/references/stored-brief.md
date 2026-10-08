# Reopening a stored brief

One outcome keeps one brief; new wishes edit it where it stands. The enemy is a second brief for the same outcome that disagrees with the first by the next edit. The overcorrection is folding a different outcome into an old brief because its title shares a word.

## Steps

1. **Find it** in the first source naming one: a `#<n>`, URL or path in the request; the branch's handoff; an open issue whose body opens `<!-- exo:spec -->`; a file under `docs/specs/` or `docs/plans/` whose title names the same outcome. List those issues with `gh issue list --state open --limit 200 --json number,title,body --jq '.[] | select(.body | startswith("<!-- exo:spec -->")) | "\(.number)\t\(.title)"'`.
2. **One match is the brief.**
   - One match → name it in one line above the first question.
   - Two or more → one question naming them, a new brief last.
   - None → new brief.
3. **Load its decisions as closed.**
   - Give each decision its source.
   - Only a decision the new wishes contradict or leave unanswered goes on the map.
4. **Edit in place.**
   - File → edit where it stands.
   - Issue whose body opens `<!-- exo:spec -->` → rewrite with `gh issue edit <n> --body-file <file>`, keeping that first line and its sections; the issue's edit history keeps the earlier body.
   - Any other issue was written by a person → leave its body alone, name it under the new brief's references.
5. **The tasks follow the brief.**
   - Edit its task list with its decisions.
   - Then finish as spec's `## Steps` says for a new brief.

## Judgment

- Stored brief outranks a new one while both name the same outcome.
