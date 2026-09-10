# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout; this file only names what a session here gets wrong without it.

- Every skill or agent edit loads the `skills-tool` skill first and stays inside its budgets; `node verify.mjs` is the gate before any commit.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or agent body means that namespaced skill.
- `verify/budgets.mjs` names the skills the verifier checks; a skill not listed there is not verified, so add it there when it reaches the shape `skills-tool` describes.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
