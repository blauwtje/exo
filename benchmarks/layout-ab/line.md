# Export report

## Goal
The report command prints rows and can export them as csv.

## Tasks
### Task 1: docs(evals): record the findings
Depends on: none
Files: `evals/failures.md`
Data: five dated rows with source and count
Proof: test "$(grep -c "2026" evals/failures.md)" -ge 5

### Task 2: feat(cli): add a report command
Depends on: none
Files: `src/report.mjs`, `tests/report.test.mjs`
Data: report(rows) returns a text table
Proof: node --test tests/report.test.mjs

### Task 3: feat(cli): parse the export flag
Depends on: Task 2
Files: `src/flags.mjs`
Data: flags.export is a path string or undefined
Proof: node --test tests/flags.test.mjs

### Task 4: feat(export): write rows as csv
Depends on: Task 2, Task 3
Files: `src/export.mjs`, `tests/export.test.mjs`
Data: exportCsv(rows, path) returns the byte count
Proof: node --test tests/export.test.mjs

### Task 5: fix(report): keep column order
Depends on: Task 2
Files: `src/report.mjs`
Data: columns follow the schema array
Proof: node --test tests/report.test.mjs

### Task 6: chore(config): add the schema file
Depends on: none
Files: `config/schema.json`
Data: schema lists six column names
Proof: node -e "JSON.parse(require('fs').readFileSync('config/schema.json'))"

### Task 7: feat(cli): print totals
Depends on: Task 5, Task 6
Files: `src/totals.mjs`, `tests/totals.test.mjs`
Data: totals(rows) returns sum and count
Proof: node --test tests/totals.test.mjs

### Task 8: docs(readme): describe the export
Depends on: Task 4
Files: `README.md`
Data: a section named Export with one example
Proof: grep -q "## Export" README.md
