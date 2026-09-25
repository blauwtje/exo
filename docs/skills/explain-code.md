# explain-code

Explains this repository from code and history read in the session, and says how sure each claim is.

## When it fires

Someone asks how part of the repository works, why code is built the way it is, whether a stated reason holds, or wants to be taught a part of it. It runs in three modes: `how` for the mechanism, `why` for the reason, and `teach` for both at the asker's level. It changes no file. A list of locations belongs to the locate-code agent, an external library to check-docs, a failure with an unproven cause to find-cause, and a question about where the architecture should change to audit-architecture.

## What you get

- A direct answer first, then the evidence in the shape of its mode.
- For `how`: the chain from entry to effect in prose, with a file and line at each step and the config or environment overrides that change what the defaults suggest.
- For `why`: the commit, pull request or issue that set the value, found by tracing back past later moves and comment edits. The code itself is never cited as evidence of its intent.
- Every claim marked verified, inferred or unknown, with the searches listed for what stays unknown. A request for plain words changes the wording, not the tier.
- MCP sources such as an issue tracker or chat, searched when the session has them and never required.

## Where its rules live

`skills/explain-code/SKILL.md`.
