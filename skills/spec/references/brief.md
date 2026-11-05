# The brief

The brief is the decided outcome, written in fixed sections so a later session can resume from it. Its sections hold decisions, not their reasoning.

## Sections

In this order:

- **Goal:** the observable result, in one sentence.
- **Decisions:** every bin-1 decision with its answer. The user, the code (with its settling path) or exo closes it, exo for a second "I don't know" or small work, and a choice exo made ends in `(exo decided)`.
- **Non-goals:** what a reader would assume is included, one bullet each naming its paths. Omit the section when there are none.
- **Open points:** only an unanswered question for the user, one list item each. Plan-check flags a listed entry, and build refuses the brief.
- **Assumptions:** each `code` or `assume` point.
- **Acceptance:** the observable checks and the highest seam that runs them, the one closest to what the user does. Each item cites a task number, a `Data:` segment or the Success criterion, or else it is a Manual check.
- **Manual checks:** only checks that need the user's own eyes, hands or account, one line each, written per `## Manual checks` below. The run report holds them, not the final message.
- **Visual direction:** for a new visual surface only. It says whether the existing identity stays or may be replaced, the ambition, and who chooses between rendered directions.
  - When the frontend-design skill returns, add the path of its `contract-selected.json` with the contract's `title` and `description`.
- **Plan basis**, **Success criterion**, **Checkpoint**, **Tasks**, each as the task-list specification defines it.
- Tasks stays last, and a `## ` heading after a task ends that task.

Store the brief where `specs` in the session's `exo settings:` line says, `docs` when that line is absent, and name its location in the same message.

- With `docs`, the brief goes to `docs/specs/<topic>.md`, which stays gitignored and is not added with `git add`. In plan mode it goes to the harness plan file.

## Manual checks

Each line is what to do, then what the user should see, in plain words a child follows and in the user's language.

## The task list

- Make the split and every design choice before writing the list.
- A choice the user would notice goes in Decisions, and a point the user would not notice goes in `Data:`.
- A security-boundary task names its reference in its heading or `Data:`.
- In plan mode, a proof that needs an edit is Task 1.
- A task that touches sandbox, deny rules, breach detection, the task pin or land-task, or code that deletes files or branches, carries `Risk: security boundary`.
- When a visual choice is still open, its task carries `Design: design-ui`, and `build` routes it by the brief's Visual direction.

## Judgment

- When `## Visual direction` (the exact name, because design-ui reads it) names a direction, design-ui builds against it and picks none.

## Open points step

Dispatch the `exo:find-open-points` agent once on the brief.

- Skip the agent for a plan of at most 3 tasks whose Proofs are all static.
- When the agent returns an `Assumptions: <path>` line, insert its `- ` bullets after the brief's `## Assumptions` line, unread, with the command below. With no such line, insert nothing.

```
node -e 'const f=require("fs"),[b,a]=process.argv.slice(1),s=f.readFileSync(b,"utf8"),h=/^## Assumptions\n/m;if(!h.test(s))throw b;f.writeFileSync(b,s.replace(h,m=>m+"\n"+f.readFileSync(a,"utf8").match(/^- .*/gm).join("\n")+"\n"))' <brief> <path>
```

- A `Cannot follow:` line means that part needs rewriting.
- For a `Reuse:` or `Scope:` line, edit Tasks or Non-goals to drop it.
- When `path:line` evidence answers a `user` point, add `- [code] <point> → <answer> (<path:line>)` under `## Assumptions`.
- Ask any other `user` point, one per message.
- Put each answer on the next numbered line under `## Decisions`, and store it with `node "${CLAUDE_SKILL_DIR}/../remember/scripts/memory.mjs" write --decision --claim "<the decision>" --refs "<path,path>"`.
- Put an unanswered `user` point under `## Open points` (the exact name), and omit that section when no point is left.
