# Reopening a stored brief

This page keeps one outcome to one brief. New wishes edit it where it stands. The enemy is a second brief for the same outcome that disagrees with the first by the next edit. The overcorrection is folding a different outcome into an old brief because its title shares a word.

## Steps

1. **Find it** in the first of these sources that names one:
   - A `#<n>`, URL or path in the request.
   - The branch's handoff.
   - An open issue whose body opens `<!-- exo:spec -->`. List those issues with `gh issue list --state open --limit 200 --json number,title,body --jq '.[] | select(.body | startswith("<!-- exo:spec -->")) | "\(.number)\t\(.title)"'`.
   - A `docs/specs/` or `docs/plans/` file that stays local and uncommitted, titled for that outcome.
2. **One match is the brief.**
   - With one match, name it in one line above the first question.
   - With two or more, ask one question that names them, a new brief last.
   - With none, write a new brief.
3. **Load its decisions as closed.**
   - Give each decision its source.
   - Only a decision the new wishes contradict or leave unanswered goes on the map.
4. **Edit in place.**
   - Edit a file where it stands.
   - Rewrite an issue whose body opens `<!-- exo:spec -->` with `gh issue edit <n> --body-file <file>`, keeping that first line and its sections. The issue's edit history keeps the earlier body.
   - Any other issue was written by a person, so leave its body alone and name it under the new brief's references.
5. **The tasks follow the brief.**
   - Edit its task list with its decisions.
   - Then finish as spec's `## Steps` says for a new brief.

## Judgment

- The stored brief outranks a new one while both name the same outcome.
- For an area the request changes, read `docs/behaviour/<area>.md` when it exists, in place of the shipped briefs it lists; `node "${CLAUDE_SKILL_DIR}/scripts/behaviour.mjs"` rebuilds it from them.
