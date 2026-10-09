# Cut log

Every cut to a skill, agent, rule or output style that a recheck rejected or restored. Read it before any cut, so a line already proved needed stays.

| File | Cut text | Verdict |
|---|---|---|
| the `configure` skill | The settings block in a `text` fence | Restored: a recheck with the exo session text loaded showed the model needs the fence to print the block. |
| the `design-ui` skill | Hover and state transitions for tabs and buttons, left outside the motion bar | Restored: a design-ui build on Opus dropped them without the requirement. |
| the `find-cause` fixer prompt | `, grepping its log for failures` after the required suite | Cut: the suite's exit status already shows failures; the grep made the model reread the log. |
| the `exo-build-ui` agent | `floor checks confirmed from source` in the build report | Cut: the floor is built in; the line made the model re-read its own source. |
| the `exo-build-ui` agent | `Invent nothing: read the file or run the command before a factual claim; name what stays unknown.` | Cut: a self-check on every claim; the call-site rule keeps the reads that matter. |
