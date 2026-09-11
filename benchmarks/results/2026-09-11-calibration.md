# Overhead calibration

What `node benchmarks/calibrate.mjs` printed for `2026-09-11-calibration`.

Calibration: 6 exo and 6 baseline cells; calls counted whole: 0.

| metric | measured Δ ± se | booked | error | within spread |
|---|---|---|---|---|
| tokens | 5028 ± 2 | 5027 | -1 | yes |
| cost | $0.0050 ± $0.0000 | $0.0050 | -$0.0000 | yes |
| time | 140 ms ± 45 ms | 142 ms | 3 ms | yes |

## Rates the booking takes from these cells

- Characters per token of exo text: the exo cells' first call wrote 6,716.2 tokens at the 1-hour rate against the baseline's 4,202.5, a difference of 2,513.7 ± 0.7 for the 10,162 characters of exo text booked from their transcripts: 4.043.
- Processing time per written token: the exo cells' first token came 1,072.3 ms after the request against the baseline's 979.8 ms, 92.5 ms for those 2,513.7 tokens: 0.0368 ms.
- Both rates are fitted on these cells; the table checks them against other measures of the same cells, the whole weighted token difference and the whole-process wall time. The rates are Haiku 4.5's; another model processes at its own speed.
- No skill fired and no Stop hook entry was written in these single-reply cells, so skill calls, guard refusals and the Stop hook's time are not checked here.
