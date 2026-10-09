# Overrides

A file here replaces one generated Codex file. Its path under this folder is the
file's path in the generated tree, such as `skills/<name>/SKILL.md`. The tree is
built in memory at install; `npm run generate` writes it to the gitignored
`harnesses/codex/generated/` for inspection.

The first line must be `<!-- exo:override source-sha256=<hash> -->`, where `<hash>` is
the sha256 of the file's Claude source (`skills/<name>/SKILL.md`, or `agents/<agent>.md`
for an agent file). The line is dropped from the generated file. When the source
changes, the hash no longer matches and `npm run check` fails until the override is
reviewed and its hash updated.

exo ships no override. Add one only after a skill reads wrong in a real Codex run.
