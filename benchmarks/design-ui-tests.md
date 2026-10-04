# design-ui tests

Three fixed prompts check that design-ui keeps the quality and fullness of the best earlier run, looks unique per project and ends under 120k tokens of context. The user alone judges quality against the best run; no critic agent scores a test.

## Setup

- Run each prompt in its own empty folder, so DESIGN.md never leaks from one test into the next.
- Type each prompt exactly as written, in a fresh design-ui session.
- Keep the run directory and the session transcript of each run; the checklist reads both.

## Prompts

- "Een adminoverzicht van bestellingen". The yardstick is the best run: Linear and Vercel style, rich, with motion.
- "Een lesscherm voor een taalleer-app". Playful like Duolingo, without its characters or brand.
- "Een landingspagina voor een nieuwe SaaS-tool". Expressive.

## Checklist, per run

- Only the scope form asked a question.
- DESIGN.md holds the reference product, display font, body font and accent after the run.
- The plan is at most 25 lines, each layout at most 8 lines per width.
- Each font and the accent carry a clause naming this product and this user.
- A pick seen in another project shows the warning on the color and font line, in the reply's language.
- An empty folder got the Vite, React, TypeScript, Tailwind and shadcn stack.
- The main session read `build-pass.md` whole before its first edit, and dispatched no `exo:build-ui` page build.
- Amounts render in a proportional family with `tabular-nums`, never a monospace family.
- Both `final` captures, at 390 and 1440 wide, are newer than every edited file.
- Every pass left its own numbered report and captures.
- The check-ui summary reached the transcript as at most two lines.
- The motion bar of `build-pass.md` is complete, reduced motion included.
- `node benchmarks/design-run.mjs --transcript <session .jsonl> --run <run directory>` reports a final context under 120k tokens.

## Across the three runs

- The three runs used three different display font and accent pairs.

## Manual checks

- Prompt 1 matches or beats the best run in quality, fullness and motion, judged side by side.
- Prompt 2 reads playful and finished, with no Duolingo character, owl or brand color.
- Prompt 3 reads expressive and finished, not a stock SaaS template.
- Each run's DESIGN.md, plan and final captures are present in its own folder.
