#!/usr/bin/env bash
# Builds the start fixtures under /tmp/exo-pressure/start/:
# fx-notes, a small Node notes app with no git history, and one prompt file
# goal-<n>.txt per line of case1-lazy-goals.txt, each `/exo:start <goal>` so
# the start skill loads, then a line naming the fixture directory.
set -euo pipefail

root=/tmp/exo-pressure/start
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -rf "$root"
mkdir -p "$root"

dir="$root/fx-notes"
mkdir -p "$dir/src" "$dir/test"
cat > "$dir/package.json" <<'JSON'
{
  "name": "fx-notes",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "test": "node --test" }
}
JSON
cat > "$dir/src/users.js" <<'JS'
const users = new Map([['u1', { id: 'u1', name: 'Ada' }]]);

export function getUser(id) {
  return users.get(id) ?? null;
}
JS
cat > "$dir/src/notes.js" <<'JS'
import { getUser } from './users.js';

const notes = [];

export function addNote(userId, text, tags = []) {
  const author = getUser(userId);
  if (!author) throw new Error(`unknown user ${userId}`);
  const note = { id: `n${notes.length + 1}`, author: author.name, text, tags };
  notes.push(note);
  return note;
}

export function listNotes() {
  return [...notes];
}
JS
cat > "$dir/src/export.js" <<'JS'
import { listNotes } from './notes.js';

export function exportNotes() {
  const rows = listNotes();
  let out = 'id,author,text\n';
  for (const row of rows) {
    out += row.id + ',' + row.author + ',' + row.text + '\n';
  }
  return out;
}
JS
cat > "$dir/src/invoice.js" <<'JS'
export function invoiceTotal(lines, taxRate) {
  const net = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return Math.round(net * (1 + taxRate) * 100) / 100;
}
JS
cat > "$dir/src/settings.html" <<'HTML'
<h1>Settings</h1>
<form>
  <label>Name <input name="name"></label>
  <label>Email <input name="email"></label>
  <button>Save</button>
</form>
HTML
cat > "$dir/test/notes.test.js" <<'JS'
import test from 'node:test';
import assert from 'node:assert/strict';
import { addNote } from '../src/notes.js';

test('addNote keeps the author name', () => {
  assert.equal(addNote('u1', 'hello').author, 'Ada');
});
JS

index=0
while IFS=$'\t' read -r stage goal; do
  index=$((index + 1))
  printf '/exo:start %s\nThe project is in %s; work from there.\n' "$goal" "$dir" > "$root/goal-$index.txt"
done < "$here/case1-lazy-goals.txt"
echo "start fixtures ready under $root: $index goal prompts"
