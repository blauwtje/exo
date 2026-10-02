# Issue and pull-request fields

## Read the repository

```
node "${CLAUDE_SKILL_DIR}/scripts/repo-fields.mjs"
```

- Name every `unread` entry in the report: it marks a field the read skipped, not one the repository lacks.
- When the user names a label or field the JSON lacks, rerun with `--refresh` to rule out a day-old cache; one still missing is reported, not created.

## Pick the vocabulary

1. **`vocabulary: own`.** Use the repository's own names and options only; a field it lacks stays off and is named in the report, never approximated and never created.
2. **`vocabulary: default`.** Create each missing label with `gh label create "<name>" --color <hex> --force`: `type: feature`, `type: bug` or `type: chore` in `1d76db`; `size: XS` to `size: XL` in `c5def5`; `priority: P0`, `priority: P1` or `priority: P2` in `fbca04`.

No project, field or milestone is ever created, and an estimate has no label form, so it stays unset.

## Derive the three values

Read each value off what the item itself says, so two sessions reading one body set the same one, with
`node "${CLAUDE_SKILL_DIR}/scripts/repo-fields.mjs" --size --paths <n> --criteria <n> --shape spec|report [--shipped] [--blocking] [--options "<highest>,...,<lowest>"]`,
which prints `{"size","estimate","priority"}`.

- **Size and Estimate.** Pass the body's path and acceptance-criteria counts; the script sizes on max(paths, criteria) and reads the estimate off that size. A repository whose own items already map Size to Estimate differently overrides the script's ladder with its own.
- **Priority.** Pass `--shape report --shipped` when the symptom appears in a released version or on the default branch, `--shape report` for any other Report, `--shape spec --blocking` when another issue is blocked on the Spec, and `--shape spec` otherwise. Pass the project field's own options as `--options "<highest>,...,<lowest>"` when it has more than the default `P0`/`P1`/`P2`; the script takes the first as highest, the last as lowest, and the one between them as the middle.

A milestone is set only when the repository has an open one whose title the outcome falls under. A status column is left alone: the board's own workflows own it.

## The body

No body, Spec or Report, carries a background or motivation section beyond `### Problem`, a quote of the request, or a copy of the labels, type, parent, blocked-by or milestone, which go stale on the first edit.

Every section is an H3, because a repository's issue form renders each of its fields as one, and an item this standard writes then reads as an item a person filed. An issue template's headings order a Spec or a Report body.

- `### Outcome`: one sentence naming the result, in the present tense; a brief's Goal.
- `### Problem` (optional): what goes wrong for the user today, seen from their side, in one or two sentences.
- `### Done when`: checkable criteria as a task list, each a state a reader verifies without reading the diff; a brief's Acceptance.
- `### Proof` (optional): the highest seam that runs the criteria and which of them it runs; a brief's Acceptance also names this seam.
- `### Out of scope` (optional): what a reader would otherwise assume is included.
- `### References`: the paths and symbols the criteria rest on, one per line.
- `### Decided`: for a brief, one line per decision it closed, as `<decision>: <answer> (<you, code: path, or exo>)`, because later wishes reopen only the lines they touch; a brief's Decisions. A Spec no brief produced keeps it optional, only for a constraint the user settled that the criteria do not already carry.

## Relations

- A parent the brief or request names: `--parent <n>`.
- A blocker: `--blocked-by <n>`.
- A related issue that is neither: one `Related: #<n>` line under `### References`.

## Create and set

```
gh issue create --title <title> --body-file <f> --label <l> --type <type> \
  --parent <n> --blocked-by <n> --milestone <m> --project <title>
```

- Set each project field after creation with `gh project item-edit --id <item> --project-id <proj> --field-id <field>`, adding `--single-select-option-id <opt>` for a single select or `--number <n>` for a number field, with ids from the script's JSON.
- Read `<item>` with `gh project item-list <nr> --owner <o> --format json --jq '.items[]|select(.content.number==<n>)|.id'`, where `<n>` is the issue's or pull request's number.

## The pull request

- Carry one `Closes #<n>` line per issue it closes, on the repository's pull-request template's own line when it has one, else ending the body.
- Follow the repository's pull-request template when it has one.
- Copy labels, milestone and project field values from the closed issue, so the two never disagree; with no issue, derive them from what the pull request changes, with the same `repo-fields.mjs` default and `--size` calls.

```
gh pr create --base <default> --title <conventional subject> --body-file <f> \
  --label <l> --milestone <m> --project <title>
```

Read it back with `gh pr view <n> --json number,title,labels,milestone,url`.

## Judgment

- A failed `gh` command is reported with its output and never retried unchanged.
