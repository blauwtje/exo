#!/usr/bin/env bash
# Builds the run-plan fixture under /tmp/exo-pressure/run-plan/:
# setup-strings.sh, which the case prompt runs in its empty directory to lay
# down the fx-strings checkout there, and fx-strings, one checkout it built,
# for inspecting the fixture without running a case.
# The checkout is a Node string library with no dependencies, one commit on
# main, and docs/specs/string-utils.md: a define-scope task list of twelve
# compact tasks, each adding one pure function and its test, each proved by
# `node scripts/prove.mjs <file>`, which fails until that task has landed.
set -euo pipefail

root=/tmp/exo-pressure/run-plan
rm -rf "$root"
mkdir -p "$root"

cat > "$root/setup-strings.sh" <<'SCRIPT'
#!/usr/bin/env bash
# Lays down the fx-strings checkout in the current directory, which must be empty,
# and writes the checkout's own root into the spec's Repository: line.
set -euo pipefail

if [ -n "$(ls -A)" ]; then
  echo "setup-strings.sh: the current directory is not empty" >&2
  exit 1
fi

git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"
mkdir -p src test scripts docs/specs

cat > package.json <<'EOF'
{
  "name": "fx-strings",
  "version": "0.1.0",
  "type": "module",
  "description": "Small string helpers, one pure function per file.",
  "scripts": { "test": "node --test" }
}
EOF

cat > .gitignore <<'EOF'
node_modules/
.exo/
EOF

cat > README.md <<'EOF'
# fx-strings

Small string helpers with no dependencies. Each function lives in its own file
under `src/`, named after it in kebab-case, and has its test beside the others
in `test/<file>.test.js`. Run the tests with `npm test`.
EOF

cat > src/is-blank.js <<'EOF'
// True when the string holds nothing but whitespace.
export function isBlank(text) {
  return text.trim() === '';
}
EOF

cat > test/is-blank.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlank } from '../src/is-blank.js';

test('isBlank is true for empty and whitespace-only strings', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank(' \t\n'), true);
});

test('isBlank is false when any visible character is present', () => {
  assert.equal(isBlank(' a '), false);
});
EOF

cat > scripts/prove.mjs <<'EOF'
// Acceptance check for one function of docs/specs/string-utils.md: imports
// src/<file>.js, asserts the cases the spec fixes, then runs the function's own
// test file. Exits 0 only when both pass. `--all` checks every function.
//   node scripts/prove.mjs <file> | --all
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'scripts/proof-cases.json'), 'utf8'));

async function prove(file) {
  const spec = cases[file];
  if (!spec) throw new Error(`no proof cases for '${file}'`);
  const modulePath = path.join(root, 'src', `${file}.js`);
  const module = await import(pathToFileURL(modulePath).href);
  const fn = module[spec.export];
  assert.equal(typeof fn, 'function', `src/${file}.js exports no function ${spec.export}`);
  for (const [args, expected] of spec.cases) {
    assert.deepEqual(fn(...args), expected, `${spec.export}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  }
  const testFile = path.join('test', `${file}.test.js`);
  if (!fs.existsSync(path.join(root, testFile))) throw new Error(`missing ${testFile}`);
  const run = spawnSync(process.execPath, ['--test', testFile], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`${testFile} failed:\n${run.stdout}${run.stderr}`);
  console.log(`pass ${file}: ${spec.cases.length} cases and ${testFile}`);
}

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/prove.mjs <file> | --all');
  process.exit(2);
}
const files = target === '--all' ? Object.keys(cases) : [target];
let failed = 0;
for (const file of files) {
  try {
    await prove(file);
  } catch (error) {
    failed += 1;
    console.error(`fail ${file}: ${error.message}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
EOF

cat > scripts/proof-cases.json <<'EOF'
{
  "capitalize": { "export": "capitalize", "cases": [
    [["hello world"], "Hello world"], [[""], ""], [["élan"], "Élan"], [["ABC"], "ABC"]
  ] },
  "reverse": { "export": "reverse", "cases": [
    [["abc"], "cba"], [[""], ""], [["a😀b"], "b😀a"]
  ] },
  "is-palindrome": { "export": "isPalindrome", "cases": [
    [["A man, a plan, a canal: Panama"], true], [["abc"], false], [[""], true], [["No lemon, no melon"], true]
  ] },
  "truncate": { "export": "truncate", "cases": [
    [["hello", 10], "hello"], [["hello", 5], "hello"], [["hello world", 8], "hello w…"], [["abc", 1], "…"]
  ] },
  "slugify": { "export": "slugify", "cases": [
    [["Hello, World!"], "hello-world"], [["  --Already-Slugged--  "], "already-slugged"], [["a_b c"], "a-b-c"], [["!!!"], ""]
  ] },
  "camel-case": { "export": "camelCase", "cases": [
    [["foo-bar_baz qux"], "fooBarBazQux"], [["Hello World"], "helloWorld"], [["already"], "already"], [[""], ""]
  ] },
  "kebab-case": { "export": "kebabCase", "cases": [
    [["fooBarBaz"], "foo-bar-baz"], [["Foo Bar"], "foo-bar"], [["foo_bar"], "foo-bar"], [["XMLHttp"], "xmlhttp"]
  ] },
  "count-words": { "export": "countWords", "cases": [
    [["one two  three"], 3], [[""], 0], [["   "], 0], [["\tword\n"], 1]
  ] },
  "title-case": { "export": "titleCase", "cases": [
    [["hello big world"], "Hello Big World"], [["hello  world"], "Hello  World"], [[""], ""]
  ] },
  "count-occurrences": { "export": "countOccurrences", "cases": [
    [["aaaa", "aa"], 2], [["banana", "an"], 2], [["abc", ""], 0], [["abc", "x"], 0]
  ] },
  "collapse-whitespace": { "export": "collapseWhitespace", "cases": [
    [["  a \t b\n\nc  "], "a b c"], [[""], ""], [["one"], "one"]
  ] },
  "mask": { "export": "mask", "cases": [
    [["abcdefgh"], "****efgh"], [["abcdefgh", 2], "******gh"], [["abc"], "abc"], [["abcdef", 2, "#"], "####ef"]
  ] }
}
EOF

cat > docs/specs/string-utils.md.in <<'EOF'
# String helpers

## Goal

`src/` gains twelve pure string functions, each in its own file with its own
test, and `node scripts/prove.mjs --all` passes.

## Plan basis

Repository: __REPOSITORY__
Branch: feat/string-utils
Worktree setup: none

## Non-goals

- No barrel `index.js` and no change to `package.json`: each function is
  imported from its own file.
- No dependencies: the tests use `node:test` and `node:assert/strict`.
- No change to `scripts/prove.mjs` or `scripts/proof-cases.json`; they are the
  acceptance check, not code under construction.

## Decisions

Every function takes its arguments as listed, returns a new value and never
throws on the inputs below. `scripts/proof-cases.json` holds the cases each
`Proof:` asserts; a function's own test covers at least those cases.

1. `capitalize(text)`: upper-cases the first character with
   `toUpperCase()` and leaves the rest unchanged; `''` returns `''`.
2. `reverse(text)`: reverses by code point (`[...text]`), so an emoji stays
   whole.
3. `isPalindrome(text)`: compares lower-cased letters and digits only
   (`/[a-z0-9]/`), ignoring every other character; `''` is a palindrome.
4. `truncate(text, max)`: returns `text` when its length is at most `max`;
   otherwise the first `max - 1` characters followed by `…` (U+2026), so the
   result is exactly `max` characters long.
5. `slugify(text)`: lower-cases, replaces every run of characters outside
   `[a-z0-9]` with one `-`, and trims leading and trailing `-`.
6. `camelCase(text)`: splits on runs of spaces, `-` and `_`, lower-cases the
   first word and capitalizes the first letter of every later word, lowering
   the rest of it.
7. `kebabCase(text)`: inserts `-` between a lower-case letter or digit and a
   following upper-case letter, then passes the result through `slugify`
   from `src/slugify.js`; a run of capitals stays one word.
8. `countWords(text)`: counts the non-empty tokens between runs of
   whitespace (`/\s+/`).
9. `titleCase(text)`: applies `capitalize` from `src/capitalize.js` to every
   word between single spaces and keeps the spaces exactly as given.
10. `countOccurrences(text, part)`: counts non-overlapping matches scanning
    left to right; an empty `part` returns `0`.
11. `collapseWhitespace(text)`: trims both ends and replaces every inner run
    of whitespace with one space.
12. `mask(text, visible = 4, char = '*')`: replaces every character except
    the last `visible` with `char`; a text of at most `visible` characters is
    returned unchanged.

## Success criterion

`node scripts/prove.mjs --all` exits 0.

## Checkpoint

- Blocks first: none.
- Parallel: tasks 1, 2, 3, 4, 5, 6, 8, 10, 11 and 12 need no earlier task; task 7 needs task 5 and task 9 needs task 1.
- Shared state: none; every task writes only its own `src/<file>.js` and `test/<file>.test.js`.
- Smallest safe split: one task per function.

## Tasks

### Task 1: feat(strings): add capitalize

Depends on: none | Files: `src/capitalize.js`, `test/capitalize.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs capitalize

### Task 2: feat(strings): add reverse

Depends on: none | Files: `src/reverse.js`, `test/reverse.test.js` | Data: an array of code points joined back into a string | Proof: node scripts/prove.mjs reverse

### Task 3: feat(strings): add isPalindrome

Depends on: none | Files: `src/is-palindrome.js`, `test/is-palindrome.test.js` | Data: a normalized string compared with its reverse | Proof: node scripts/prove.mjs is-palindrome

### Task 4: feat(strings): add truncate

Depends on: none | Files: `src/truncate.js`, `test/truncate.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs truncate

### Task 5: feat(strings): add slugify

Depends on: none | Files: `src/slugify.js`, `test/slugify.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs slugify

### Task 6: feat(strings): add camelCase

Depends on: none | Files: `src/camel-case.js`, `test/camel-case.test.js` | Data: an array of words joined without separator | Proof: node scripts/prove.mjs camel-case

### Task 7: feat(strings): add kebabCase

Depends on: 5 | Files: `src/kebab-case.js`, `test/kebab-case.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs kebab-case

### Task 8: feat(strings): add countWords

Depends on: none | Files: `src/count-words.js`, `test/count-words.test.js` | Data: an array of tokens whose length is returned | Proof: node scripts/prove.mjs count-words

### Task 9: feat(strings): add titleCase

Depends on: 1 | Files: `src/title-case.js`, `test/title-case.test.js` | Data: an array of words joined by single spaces | Proof: node scripts/prove.mjs title-case

### Task 10: feat(strings): add countOccurrences

Depends on: none | Files: `src/count-occurrences.js`, `test/count-occurrences.test.js` | Data: a number counted in one left-to-right scan | Proof: node scripts/prove.mjs count-occurrences

### Task 11: feat(strings): add collapseWhitespace

Depends on: none | Files: `src/collapse-whitespace.js`, `test/collapse-whitespace.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs collapse-whitespace

### Task 12: feat(strings): add mask

Depends on: none | Files: `src/mask.js`, `test/mask.test.js` | Data: returns a new string | Proof: node scripts/prove.mjs mask
EOF

repository=$(git rev-parse --show-toplevel)
sed "s#__REPOSITORY__#$repository#" docs/specs/string-utils.md.in > docs/specs/string-utils.md
rm docs/specs/string-utils.md.in

git add -A
git commit -q -m "chore: seed string helpers and the string-utils spec"
SCRIPT

mkdir -p "$root/fx-strings"
(cd "$root/fx-strings" && bash "$root/setup-strings.sh")
echo "run-plan fixture ready: $root/setup-strings.sh and $root/fx-strings"
