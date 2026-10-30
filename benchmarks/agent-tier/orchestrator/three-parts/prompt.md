Coordinate these three parts in this repository. Each part id names its part.

- `slugify`: add `slugify(text)` to `src/text.mjs`. It lowercases, turns every run of characters other than `a-z` and `0-9` into one `-`, and drops a leading or trailing `-`. Add a test.
- `clamp`: add `clamp(value, min, max)` to `src/num.mjs`. It returns `value` bounded to `[min, max]` and throws a `RangeError` when `min > max`. Add a test.
- `report-format`: change `report(items)` in `src/report.mjs` so each line reads `<slugify(name)>: <clamp(score, 0, 100)>`, importing `slugify` and `clamp` from the two parts above. Update its test.

Result file: `.exo/orchestrate/result.md`, one line per part naming its id, its phase number and its verdict.
Done: every part's change is in this checkout's working tree, committed or not, and `npm test` passes.
