# Issue fields

Fill every field an issue can carry in the vocabulary the repository already uses, and fall back to one default set only when it has none. The enemy is an issue that invents a second labeling scheme beside the board the team already runs. The overcorrection is an issue with no size, effort or relations because the repository defined none.

## Read the repository

```
gh label list --limit 100 --json name --jq '[.[].name]'
gh api graphql -f query='{repository(owner:"<o>",name:"<r>"){issueTypes(first:20){nodes{name}}}}' --jq '[.data.repository.issueTypes.nodes[].name]'
gh api repos/{owner}/{repo}/milestones --jq '[.[]|{number,title}]'
gh project list --owner <o> --format json --jq '[.projects[]|{number,title}]'
gh project field-list <nr> --owner <o> --format json --jq '[.fields[]|select(.options)|{id,name,options:[.options[]|{id,name}]}]'
ls .github/ISSUE_TEMPLATE
```

## Pick the vocabulary

1. **The repository has its own.** A label outside GitHub's defaults (`bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`), an issue type, or a project with single-select fields means the repository has a vocabulary. Use those names and options only; a field it lacks stays off and is named in the report, never approximated and never created. An issue template's headings order the body.
2. **It has none.** Use the default set, creating each missing label with `gh label create "<name>" --color <hex>`: `type: feature`, `type: bug` or `type: chore` in `1d76db`; `size: XS` to `size: XL` in `c5def5`; `effort: low`, `effort: medium` or `effort: high` in `fbca04`. No project, field or milestone is created.

Size follows the paths and acceptance checks the issue names: `XS` one path, `S` two or three, `M` four to six, `L` seven to twelve, `XL` more. Effort follows the decisions still open when the build starts: `low` none, `medium` one or two, `high` more.

## Relations

- A parent the brief or request names: `--parent <n>`. A blocker: `--blocked-by <n>`. A related issue that is neither: one `Related: #<n>` line under the body's references.
- Several issues from one request are created parent first, then each blocker before what it blocks.

## Create and set

```
gh issue create --title <title> --body-file <f> --label <l> --type <type> \
  --parent <n> --blocked-by <n> --milestone <m> --project <title>
```

Pass only the flags whose values the reading above confirmed or the default set supplies. Project fields are set after creation, per field: read the item id with `gh project item-list <nr> --owner <o> --format json --jq '.items[]|select(.content.number==<n>)|.id'`, then `gh project item-edit --id <item> --project-id <proj> --field-id <field> --single-select-option-id <opt>`. Read each created issue back with `gh issue view <n> --json number,title,labels,milestone,url`.

## Judgment

- One repository label, type or project field outranks the whole default set, so nothing from that set is created beside it.
- A label or field the user names explicitly outranks both, and one that does not exist is reported, not created.
- A failed `gh` command is reported with its output and never retried unchanged.
