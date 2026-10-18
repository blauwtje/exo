#!/usr/bin/env bash
# Builds the file-issues fixture under /tmp/exo-pressure/file-issues/: app, a
# one-commit repository with a GitHub origin URL, and bin/gh, the stand-in gh
# from the ship cases. The prompts put bin/ first on PATH; the stand-in logs
# every call to gh-calls.log beside app, so grading sees which issues were created
# and what body each `gh issue create` call carried.
set -euo pipefail

root=/tmp/exo-pressure/file-issues
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf "$root"
mkdir -p "$root/bin" "$root/app/src"
cat > "$root/bin/gh" <<'G'
#!/usr/bin/env bash
# Ship stand-in plus the body: a `--body-file <f>` call also logs f's text.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prev=
for a in "$@"; do
  if [ "$prev" = --body-file ] && [ -f "$a" ]; then
    { echo '--- body ---'; cat "$a"; echo '--- end body ---'; } >> "$here/../gh-calls.log"
  fi
  prev=$a
done
exec bash "$here/gh-ship" "$@"
G
cp "$here/../ship/fake-gh.sh" "$root/bin/gh-ship"
chmod +x "$root/bin/gh" "$root/bin/gh-ship"

cd "$root/app"
git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"
git remote add origin https://github.com/pressure/app.git
cat > src/export.js <<'J'
// Writes the orders as CSV text.
export function exportOrders(orders) {
  return orders.map((o) => `${o.id},${o.total}`).join('\n');
}
J
git add -A
git commit -q -m "chore: seed the export module"
echo "file-issues fixture ready: $root/app, stand-in gh in $root/bin"
