# About exo

exo is a set of Claude Code skills that hand work to each other, plus helpers that do searches in their own context. This page lists the words exo uses for its parts, so you and a session mean the same thing.

## Words

exo writes the word in the first column. It understands the second but does not use it, because two names for one thing read as two things.

| exo says | Not | Meaning |
|---|---|---|
| helper, delegate | subagent | A separate agent exo hands part of the work to. |
| skill | command, prompt | One file you call as `/exo:<name>`, or that Claude starts when its trigger fits. |
| trigger | activation, routing rule | A skill's `description`, which tells Claude when to start it. Renaming one is a breaking change. |
| stage | phase | spec, build, verify or find-cause. `design-ui` uses phase for its own steps. |
| brief | spec document, requirements | What `spec` writes: a file, an issue, or both. |
| plan, task, step | ticket, story, epic | A plan holds tasks, a task holds steps. One task lands in one commit. |
| artifact | deliverable, output | The file a stage leaves behind for the next stage to open. |
| direction | theme, style, look | The one visual direction `design-ui` picks and builds against. |
| observable boundary | test surface, hook point | The point a test-first `build` reads its results from, agreed before the first test. |
| decision map | question list, backlog | Every open decision in `spec`, with what it waits on and who closed it. |
