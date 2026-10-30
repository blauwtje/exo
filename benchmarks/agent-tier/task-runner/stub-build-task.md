---
name: build-task
description: "Dispatched by build only."
tools: Bash
maxTurns: 6
---

Run exactly one command and return its output as your whole reply.

1. Read `Task <n> of <plan>, branch <b>, checkout <c>.` in your prompt; take `<n>` and `<c>`.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/stub-build-task/stub.mjs <c> <n>`.
3. Reply with its single output line, unchanged.

No text before the call, no other command, no file read, no retry.
