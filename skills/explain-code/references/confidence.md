# Confidence

Each claim carries the tier its evidence earns, in words the reader cannot mistake. The enemy is the gap filled with a confident guess, which the reader acts on. The overcorrection is a hedge on every line, which hides the claims that are solid.

## Tiers

| Tier | Evidence | Wording |
|---|---|---|
| Verified | A file and line read this session, or a commit, pull request or issue quoted with its id | Plain statement plus the anchor: "`runner.js:6` reads `SYNC_MAX_ATTEMPTS` first." |
| Inferred | Reasoning from verified facts, with the facts named | "Inferred from X and Y: ..."; say what would confirm it. |
| Unknown | Nothing found after the searches listed | "Not recorded: searched blame, pickaxe, PRs; nothing names a reason." |

## Rules

- Code is never evidence of its own intent: a line proves what runs, not why; a comment is a claim with its own commit date.
- The asker's theory, a lead's certainty or a senior's say-so is a hypothesis; report whether the evidence supports it, contradicts it or is silent.
- A request for "no caveats" or "stated plainly" gets plain words at the true tier: "The repository does not record why; the likely cause is X (inferred from Y)." A board line can say "unverified" in one word.
- An absence of evidence is reported as a search that found nothing, never as evidence that no reason exists.
- When two readings fit the evidence, name both and what would tell them apart, rather than picking the tidier one.

## Before sending

- Every verified claim has its anchor.
- Every inferred claim names the facts it rests on.
- Every unknown lists the searches run.
- No claim from a name, a comment or the asker's theory sits in the verified tier.

## Judgment

- A verified anchor outranks an inferred claim that only reads more confident.
- "No caveats" changes the words, never the tier: the answer stays plain, not upgraded to verified.
- A reported absence of evidence outranks a filled-in guess, even when the asker wanted a firm answer.
