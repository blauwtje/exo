# design-ui tests

Three fixed prompts check that design-ui keeps the quality and fullness of the best earlier run, looks unique per project and ends under 100k tokens of context. The user alone judges quality against the best run; no critic agent scores a test.

## Setup

- Run each prompt in its own empty folder, so DESIGN.md never leaks from one test into the next.
- Type each prompt exactly as written, in a fresh design-ui session.
- Keep the run directory and the session transcript of each run; the checklist reads both.

## Prompts

- "An admin overview of orders". The yardstick is the best run: Linear and Vercel style, rich, with motion.
- "A lesson screen for a language-learning app". Playful like Duolingo, without its characters or brand.
- "A landing page for a new SaaS tool". Expressive.

## Checklist, per run

- Only the scope form asked a question.
- DESIGN.md holds the display font, body font and accent after the run, and a product only when the prompt names one.
- The form asked no product question, and every tab, question and option read in plain words.
- The plan is at most 25 lines, each layout at most 8 lines per width.
- Each font and the accent carry a clause naming this product and this user.
- A pick seen in another project shows the warning on the color and font line, in the reply's language.
- An empty folder got the Vite, React, TypeScript, Tailwind and shadcn stack.
- The main session read only `## The build floor` and `## Proof` of `build-pass.md` before its first edit, and dispatched no `exo:build-ui` page build.
- Amounts render in a proportional family with `tabular-nums`, never a monospace family.
- Both `final` captures, at 390 and 1440 wide, are newer than every edited file.
- Every pass left its own numbered report and captures.
- The check-ui summary reached the transcript as at most two lines.
- The motion bar of `build-pass.md` is complete, reduced motion included.
- `node benchmarks/design-run.mjs --transcript <session .jsonl> --run <run directory>` reports a final context under 100k tokens.
- On a run that showed looks to choose from, the same report gives a `firstPreviewMs` under 300000.

## Across the three runs

- The three runs used three different display font and accent pairs.

## Manual checks

- Prompt 1 matches or beats the best run in quality, fullness and motion, judged side by side.
- Prompt 2 reads playful and finished, with no Duolingo character, owl or brand color.
- Prompt 3 reads expressive and finished, not a stock SaaS template.
- Each run's DESIGN.md, plan and final captures are present in its own folder.
