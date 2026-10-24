exo-kind: improve-round

# Improve round

Propose one idea that raises the score of an unattended improve run, make it as one commit, and return one line. A script scores your commit afterwards and keeps it only when the score got better; your work ends at the commit.

## Inputs

- Repo root: `<root>`; run state: `<root>/.exo/improve/`.
- Tag: `<tag>`.
- Worktree to edit and commit in: `<worktree>`.
- Idea file to write: `<idea>`.
- Skill directory: `<skill>`.
- Note from the lead: `<note>` (empty on most rounds).

## Read first

- `<tag>.json` → goal, scope globs, read-only paths, score command, direction, sd, fast check.
- `<tag>.tsv` → every earlier round: commit, score, status, description.
- `<tag>.ideas.jsonl` → every earlier idea: key, parts, delta, flat and crash flags.
- `run.log` → the last score run; its `<id> ratio=<n>` lines show which cases hold the most headroom.
- Then the in-scope files the goal's outcome depends on.
- `<note>` = `out-of-ideas` → reread every in-scope file, combine near-misses from earlier rows, and aim at a larger change than any earlier key.

## Steps

1. `git -C <worktree> reset --hard <base>`, `<base>` = the commit of the last `keep` row in the tsv; the worktree holds no other work.
2. Draft a slate of ideas across at least 3 areas; an area is one part the score depends on, such as a prompt section, a module or a config file.
3. Pick the idea with the largest expected gain that has evidence.
4. Write it to `<idea>` in the shape below.
5. Run `node <skill>/scripts/gate.mjs --root <root> --tag <tag> --idea <idea>`.
6. `REJECT <reason>` → next idea on the slate, rewrite the file, gate again; slate used up → draft one new slate; still no `PASS` → return `NO-IDEA <last reason>`.
7. `PASS` → edit only files the scope globs match, in `<worktree>`.
8. Fast check set → run it once in `<worktree>`, output to a file, not the chat; it fails → fix the error it names, no rerun.
9. Commit once in `<worktree>`: subject = the change in plain words under 72 characters, since it becomes the row's description.
10. Commit body → `Proof: <fast check> → <result>`, or `Proof: no fast check set`; then one `Improve-key: <area>/<lever>/<target>` trailer per part.
11. Return the line.

## Idea rules

- Size → aim at a gain well past 2·sd, from the cases with the most headroom or the biggest lever in scope; the score cannot tell a smaller change from noise.
- Bundle → at most 3 parts, all in one area, when each part alone is too small to show.
- New → its key differs from every earlier key in `<tag>.ideas.jsonl`.
- Same lever on the same target → same idea under any name; give it the earlier key's exact words, so the gate rejects it.
- Crashed key → may be retried, with the crash's cause fixed.
- Last 3 rows within 2·sd of each other → pick from the largest area no earlier key touched.
- Evidence → each idea cites a `file:line` or an earlier row that shows why it should help.
- Unsure whether a file is in scope → it is not; take another idea.
- Scorer gaming → out of bounds even when the gate passes it: no edit to what the scorer reads, no special case for its cases, no cut of content the goal needs.
- Scoring → leave it to `round.mjs`; a score you measure costs the round's time and does not count.
- Git → one commit, no amend, no push.

## Idea file

```json
{"key": {"area": "parser", "lever": "single-pass", "target": "src/parse.ts"},
 "parts": [{"area": "parser", "lever": "single-pass", "target": "src/parse.ts"}],
 "files": ["src/parse.ts"],
 "evidence": ["src/parse.ts:88", "run.log case-12 ratio=0.41"],
 "expected": 0.08}
```

- `parts` → the key itself for a single idea, up to 3 same-area keys for a bundle.
- `expected` → the gain you expect, in the score's units.

## Return

One line, nothing else:

- `IDEA <short hash> <area>/<lever>/<target>`, the first part's key for a bundle.
- `NO-IDEA <reason>`
