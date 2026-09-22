# Issue and pull-request fields

Fill every field an issue or a pull request can carry in the vocabulary the repository already uses, and write its body in one of two shapes. The enemy is the item that invents a second labeling scheme beside the board the team already runs. The overcorrection is an item left with no priority, size or estimate because reading the repository looked like work.

## Read the repository

```
gh label list --limit 100 --json name --jq '[.[].name]'
gh api graphql -f query='{repository(owner:"<o>",name:"<r>"){issueTypes(first:20){nodes{name}}}}' --jq '[.data.repository.issueTypes.nodes[].name]'
gh api repos/{owner}/{repo}/milestones --jq '[.[]|{number,title}]'
gh project list --owner <o> --format json --jq '[.projects[]|{number,title}]'
gh project field-list <nr> --owner <o> --format json --jq '[.fields[]|{id,name,options:[.options[]?|{id,name}]}]'
ls .github/ISSUE_TEMPLATE
```

One reading serves both: a pull request draws its labels, its milestone and its project item from the same vocabulary as an issue.

## Pick the vocabulary

1. **The repository has its own.** A label outside GitHub's defaults (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`), an issue type, or a project with its own fields means the repository has a vocabulary. Use those names and options only; a field it lacks stays off and is named in the report, never approximated and never created. An issue template's headings order the body.
2. **It has none.** Use the default set, creating each missing label with `gh label create "<name>" --color <hex>`: `type: feature`, `type: bug` or `type: chore` in `1d76db`; `size: XS` to `size: XL` in `c5def5`; `priority: P0`, `priority: P1` or `priority: P2` in `fbca04`. No project, field or milestone is created, and an estimate has no label form, so it stays unset.

## Derive the three values

Read each value off what the item itself says, so two sessions reading one body set the same one.

- **Size** follows the paths and acceptance criteria the body names: `XS` one path, `S` two or three, `M` four to six, `L` seven to twelve, `XL` more.
- **Estimate** reads off Size: `XS` 1, `S` 2, `M` 3, `L` 8, `XL` 13. A repository whose own items already map Size to Estimate differently overrides that ladder with its own.
- **Priority** follows the body shape and how far the symptom reaches. A Report whose symptom appears in a released version or on the default branch takes the field's highest option; any other Report the middle one; a Spec the lowest, or the middle one when another issue is blocked on it. In a field of more than three options the ends are the highest and the lowest, and everything between them is the middle.

A milestone is set only when the repository has an open one whose title the outcome falls under, and is created in no case. A status column is left alone: the board's own workflows own it. A field the repository does not define stays unset and is named in the report.

## The two bodies

Every section is an H3, because a repository's issue form renders each of its fields as one, and an item this standard writes then reads as an item a person filed. A Spec's `### Problem` names what goes wrong for the user today; neither shape carries any other background or motivation section, a quote of the request, or a second copy of what the metadata already shows beside the body: labels, type, parent, blocked-by and milestone go stale in a body on the first edit.

**Spec**, for a brief `shaping` produced and for any feature work:

- `### Outcome`: one sentence naming the result, in the present tense; a brief's Goal.
- `### Problem`: what goes wrong for the user today, seen from their side, in one or two sentences; a brief's Problem.
- `### Done when`: checkable criteria as a task list, each a state a reader verifies without reading the diff; a brief's Acceptance.
- `### Proof`: the highest seam that runs the criteria and which of them it runs; a brief's Proof.
- `### Out of scope`: what a reader would otherwise assume is included; a brief's Out of scope.
- `### References`: the paths and symbols the criteria rest on, one per line.
- `### Decided`: for a brief, one line per decision it closed, as `<decision>: <answer> (<you, code: path, or exo>)`, because later wishes reopen only the lines they touch; a brief's Decisions.
- A Spec no brief produced keeps `### Decided` optional, only for a constraint the user settled that the criteria do not already carry, and `### Problem` and `### Proof` optional too.

**Report**, for what needs no shaping: a bug, a regression, a chore or a documentation fix.

- `### What happens`: one sentence naming the current behavior, in the present tense.
- `### Expected`: what should happen instead.
- `### Steps`: the prompts or commands that produce it, in order.
- `### Environment`: the versions and the platform the repository's own bug template asks for, one per line; where it has no template, the tool versions and the operating system.
- `### Evidence`: the output, transcript or log lines that show it, the relevant ones only and with secrets removed.

## Relations

- A parent the brief or request names: `--parent <n>`. A blocker: `--blocked-by <n>`. A related issue that is neither: one `Related: #<n>` line under `### References`.
- Several issues from one request are created parent first, then each blocker before what it blocks.
- The pull request carrying an issue's work carries one `Closes #<n>` line per issue it closes, where the repository's pull-request template puts that line and at the end of the body when it has no template.

## Create and set

```
gh issue create --title <title> --body-file <f> --label <l> --type <type> \
  --parent <n> --blocked-by <n> --milestone <m> --project <title>
```

Pass only the flags whose values the reading above confirmed or the default set supplies. Project fields are set after creation, one command per field: read the item id with `gh project item-list <nr> --owner <o> --format json --jq '.items[]|select(.content.number==<n>)|.id'`, then `gh project item-edit --id <item> --project-id <proj> --field-id <field>` with `--single-select-option-id <opt>` for a single select and `--number <n>` for a number field. Read each created issue back with `gh issue view <n> --json number,title,labels,milestone,url`.

## The pull request

Its body follows the repository's own pull-request template when it has one, filling that template's own `Closes #<n>` line rather than adding a second one; without a template the body ends on that line. Its labels, milestone and project field values are the closed issue's, copied rather than derived a second time, so the two never disagree; with no issue behind it they are derived here from what the pull request changes.

```
gh pr create --base <default> --title <conventional subject> --body-file <f> \
  --label <l> --milestone <m> --project <title>
```

Its project fields are then set by the same `gh project item-edit` commands, against the item id `gh project item-list` returns for the pull request's own number. Read it back with `gh pr view <n> --json number,title,labels,milestone,url`.

## Judgment

- One repository label, type or project field outranks the whole default set, so nothing from that set is created beside it.
- A label or field the user names explicitly outranks both, and one that does not exist is reported, not created.
- A value copied from the issue a pull request closes outranks one derived from its diff.
- A failed `gh` command is reported with its output and never retried unchanged.
