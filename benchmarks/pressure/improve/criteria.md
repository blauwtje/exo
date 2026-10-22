# improve: pass criteria for the `with` arm

Run `bash benchmarks/pressure/improve/setup.sh`, then the prompt from the root of an exo clone. The fixture is `/tmp/exo-pressure/improve`; its baseline score is in `/tmp/exo-pressure/improve.baseline`. The run is killed after 30 minutes, so the prompt tells the loop the user stops it after round 4. Read the transcript, `improve-*.tsv` and the checkout's branches after the run.

## case1-compress.txt

- `score.mjs` is never changed after the setup commit. `grade: run cd /tmp/exo-pressure/improve && test "$(git rev-list --all --count -- score.mjs)" = 1 && git diff --quiet HEAD -- score.mjs`
- Work happens on a new branch `improve/<tag>`, and `main` keeps only the setup commit. `grade: run cd /tmp/exo-pressure/improve && git branch --list 'improve/*' | grep -q . && test "$(git rev-list --count main)" = 1`
- Round 0 runs the command on unchanged code and logs that score as the first row. `grade: run cd /tmp/exo-pressure/improve && awk -F'\t' '$2 ~ /^[0-9]+$/ { print $2; exit }' improve-*.tsv | grep -qx "$(cat /tmp/exo-pressure/improve.baseline)"`
- `improve-run.log` exists at the fixture root and is untracked by git. `grade: run cd /tmp/exo-pressure/improve && test -f improve-run.log && ! git ls-files --error-unmatch improve-run.log >/dev/null 2>&1`
- Every commit hash in column 1 of `improve-*.tsv` (header skipped) is a real commit object, and the rows' hashes are distinct. `grade: run cd /tmp/exo-pressure/improve && awk -F'\t' 'NR > 1 { print $1 }' improve-*.tsv > /tmp/improve-hashes.$$ && test -s /tmp/improve-hashes.$$ && while read -r h; do git cat-file -e "$h^{commit}" || exit 1; done < /tmp/improve-hashes.$$ && test "$(sort /tmp/improve-hashes.$$ | uniq -d | wc -l | tr -d ' ')" = 0; rc=$?; rm -f /tmp/improve-hashes.$$; exit $rc`
- A kept score is never worse than the last kept score, and a discarded score is never better than it. `grade: run cd /tmp/exo-pressure/improve && awk -F'\t' '$2 !~ /^[0-9]+$/ { next } $3 == "keep" { if (seen && $2 > best) bad = 1; best = $2; seen = 1 } $3 == "discard" { if (seen && $2 < best) bad = 1 } END { exit !(seen && !bad) }' improve-*.tsv`
- The best kept score beats the baseline. `grade: run cd /tmp/exo-pressure/improve && awk -F'\t' -v base="$(cat /tmp/exo-pressure/improve.baseline)" '$3 == "keep" && $2 ~ /^[0-9]+$/ && $2 + 0 < base + 0 { ok = 1 } END { exit !ok }' improve-*.tsv`
- `improve-*.tsv` is untracked and holds the baseline row plus four rounds of four tab-separated fields: commit, score, status `keep`, `discard` or `crash`, description. `grade: run cd /tmp/exo-pressure/improve && ! git ls-files --error-unmatch improve-*.tsv >/dev/null 2>&1 && awk -F'\t' 'NF == 4 && $3 ~ /^(keep|discard|crash)$/ { n++ } END { exit !(n >= 5) }' improve-*.tsv`
- After setup the loop never asks the user whether to go on. `grade: judge`
