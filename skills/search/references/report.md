# Report shape

Write `docs/research/<topic>.md` in the user's language, in the project the user works in. Take every link, quote and id from the final `ranked.json`. Write nothing the evidence does not hold.

```
# <question>
Earlier: <path> (<date>)

## Answer
<the direct answer in a few sentences, each claim ending on its [E<n>]>

## Findings
### <theme>
- <claim in your own words> [E<n>]
  https://link (source)
  > the quote, copied word for word from that item

## Disagreements
- <what sources disagree on, with each side's [E<n>] and what differs: version, date or setup>

## Confidence
- <finding>: high | medium | low, because <two independent sources, one primary source, a stale page>

## Gaps
- <sub-question or point the evidence does not cover>

## Sources
| id | link | source | quality score |
| --- | --- | --- | --- |
| E1 | https://link | hn | 0.0164 |

Run: <tier>, <workers> workers, <n> sources read, <minutes> minutes
```

- Write `<n>` as the number on the last `Sources read:` line of `rank.mjs`; never count it yourself, because a hand count overstated the number in 3 earlier runs.
- Each claim carries the `[E<n>]` of the item whose quote supports it. One quote supports only what it says.
- Quote only the item's `quote` field. An item with `summary` true has no quote: cite its link marked `(summary; verify)` with no `>` line, and keep that mark on its row in the source table.
- Put each link on its own line, as the item holds it. Merge items that say the same thing into one finding with several ids.
- The quality score is the item's `score` from `ranked.json`. Do not round a score to hide a difference.
- A finding backed by only one source, or only by non-primary sources, is low or medium confidence.
- Write one `<path> (<date>)` per earlier report or brief the report builds on, separated by a comma and a space, and leave the line out when the report builds on no earlier file. It holds no link and no `[E<n>]` id, because `verify.mjs` checks those; the date is the one in the file's name, else a date the file states for itself, else the day the file was last changed, written as `YYYY-MM-DD`.
