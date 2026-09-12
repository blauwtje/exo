# exo

Source of the Claude Code plugin `exo`. `README.md` explains the layout; this file only names what a session here gets wrong without it.

- Every skill or delegate-prompt edit loads the `skills-tool` skill first; `npm run check` is the gate before any commit.
- `npm test` prints Node's spec reporter, which marks a failure `✖`, not `not ok`: a grep of its log for `not ok` finds nothing while tests fail.
- `npm run check` runs the tests once, inside the verifier's `skill script behavior` check, which uses the TAP reporter: its FAIL line names each failing test as a `not ok` line.
- A session that changes this plugin releases it before its final reply, without asking, because the
  user wants every change in the installed copy: once `npm run check` passes, `npm run bump`, commit on
  `main` in Conventional Commits, push, then `claude plugin marketplace update blauwtje`,
  `claude plugin uninstall exo@blauwtje` and `claude plugin install exo@blauwtje -y`, and tell the user
  to restart Claude Code. The exception is a failing check or a change still waiting on the user's
  answer: that is reported, not released.
- Any change to the tree runs `npm run bump` before the push: the marketplace installs the whole
  repository, so the `plugin version` check fails while the version matches `origin/main`. It compares
  only the manifest version, so an unbumped release installs as a no-op.
- Skills are namespaced `exo:<name>` when invoked; a bare name inside a skill or prompt body means that namespaced skill.
- `verify/budgets.mjs` names the skills the verifier checks; a skill not listed there is not verified, so add it there when it reaches the shape `skills-tool` describes.
- The session hook pins `"shell": "bash"` in `hooks.json`: without it, a Windows host without Git Bash
  falls back to PowerShell, which cannot run the script. Shell form, not `args`, because Claude Code
  then resolves the shell itself instead of looking up `bash` on `PATH`.
- The session hook stays `bash` with `jq`; a CRLF shebang fails silently on Windows, so `.gitattributes` forces LF.
