# Wording

## Register by skill kind

| Skill kind | Register | Why |
|---|---|---|
| Discipline (a step the model is tempted to skip) | Imperative, "no exceptions", forced choice, one line the model states before acting | Bright line cuts rationalization; a stated commitment is kept |
| Technique or stage | Moderate imperative plus reason; colleague voice | Reason lets the model draw the boundary itself |
| Reference | Plain statements | Nothing to enforce |

- Flattery or thanks to the model → never; warmth trains sycophancy toward the skill's own text.
- Urgency → only where failure is immediate; a false "before proceeding" on a low-stakes step teaches the model to ignore the true one.

## Sentences that bind

- Rule → bright line the model can check, never a hedge; a hedge reads as permission.
- "When X, do Y" with X observable beats general advice; the model executes the trigger without deciding.
- One default with one named escape hatch beats a menu; the model picks the default and moves.
- Fact that will age → reference, with its date.

## Micro-test wording

Two phrasings compete → test the sentence in isolation before a full scenario:

1. Same realistic prompt, fresh context per call; one arm per phrasing plus a control arm with no guidance.
2. Control arm does not fail → cut the sentence; nothing to fix.
3. Each arm at least five runs.
4. Read every flagged output by eye; a grep match is not a judgment.
5. Variance across runs is the signal: a binding phrasing converges, a weak one scatters.

Micro-test settles wording only, never whether the skill holds under pressure; that is the scenario's job.

## Judgment

- Technique → reason clause outranks the imperative; discipline → imperative outranks the reason.
