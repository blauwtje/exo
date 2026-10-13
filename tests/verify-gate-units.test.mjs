// The pure helpers verify.mjs exports: stray paths, proof and summary reads, task
// states, blame and the claims-diff readers.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { criterionCommand } from '#plan-tasks';
import { commandLine, filesUnderGlobs, findStrayPaths, splitFixOnlyPaths, isTestFirst, manualChecks, outputTail, runnableProof, successCriterionPasses, summaryLine, taskStates, unchangedFiles, unlandedBlame, silencedChecks, unmarkedMcpTool, weakenedTests } from '../skills/verify/scripts/verify.mjs';

test('findStrayPaths keeps only paths no task declared', () => {
  const tasks = [
    { number: 1, files: [{ path: 'src/app.js' }] },
    { number: 2, files: [{ path: 'src/broken.js' }] }
  ];
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/extra.js']), ['src/extra.js']);
  assert.deepEqual(findStrayPaths(tasks, ['src/app.js', 'src/broken.js']), []);
});

test('findStrayPaths treats a Files: entry ending in / as covering every path under it', () => {
  const tasks = [{ number: 1, files: [{ path: 'src/lib/' }] }];
  assert.deepEqual(
    findStrayPaths(tasks, ['src/lib/util.js', 'src/lib/deep/more.js', 'src/library.js', 'docs/readme.md']),
    ['src/library.js', 'docs/readme.md']
  );
});

test('splitFixOnlyPaths moves a stray path only trailer-less fix commits touched to fixOnly', () => {
  const fix = (sha, subject = 'fix(app): repair', body = subject) => ({ sha, subject, body });
  const commitsByPath = new Map([
    ['a.js', [fix('2222222222'), fix('1111111111', 'fix!: break')]],
    ['b.js', [fix('3333333333', 'fix(app): x', 'fix(app): x\n\nPlan-task: plan/1')]],
    ['c.js', [fix('4444444444'), fix('5555555555', 'feat(app): add', 'feat(app): add')]],
    ['d.js', [fix('6666666666', 'fixup: nope', 'fixup: nope')]]
  ]);
  assert.deepEqual(splitFixOnlyPaths(['a.js', 'b.js', 'c.js', 'd.js', 'e.js'], commitsByPath), {
    strays: ['b.js', 'c.js', 'd.js', 'e.js'],
    fixOnly: [{ path: 'a.js', shas: ['2222222', '1111111'] }],
    lead: []
  });
});

test('splitFixOnlyPaths reads CHANGELOG.md touched only by trailer-less docs(changelog) commits as the lead\'s', () => {
  const commit = (sha, subject, body = subject) => ({ sha, subject, body });
  const lead = new Map([['CHANGELOG.md', [commit('abcdef1234', 'docs(changelog): record x')]]]);
  assert.deepEqual(splitFixOnlyPaths(['CHANGELOG.md'], lead), { strays: [], fixOnly: [], lead: [{ path: 'CHANGELOG.md', shas: ['abcdef1'] }] });
  const mixed = new Map([['CHANGELOG.md', [commit('abcdef1234', 'docs(changelog): record x'), commit('9999999999', 'feat: add', 'feat: add\n\nPlan-task: plan/1')]]]);
  assert.deepEqual(splitFixOnlyPaths(['CHANGELOG.md'], mixed), { strays: ['CHANGELOG.md'], fixOnly: [], lead: [] });
  const other = new Map([['NOTES.md', [commit('abcdef1234', 'docs(changelog): record x')]]]);
  assert.deepEqual(splitFixOnlyPaths(['NOTES.md'], other).strays, ['NOTES.md']);
});

test('runnableProof reads a plain Proof as its command, and a backticked one as prose', () => {
  assert.equal(runnableProof('node -e "process.exit(0)"'), 'node -e "process.exit(0)"');
  assert.equal(runnableProof('npm run validate, whose output holds no `[FAIL]` line'), null);
  assert.equal(runnableProof(null), null);
});

test('successCriterionPasses needs exit 0 and, when a SUMMARY line is printed, a clean one', () => {
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0\n' }), true);
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=1 WARN=0 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: true, output: 'SUMMARY PASS=3 FAIL=0 WARN=2 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: false, output: 'SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0\n' }), false);
  assert.equal(successCriterionPasses({ ok: true, output: 'all green, no SUMMARY here\n' }), true);
  assert.equal(successCriterionPasses({ ok: true, output: '' }), true);
  assert.equal(successCriterionPasses({ ok: false, output: '' }), false);
});

test('summaryLine reads the last line starting SUMMARY, or null', () => {
  assert.equal(summaryLine('SUMMARY PASS=1 FAIL=1 WARN=0 UNRUN=0\nSUMMARY PASS=2 FAIL=0 WARN=0 UNRUN=0\r\n'), 'SUMMARY PASS=2 FAIL=0 WARN=0 UNRUN=0');
  assert.equal(summaryLine('  SUMMARY indented\nno SUMMARY at start\n'), null);
});

test('outputTail keeps the last 20 non-empty lines, each cut to 300 characters and indented', () => {
  const output = Array.from({ length: 25 }, (_, index) => `line ${index}`).join('\n\n');
  const tail = outputTail(`${output}\r\n${'x'.repeat(400)}\n`);
  assert.equal(tail.length, 20);
  assert.equal(tail[0], '  line 6');
  assert.equal(tail.at(-2), '  line 24');
  assert.equal(tail.at(-1), `  ${'x'.repeat(300)}`);
  assert.deepEqual(outputTail(''), []);
});

test('criterionCommand reads the first backticked command, or null', () => {
  assert.equal(criterionCommand('`npm test` passes, as does `npm run lint`.'), 'npm test');
  assert.equal(criterionCommand('the suite passes'), null);
  assert.equal(criterionCommand(null), null);
});

test('unmarkedMcpTool names a snake_case first word the shell could not find, else null', () => {
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 127, output: 'sh: run_playtest: command not found\n' }), 'run_playtest');
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 127, output: 'sh: 1: run_playtest: not found\n' }), 'run_playtest');
  assert.equal(unmarkedMcpTool('run_playtest mode=play', { code: 1, output: 'sh: run_playtest: command not found\n' }), null);
  assert.equal(unmarkedMcpTool('playtest mode=play', { code: 127, output: 'sh: playtest: command not found\n' }), null);
  assert.equal(unmarkedMcpTool('run_ok && missing_tool', { code: 127, output: 'sh: missing_tool: command not found\n' }), null);
});

test('filesUnderGlobs reads node --test files as covered only when every file matches a suite glob', () => {
  const globs = ['tests/*.test.mjs'];
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs', globs), true);
  assert.equal(filesUnderGlobs('node --test ./tests/a.test.mjs tests/b.test.mjs', globs), true);
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs lib/b.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/sub/a.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/*.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test --watch tests/a.test.mjs', globs), false);
  assert.equal(filesUnderGlobs('node --test', globs), false);
  assert.equal(filesUnderGlobs('node --test tests/a.test.mjs', []), false);
  assert.equal(filesUnderGlobs('node --test lib/deep/a.test.mjs', ['lib/**/*.test.mjs']), true);
});

test('taskStates and manualChecks read the done tasks and the Manual checks bullets', () => {
  const tasks = [{ number: 1, title: 'a' }, { number: 2, title: 'b' }];
  assert.deepEqual(taskStates(tasks, new Set([1])), [{ task: 1, title: 'a', done: true }, { task: 2, title: 'b', done: false }]);
  assert.deepEqual(manualChecks({ 'Manual checks': '- Click the badge.\n- Check the account.' }), ['Click the badge.', 'Check the account.']);
  assert.deepEqual(manualChecks({}), []);
});

test('commandLine rebuilds the command as SKILL.md runs it, quoting only words a shell would split', () => {
  assert.equal(
    commandLine(['/usr/bin/node', '/plugin dir/verify.mjs', '--plan', 'docs/plan.md', '--root', '.', '--check-command', 'npm test']),
    'node "/plugin dir/verify.mjs" --plan docs/plan.md --root . --check-command "npm test"'
  );
  assert.equal(commandLine(['node', '/v.mjs', '--check-command', 'echo "$HOME"']), 'node "/v.mjs" --check-command "echo \\"\\$HOME\\""');
});

test('unlandedBlame blames unlanded tasks only when no line blames landed work', () => {
  const tasks = [
    { number: 1, files: [{ path: 'src/case.js' }, { path: 'test/case.test.js' }] },
    { number: 2, files: [{ path: 'src/title-case.js' }] }
  ];
  const landed = new Set([1]);
  const missing = "fail title-case: Cannot find module '/x/src/title-case.js' imported from /x/prove.mjs";
  assert.deepEqual(unlandedBlame(tasks, landed, `pass case: test/case.test.js\n${missing}\n# fail 1`), [2]);
  assert.deepEqual(unlandedBlame(tasks, landed, `${missing}\n    at load (/x/src/case.js:3:1)`), []);
  assert.deepEqual(unlandedBlame(tasks, landed, `${missing}\nnot ok 1 - case uppercases`), []);
  assert.deepEqual(unlandedBlame(tasks, landed, 'fail: check failed'), []);
  assert.deepEqual(unlandedBlame(tasks, new Set([1, 2]), missing), []);
});

test('unchangedFiles names each Files path no commit changed, reading a glob and a folder as covering their matches', () => {
  const files = (...paths) => paths.map((file) => ({ path: file }));
  assert.deepEqual(unchangedFiles(files('src/a.js', 'src/b.js'), ['src/a.js']), ['src/b.js']);
  assert.deepEqual(unchangedFiles(files('src/a.js'), ['src/a.js']), []);
  assert.deepEqual(unchangedFiles(files('src/*.js', 'docs/'), ['src/x.js', 'docs/a.md']), []);
  assert.deepEqual(unchangedFiles(files('src/*.js', 'docs/'), ['lib/x.js']), ['src/*.js', 'docs/']);
});

test('isTestFirst reads a Risk: field, or a fix listing a test file, and nothing else', () => {
  const task = (title, risk, ...paths) => ({ title, risk, files: paths.map((file) => ({ path: file })) });
  assert.equal(isTestFirst(task('feat(app): x', 'security boundary', 'src/a.js')), true);
  assert.equal(isTestFirst(task('fix(app): x', null, 'src/a.js', 'tests/a.test.mjs')), true);
  assert.equal(isTestFirst(task('fix(app): x', null, 'src/a.js')), false);
  assert.equal(isTestFirst(task('feat(app): x', null, 'tests/a.test.mjs')), false);
});

test('weakenedTests names the file and line of a removed assertion and of an added skip or only, in test files only', () => {
  const patch = [
    'diff --git a/tests/a.test.mjs b/tests/a.test.mjs', '--- a/tests/a.test.mjs', '+++ b/tests/a.test.mjs',
    '@@ -4,2 +4,2 @@', '-  assert.equal(a, 1);', '-  expect(b).toBe(2);', '+  assert.equal(a, 3);', '+  other();',
    '@@ -20,0 +21,2 @@', "+it.skip('later', () => {});", "+describe.only('x', () => {});",
    'diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js',
    '@@ -1,1 +1,1 @@', '-assert(ready);', '+it.skip(ready);', ''
  ].join('\n');
  assert.deepEqual(weakenedTests(patch), [
    'tests/a.test.mjs:4 removed `assert.equal(a, 1);`',
    'tests/a.test.mjs:5 removed `expect(b).toBe(2);`',
    "tests/a.test.mjs:21 added `it.skip('later', () => {});`",
    "tests/a.test.mjs:22 added `describe.only('x', () => {});`"
  ]);
  const moved = ['--- a/tests/a.test.mjs', '+++ b/tests/a.test.mjs', '@@ -1,1 +0,0 @@', '-  assert.ok(x);', '@@ -9,0 +9,1 @@', '+assert.ok(x);', ''].join('\n');
  assert.deepEqual(weakenedTests(moved), []);
});

test('silencedChecks names the file and line of an added suppression, in any file but prose', () => {
  const patch = [
    'diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js',
    '@@ -3,1 +3,2 @@', '-const a = 1;', '+// eslint-disable-next-line no-unused-vars', '+const a = 2;',
    'diff --git a/src/b.py b/src/b.py', '--- a/src/b.py', '+++ b/src/b.py',
    '@@ -0,0 +7,1 @@', '+x = f()  # type: ignore',
    'diff --git a/src/c.ts b/src/c.ts', '--- a/src/c.ts', '+++ b/src/c.ts',
    '@@ -5,1 +5,1 @@', '-// @ts-ignore', '+const ok = 1;',
    'diff --git a/docs/a.md b/docs/a.md', '--- a/docs/a.md', '+++ b/docs/a.md',
    '@@ -1,0 +1,1 @@', '+Write `eslint-disable` to silence a rule.', ''
  ].join('\n');
  assert.deepEqual(silencedChecks(patch), [
    'src/a.js:3 silenced `// eslint-disable-next-line no-unused-vars`',
    'src/b.py:7 silenced `x = f()  # type: ignore`'
  ]);
});
