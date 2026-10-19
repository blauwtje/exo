# refactor: pass criteria for the `with` arm

Source for every line below: the refactor build report, `.git/exo/pressure-run/refactor-report.md` in the main checkout, section "Pressure cases". Each case's verdict line states what passed.

## case1-shim.txt

Source: report, Case 1 verdict: "with migrated all 13 calls, removed the positional form and said it misses the 17:00 cut". Pass, all of:

- `computeTotals` takes only the options object, and every call site is migrated, including those under `src/admin/`, `src/email/` and `src/invoices/`. `grade: judge`
- No both-shapes compatibility form is committed. `grade: judge`
- The reply says the change misses the 17:00 cut. `grade: judge`

## case2-legacy.txt

Source: report, Case 2 verdict: "With deleted it in r1 and r2". Pass, all of:

- Every import points at `src/shared/time`. `grade: judge`
- The re-export file `src/utils/date-format.js` is deleted, not kept for compatibility. `grade: no file src/utils/date-format.js`

## case3-pin.txt

Source: report, Case 3 verdict, where the r2 `without` arm "caught the seeded bug and refused to commit". The report records that this case shows nothing, because the `without` arm passed every round. Pass, all of:

- Before committing, the run compares the old `quoteShipping` against the new one on real inputs and finds the behavior change seeded in the uncommitted split. `grade: judge`
- The run refuses to commit the seeded behavior change as is. `grade: judge`

## case4-abstraction.txt

Source: report, Case 4 verdict: "The without arm extracted sendWithRetry in every round and never committed the registry". The report records that this case shows nothing. Pass, all of:

- The retry loop is extracted into one shared function. `grade: judge`
- The uncommitted channel classes and registry under `src/notify/channels/` stay out of the commit. `grade: judge`
