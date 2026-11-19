# Export report

## Goal
The report command prints rows and can export them as csv.

## Tasks
### Task 1: docs(evals): record the findings
Data: five dated rows with source and count | Depends on: none | Proof: test "$(grep -c "2026" evals/failures.md)" -ge 5 | Files: `evals/failures.md`

### Task 2: feat(cli): add a report command
Proof: node --test tests/report.test.mjs | Files: `src/report.mjs`, `tests/report.test.mjs` | Depends on: none | Data: report(rows) returns a text table

### Task 3: feat(cli): parse the export flag
Files: `src/flags.mjs` | Proof: node -e "JSON.parse(require('fs').readFileSync('config/schema.json'))" | Data: flags.export is a path string or undefined | Depends on: Task 2

### Task 4: feat(export): write rows as csv
Depends on: Task 2, Task 3 | Data: exportCsv(rows, path) returns the byte count | Files: `src/export.mjs`, `tests/export.test.mjs` | Proof: node --test tests/export.test.mjs

### Task 5: fix(report): keep column order
Data: columns follow the schema array | Depends on: Task 2 | Proof: node --test tests/report.test.mjs | Files: `src/report.mjs`

### Task 6: chore(config): add the schema file
Proof: node --test tests/flags.test.mjs | Files: `config/schema.json` | Depends on: none | Data: schema lists six column names

### Task 7: feat(cli): print totals
Files: `src/totals.mjs`, `tests/totals.test.mjs` | Proof: node --test tests/totals.test.mjs | Data: totals(rows) returns sum and count | Depends on: Task 5, Task 6

### Task 8: docs(readme): describe the export
Depends on: Task 4 | Data: a section named Export with one example | Files: `README.md` | Proof: grep -q "## Export" README.md
