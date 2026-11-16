# Instruction-file style

Applies to `CLAUDE.md`, rules, skills, agents and output styles.

## Write

- Open with one sentence saying what the file produces. Put the rules the model breaks most near the top, because later rules get less weight.
- One sentence with a verb per rule, as a bare imperative: "Run the tests before you commit." One condition and one action per bullet; two semicolons mean two rules.
- Add one clause of reason when it sets the rule's boundary. Phrase the target behavior positively; keep a negative for a discrete prohibition such as "do not run `git stash`".
- Write no CAPS, IMPORTANT or MUST; give the reason instead.
- Keep the words that set a boundary: `not`, `only`, `except`, `unless`, `each`, `every`, `at most`, `before`, `after`, numbers, paths and commands. Use a number or exact command instead of an adjective.
- Use one term per concept; define a coined term once where it first appears, or use the plain word.
- Use no em dashes. Show a Good and a Bad example only for a rule that shapes an output.

## Cut

- Cut a line when the model errs without it no more than with it: default behavior, what the code shows, stale text, a rule another file owns.
- Cut comments, change history, opinions and dates, except a date on a fact that will age.
- Drop "double-check" lines and worked reasoning, because both make a reasoning model over-verify.

## Place

- Keep a rule that must hold every time in `CLAUDE.md` or a check, because `.claude/rules/*.md` with `paths:` loads unreliably.
- Keep `CLAUDE.md` under 60 lines. Move path-specific material to a reference, loaded through a pointer that says when to open it.
- Write at most 5 prohibition bullets per instruction file.
