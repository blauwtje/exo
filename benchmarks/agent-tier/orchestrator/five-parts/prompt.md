Coordinate these six parts in this repository. Each part id names its part.

- `parse-duration`: add `parseDuration(text)` to `src/duration.mjs`. It reads one or more `<digits><unit>` groups with units `h`, `m` and `s`, each unit at most once and in that order, and returns the total in seconds: `'1h30m'` is `5400`, `'45s'` is `45`, `'2h5s'` is `7205`. Any other text, such as `''`, `'30m1h'`, `'1x'`, `'1.5h'` or `'1h1h'`, throws a `TypeError`. Add a test.
- `to-roman`: add `toRoman(n)` to `src/roman.mjs`. It returns the standard Roman numeral of an integer from 1 to 3999, with subtractive pairs: `4` is `'IV'`, `1994` is `'MCMXCIV'`. A non-integer or a number outside that range throws a `RangeError`. Add a test.
- `wrap-text`: add `wrapText(text, width)` to `src/wrap.mjs`. It splits `text` into words on runs of whitespace and fills lines greedily, joining the words of a line with one space and the lines with `\n`; no line passes `width` unless it holds one word longer than `width`, which stays whole on its own line. Empty or blank text returns `''`. Add a test.
- `median-of`: add `median(values)` to `src/stats.mjs`. It returns the middle value of the numbers in numeric order, or the mean of the two middle values for an even count, and leaves `values` unchanged. An empty array throws a `RangeError`. Keep `mean`. Add a test.
- `csv-row`: add `parseCsvRow(line)` to `src/csv.mjs`. It splits one CSV line on commas into an array of strings. A field in double quotes may hold commas, and `""` inside it is one `"`. Fields keep their spaces. Add a test.
- `run-report`: add `runReport(lines, width)` to `src/report.mjs`. Each line is a CSV row `<name>,<duration>`. It returns `wrapText` at `width` of `<toRoman(count)> runs, median <median seconds>s: <names joined by ', '>`, importing the five parts above. Add a test.

Result file: `.exo/orchestrate/result.md`, one line per part naming its id, its phase number and its verdict.
Done: every part's change is in this checkout's working tree, committed or not, and `npm test` passes.
