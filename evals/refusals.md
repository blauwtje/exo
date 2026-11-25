# Refusals in land-*.mjs seen outside exo

Counted: sessions in ~/.claude/projects (not the exo project) with a tool result holding the rendered refusal text. Sessions that only read the code do not match, because the code has placeholders.

| Refusal | Sessions | Basis |
|---|---|---|
| unlisted paths | 16 | guess (plan Files: list) |
| proof flaky | 14 | seen run |
| land gate failed | 10 | seen run |
| proof command failed | 8 | seen run |
| land gate exit0 | 7 | seen run |
| no build report | 6 | missing file |
| head moved | 5 | seen git state |
| no changed path | 5 | seen git state |
| proof passes without change (red-green) | 4 | seen run |
| red-green failed to finish | 4 | seen run |
| already landed | 3 | seen git state |
| report not clear pass | 2 | seen state |
| commit text refused | 1 | seen state |
| toplevel mismatch | 1 | seen state |
| secret pattern | 0 | seen state |
| test file failed | 0 | seen state |
| covering tests failed | 0 | seen state |
| no proof, no report line | 0 | seen state |
| lock held | 0 | seen state |

Chosen: **unlisted paths** (16 sessions, refuses on a guessed Files: list) becomes a visible line instead of a refusal.
