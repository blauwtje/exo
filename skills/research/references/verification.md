# Verification

Deterministic checks first, then the model check.

## Stored claims

A worker adds a claim after fetching its page:

`node "${CLAUDE_SKILL_DIR}/scripts/claims.mjs" add <run-dir> '{"id":"c1","sentence":"...","ref":"<ref>","quote":"<verbatim>","kind":"web","time_class":"evergreen"}'`

It refuses a quote not on the fetched page after whitespace and case folding. A refusal means fix the quote or drop the claim.

## verify.mjs

`node "${CLAUDE_SKILL_DIR}/scripts/verify.mjs" <run-dir>` blocks the report until:

- every footnote maps to a stored claim;
- each number in a cited sentence occurs in its quote, where `1,000` equals `1000` and a spelled-out number fails;
- each claim backed only by forum, social or video sources has a second independent registrable domain (all `reddit.com` subdomains are one).

## claim-judge

After verify.mjs is clean, dispatch the `exo:claim-judge` agent with `exo-kind: judge`, the run folder and the claim ids. It labels each claim `supported`, `unsupported` or `contradicted` against the cached page.

- Repair only the failing sentences, one round: reword to what the quote supports, or remove the sentence.
- Rerun `verify.mjs` after the repair. A claim still failing stays in the report labelled as it is, and is named in the gaps.
