# Decision log

The log is the run's only account of what was tried, and each row points at evidence a reviewer can open. The enemy is a trail written from memory after the fact, with rows nobody can check and pivots nobody recorded. The overcorrection is a row per command, which buries the decisions a reviewer came to find.

## Where it lives

- `<common git dir>/exo/tune-metric/<slug>.tsv`, the directory from `git rev-parse --git-common-dir`, so every worktree of the run writes one file and nothing is committed.
- Each harness run saves its output beside it as `<slug>/<attempt>.txt`; a row's numbers are read from that file.

## Columns

One tab-separated header line, written when the file is created:

```text
ts	attempt	phase	hypothesis	change	evidence	before	after	checks	verdict	note
```

- `ts`: UTC time, `date -u +%FT%TZ`.
- `attempt`: a number from 1 upward; `-` on a row that is not an attempt.
- `phase`: `start`, `baseline`, `attempt`, `pivot`, `stop` or `supersede`.
- `hypothesis`: the change and the mechanism it acts through, in one line.
- `change`: the commit of the attempt, kept or not.
- `evidence`: pointers only, space-separated: a commit, a saved harness output, a `file:line`, a check log. Never prose.
- `before`, `after`: the two medians, with the spread after a `±`.
- `checks`: `green` or `red`, with the path of the check output.
- `verdict`: `kept` or `reverted` on an attempt; `-` elsewhere.
- `note`: one line, such as the reason for a revert or the category a pivot moves to.

## Rows

- `start` opens every run: the predicate as written, the harness command and the commit that froze it, the budget if any. A run is one session with its later turns; a resumed or new session appends its own `start` row, naming the `ts` range it did not write and its transcript file.
- `baseline` holds the median and spread before any change, with the check output that was green.
- One `attempt` row per attempt, kept or reverted, written after its measurement and never before.
- `pivot` records a plateau and the category the run moves to.
- `stop` records which half of the predicate held, or that the budget ran out.
- `supersede` corrects an earlier row: it names that row's `ts` and states what holds instead.

## Writing a row

Append only: a wrong row stays, and a `supersede` row after it corrects it, so the history a reviewer reads is the history that happened. Write every row through this function rather than by hand, because it flattens tabs and line breaks and quotes a cell opening with `=`, `+`, `-` or `@`, which a spreadsheet would otherwise run as a formula:

```bash
row() {
  local cell out=()
  for cell in "$@"; do
    cell=${cell//[$'\t\r\n']/ }
    [[ $cell == [=+@-]* ]] && cell="'$cell"
    out+=("$cell")
  done
  (IFS=$'\t'; printf '%s\n' "${out[*]}") >> "$LOG"
}
row "$(date -u +%FT%TZ)" 4 attempt "memoize parse: the tokenizer runs twice per request" a1b2c3d "$DIR/4.txt src/parse.ts:88" "212ms ±6" "171ms ±5" "green $DIR/4-checks.txt" kept "-19%"
```

## Judgment

- A pointer outranks a sentence: a cell a reviewer cannot open is a claim, not evidence.
- A superseding row outranks a clean log: an invented or wrong row is corrected after it, never deleted.
- One row per decision outranks completeness: a command that decided nothing gets no row.
