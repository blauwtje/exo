# The brief

A brief is one file, `docs/specs/<topic>.md`, with these sections in this order:

- **Goal:** what the change is for, in one or two sentences.
- **Verdict:** `go`, `clarify` or `stop`, and the likeliest way it fails.
- **Decisions:** each decision the user made, with the option they picked.
- **Non-goals:** what this change will not do.
- **Facts:** each fact the plan rests on, with its `path:line` or URL.
- **Acceptance:** what the user will see when it works.
- **Manual checks:** what only a person can check, such as a screen or a sound.
- **Plan basis:** `Repository:`, `Branch:` and `Commit check:`, the command that must pass before each task's commit.
- **Success criterion:** one command that proves the whole change.
- **Tasks:** in build order.
- **Open points** and **Log**, only when there are any.

## A task

Each task is a heading with its commit subject and one line of fields:

```markdown
### Task 2: write the CSV header once
Depends on: 1 | Files: `src/export.rs` | Data: rows from `list_orders()` | Proof: cargo test one_header
```

- **Depends on:** task numbers that must land first, or `none`.
- **Files:** every path the task writes.
- **Data:** what the task reads or changes.
- **Proof:** one command that fails before the task and passes after it.
- **Model: <model> <effort>**, optional: the builder's model and effort for a task that needs more than the default, such as `opus high`.
- **Red: none (<reason>)**, optional: only for a task whose proof cannot fail first, such as deleting a file nothing reads.
