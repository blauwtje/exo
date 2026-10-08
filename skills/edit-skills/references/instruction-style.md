# Instruction-file style

Scope: `CLAUDE.md`, rules, skills, agents, output styles, hook text. Reader: model, not human.

## Cut

- Each line → test "remove it, Claude errs?"; no → cut.
- Model does it by default → cut.
- Code already shows it → cut.
- Stale line → cut.
- Rule owned elsewhere → point to owner or omit.
- Rule system prompt also states → keep; sessions switch models.
- Comments (HTML too), dates, sources, change history, opinions → cut.
- Example → cut unless rule fails without it.
- Reason → cut unless it sets the rule's boundary; then one clause.

## Compress

- Drop articles, copulas, filler, hedges.
- Never drop: `not`, `no`, `only`, `except`, `never`, numbers, paths, commands, identifiers, error text.
- Over-compressed line = defect: ambiguous → rewrite, not shorten further.
- Line length, hard wraps, reading grade → not targets.
- Em dashes → none.

## Bullets

- Format: `condition → action`, trigger word first.
- One rule per bullet: one condition, one action.
- Compound bullet → split, unless split loses the boundary.
- Exception → beside its rule.
- Definition → by contrast: "X, not Y".
- List order could read as precedence → say whether first match wins or every item applies.
- Structure → Markdown headers and bullets.
- Verifier fails a sentence over 40 words and a list item of 3+ sentences.

## Tone

- Phrasing → positive by default.
- `never` / `IMPORTANT` → real guardrails only, max 2 per file.
- CAPS or `MUST` shouting → none; Opus 5.5 overtriggers.
- "Think carefully" → none; thinking always on.
- One term per concept; established term over coined one.

## Placement and budgets

- Most-broken rules → top of file.
- Material only some paths need → reference.
- Reference → one level deep, loaded via a pointer naming when to open it.
- `CLAUDE.md` → under 60 lines.
- Skill body → under 200 words where possible; 500 lines hard cap; token caps in edit-skills `## Form`.
- Load path (skill body + references it reads) → under ~150 rules.
- Skill description → when to use + triggers, third person (`Use when …`), never a workflow summary; aim 200 chars, verifier fails 250.

## Enforcement

- Must happen every time, no exception → hook or verifier, not prose.
- Hook → deny or allow, command unchanged; no rewrite inside a pipeline.
