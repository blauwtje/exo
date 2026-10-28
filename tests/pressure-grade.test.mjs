import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { aggregate, gradeLine, gradeRun, judgeClauses, lintCriteria, linesForCase, newcombe, parseCriteria, parseMargins, runsNeeded, verdictFor } from '../skills/edit-skills/scripts/pressure-grade.mjs';
import { regradeFolder } from '../skills/edit-skills/scripts/pressure.mjs';

const CRITERIA = `# x: criteria

Prose is context.

## Always

- Says hello. \`grade: answer =~ /hello/i\`
  - nested context bullet
- No shouting. \`grade: answer !~ /HEY/\`

## \`a-case.txt\`

- Writes notes. \`grade: file notes/*.md\`
- Tone is kind. \`grade: judge\`
`;

const ctxFor = (answer, dir, judge) => ({ answer, dir, judge });

test('parseCriteria scopes lines by case heading and keeps nested context', () => {
  const parsed = parseCriteria(CRITERIA);
  assert.deepEqual(parsed.map((group) => [group.case, group.lines.length]), [[null, 2], ['a-case.txt', 2]]);
  assert.equal(parsed[0].lines[0].text, 'Says hello.');
  assert.equal(parsed[0].lines[0].tag.kind, 'match');
  assert.equal(linesForCase(parsed, 'a-case.txt').length, 4);
  assert.equal(linesForCase(parsed, 'b.txt').length, 2);
});

test('parseCriteria rejects an untagged top-level bullet and a bad tag', () => {
  assert.throws(() => parseCriteria('- plain line\n'), /line 1.*no `grade/);
  assert.throws(() => parseCriteria('- x `grade: nonsense`\n'), /unknown grade tag/);
  assert.throws(() => parseCriteria('- x `grade: answer =~ /(/`\n'), /bad regex/);
});

test('deterministic graders check answer, files and commands in the case folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-grade-'));
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.writeFileSync(path.join(dir, 'notes', 'a.md'), 'x');
  const line = (tag) => parseCriteria(`- t \`grade: ${tag}\`\n`)[0].lines[0];
  const grade = (tag, answer = 'Hello there') => gradeLine(line(tag), ctxFor(answer, dir)).pass;
  assert.equal(grade('answer =~ /hello/i'), true);
  assert.equal(grade('answer =~ /hello/'), false);
  assert.equal(grade('answer !~ /bye/'), true);
  assert.equal(grade('file notes/*.md'), true);
  assert.equal(grade('file nope/*'), false);
  assert.equal(grade('no file nope/*'), true);
  assert.equal(grade('no file notes/*.md'), false);
  assert.equal(grade('run test -f notes/a.md'), true);
  assert.equal(grade('run test -f missing'), false);
});

test('judge lines read PASS or FAIL from the judge and hide nothing but the arm', () => {
  const line = parseCriteria('- Tone is kind. `grade: judge`\n')[0].lines[0];
  let seen;
  const pass = gradeLine(line, ctxFor('answer text', '.', (prompt) => { seen = prompt; return 'PASS\nkind enough'; }));
  assert.deepEqual([pass.pass, pass.reason], [true, 'kind enough']);
  assert.match(seen, /Tone is kind\./);
  assert.match(seen, /answer text/);
  assert.equal(gradeLine(line, ctxFor('a', '.', () => 'FAIL\nrude')).pass, false);
  assert.equal(gradeLine(line, ctxFor('a', '.', () => 'maybe')).pass, false);
});

const run = ([caseFile, arm, n, ...passes]) => ({ case: caseFile, arm, run: n, lines: passes.map((pass) => ({ text: 't', pass, reason: '' })) });
const arms = (caseFile, withPasses, otherPasses, other = 'without') => [
  ...withPasses.map((pass, index) => run([caseFile, 'with', index + 1, pass])),
  ...otherPasses.map((pass, index) => run([caseFile, other, index + 1, pass]))
];

test('aggregate gives PASS, FAIL or INCONCLUSIVE from the interval of the pass-rate difference and the margin', () => {
  const [win, loss, tie] = aggregate([
    ...arms('win.txt', [true, true, true], [false, false, false]),
    ...arms('loss.txt', [false, false, false], [true, true, true]),
    ...arms('tie.txt', [true, true, true], [true, true, true])
  ]);
  assert.deepEqual([win.verdict, win.pass], ['PASS', true]);
  assert.deepEqual([loss.verdict, loss.pass], ['FAIL', false]);
  assert.deepEqual([tie.verdict, tie.pass], ['INCONCLUSIVE', false]);
  assert.equal(win.delta, 1);
  assert.ok(win.ci[0] > 0 && win.ci[1] <= 1);
  assert.ok(tie.ci[0] < -0.2 && tie.ci[1] > 0.2);
  assert.ok(tie.needed > 3);
  assert.equal(win.needed, null);
});

test('a 3 of 3 against 2 of 3 split is INCONCLUSIVE, not the FAIL a 100 percent bar printed', () => {
  const [result] = aggregate(arms('a.txt', [true, true, true], [true, true, false]));
  assert.equal(result.verdict, 'INCONCLUSIVE');
  const [bar] = aggregate(arms('a.txt', [true, true, false], [true, true, true]));
  assert.equal(bar.verdict, 'INCONCLUSIVE');
});

test('the margin decides where PASS and FAIL start, and a case margin beats the default', () => {
  const ci = newcombe(30, 30, 30, 30);
  assert.equal(verdictFor(ci, 0.2), 'PASS');
  assert.equal(verdictFor(ci, 0.05), 'INCONCLUSIVE');
  const grades = arms('a.txt', Array(30).fill(true), Array(30).fill(true));
  assert.equal(aggregate(grades)[0].verdict, 'PASS');
  assert.equal(aggregate(grades, { margin: 0.05 })[0].verdict, 'INCONCLUSIVE');
  assert.equal(aggregate(grades, { margin: 0.05, margins: new Map([['a.txt', 0.2]]) })[0].verdict, 'PASS');
  assert.equal(runsNeeded(1, 1, 0.2), 16);
});

test('newcombe interval of equal rates is symmetric about 0 and narrows with n', () => {
  const [low3, high3] = newcombe(3, 3, 3, 3);
  const [low30, high30] = newcombe(30, 30, 30, 30);
  assert.ok(Math.abs(low3 + high3) < 1e-9);
  assert.ok(high30 < high3);
});

test('a case with one arm keeps the single-arm threshold as its verdict', () => {
  const grades = [run(['a.txt', 'with', 1, true]), run(['a.txt', 'with', 2, true]), run(['a.txt', 'with', 3, false])];
  assert.equal(aggregate(grades)[0].verdict, 'FAIL');
  assert.equal(aggregate(grades, { threshold: 0.6 })[0].verdict, 'PASS');
  assert.equal(aggregate(grades)[0].ci, null);
});

test('PASS with an interval spanning 0 is flagged no skill effect, and judge instability is counted', () => {
  const same = Array(30).fill(true);
  const [flat] = aggregate(arms('a.txt', same, same));
  assert.equal(flat.noSkillEffect, true);
  const unstable = [{ case: 'a.txt', arm: 'with', run: 1, lines: [{ text: 't', pass: true, reason: '', unstable: true }] }];
  assert.equal(aggregate(unstable)[0].unstable, 1);
});

test('a contrast arm is compared like the without arm', () => {
  const [result] = aggregate(arms('a.txt', [true, true, true], [false, false, false], 'contrast'));
  assert.equal(result.comparison, 'contrast');
  assert.equal(result.verdict, 'PASS');
});

test('parseMargins reads a global and a case margin and parseCriteria keeps them out of judge context', () => {
  const md = 'margin: 0.15\n\n## a.txt\n\nmargin: 0.3\nNote.\n\n- J. `grade: judge`\n';
  const margins = parseMargins(md);
  assert.deepEqual([margins.get(null), margins.get('a.txt')], [0.15, 0.3]);
  assert.deepEqual(parseCriteria(md)[0].lines[0].context, ['Note.']);
  assert.throws(() => parseMargins('margin: 0\n'), /line 1.*margin/);
});

test('a judge line is graded by the majority of three votes and an uneven vote is flagged unstable', () => {
  const line = parseCriteria('- Kind. `grade: judge`\n')[0].lines[0];
  const replies = (...list) => { const queue = [...list]; return () => queue.shift(); };
  const split = gradeLine(line, ctxFor('a', '.', replies('PASS\nyes', 'FAIL\nno', 'PASS\nyes again')));
  assert.deepEqual([split.pass, split.votes, split.unstable], [true, [true, false, true], true]);
  assert.ok(Math.abs(split.agreement - 2 / 3) < 1e-9);
  const lost = gradeLine(line, ctxFor('a', '.', replies('FAIL\nbad', 'PASS\nok', 'FAIL\nbad too')));
  assert.deepEqual([lost.pass, lost.reason], [false, 'bad']);
  const calls = [];
  const sure = gradeLine(line, ctxFor('a', '.', (prompt) => { calls.push(prompt); return 'PASS\nok'; }));
  assert.deepEqual([calls.length, sure.agreement, sure.unstable], [3, 1, false]);
});

test('judge lines are not called when a deterministic line of the run failed', () => {
  const lines = parseCriteria('- Hi. `grade: answer =~ /hi/`\n- Kind. `grade: judge`\n')[0].lines;
  let calls = 0;
  const judge = () => { calls += 1; return 'PASS\nok'; };
  const blocked = gradeRun({ case: 'a.txt', arm: 'with', run: 1, lines, answer: 'no', dir: os.tmpdir(), judge });
  assert.deepEqual([calls, blocked.lines.map((line) => line.pass), blocked.lines[1].skipped], [0, [false, false], true]);
  const open = gradeRun({ case: 'a.txt', arm: 'with', run: 1, lines, answer: 'hi', dir: os.tmpdir(), judge });
  assert.deepEqual([calls, open.lines.map((line) => line.pass)], [3, [true, true]]);
});

test('lint flags a judge line with three clauses and passes one claim', () => {
  assert.equal(judgeClauses('The answer names `toCents` as the cause.'), 1);
  assert.equal(judgeClauses('Names the cause after the float product comes out low (for example 28.999), and names no other cause.'), 3);
  const md = '- One claim only. `grade: judge`\n- Names the cause after the product is low, and names no other cause. `grade: judge`\n- Cause and mechanism and exclusion. `grade: answer =~ /x/`\n';
  assert.deepEqual(lintCriteria(md), [{ line: 2, clauses: 3 }]);
});

test('--check prints a LINT line for a three-clause judge line and still exits 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-lint-'));
  const file = path.join(dir, 'c.md');
  fs.writeFileSync(file, '- Cause, and mechanism, and exclusion. `grade: judge`\n');
  const out = spawnSync('node', [path.resolve('skills/edit-skills/scripts/pressure-grade.mjs'), '--check', file], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /LINT .*c\.md:1: judge line has 3 clauses/);
});

test('gradeRun labels the lines with case, arm and run', () => {
  const { lines } = parseCriteria('- t `grade: answer =~ /x/`\n')[0];
  const grade = gradeRun({ case: 'a.txt', arm: 'with', run: 2, lines, answer: 'x', dir: '.' });
  assert.deepEqual([grade.case, grade.arm, grade.run, grade.lines[0].pass], ['a.txt', 'with', 2, true]);
});

test('--check parses a criteria file and exits 1 on an untagged bullet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-check-'));
  const script = path.resolve('skills/edit-skills/scripts/pressure-grade.mjs');
  const good = path.join(dir, 'good.md');
  const bad = path.join(dir, 'bad.md');
  fs.writeFileSync(good, CRITERIA);
  fs.writeFileSync(bad, '- no tag\n');
  const ok = spawnSync('node', [script, '--check', good], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /4 pass lines/);
  const fail = spawnSync('node', [script, '--check', bad], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /no `grade/);
});

test('--check takes several criteria files, names each and exits 1 if any fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-check-'));
  const script = path.resolve('skills/edit-skills/scripts/pressure-grade.mjs');
  const good = path.join(dir, 'good.md');
  const bad = path.join(dir, 'bad.md');
  fs.writeFileSync(good, CRITERIA);
  fs.writeFileSync(bad, '- no tag\n');
  const run = spawnSync('node', [script, '--check', good, bad], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /good\.md: .*4 pass lines/);
  assert.match(run.stderr, /bad\.md: .*no `grade/);
  const both = spawnSync('node', [script, '--check', good, good], { encoding: 'utf8' });
  assert.equal(both.status, 0);
});

test('parseCriteria treats a star or numbered top-level bullet like a dash bullet', () => {
  assert.throws(() => parseCriteria('* plain\n'), /line 1.*no `grade/);
  assert.throws(() => parseCriteria('1. plain\n'), /line 1.*no `grade/);
  const [group] = parseCriteria('* Says hi. `grade: answer =~ /hi/`\n');
  assert.equal(group.lines[0].text, 'Says hi.');
});

test('parseCriteria gives a case prose to every line of that case and nested lines to their bullet only', () => {
  const parsed = parseCriteria([
    '## a.txt', '', 'Since `toCents` floors.', '', '- One. `grade: judge`', '  - nested one', '- Two. `grade: judge`', '', 'Baseline note.', '', '## b.txt', '', '- Three. `grade: judge`', ''
  ].join('\n'));
  const [one, two] = parsed[0].lines;
  assert.deepEqual(one.context, ['Since `toCents` floors.', 'Baseline note.', '- nested one']);
  assert.deepEqual(two.context, ['Since `toCents` floors.', 'Baseline note.']);
  assert.deepEqual(parsed[1].lines[0].context, []);
});

test('a parsed regex tag keeps its source and flags and no compiled copy', () => {
  const [group] = parseCriteria('- x `grade: answer =~ /a+/i`\n');
  assert.equal('regex' in group.lines[0].tag, false);
  assert.equal(group.lines[0].tag.source, 'a+');
});

test('gradeRun fails a judge line whose judge call throws instead of rejecting the run', () => {
  const lines = parseCriteria('- Kind. `grade: judge`\n- Hi. `grade: answer =~ /hi/`\n')[0].lines;
  const judge = () => { throw new Error('judge call failed: boom'); };
  const graded = gradeRun({ case: 'a.txt', arm: 'with', run: 1, lines, answer: 'hi', dir: os.tmpdir(), judge });
  assert.deepEqual(graded.lines.map((line) => line.pass), [false, true]);
  assert.match(graded.lines[0].reason, /boom/);
});

test('parseCriteria keeps unindented prose after a bullet as its context when no case heading scopes it', () => {
  const [group] = parseCriteria('- A. `grade: judge`\n\nNote.\n');
  assert.deepEqual(group.lines[0].context, ['Note.']);
});

test('self-test: regrading a good and a bad reference answer passes every line of the good and fails the bad, under a stub judge', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-selftest-'));
  try {
    const criteriaFile = path.join(dir, 'criteria.md');
    fs.writeFileSync(criteriaFile, '- Names the cause. `grade: answer =~ /toCents/`\n- Gives no fix before the cause. `grade: answer !~ /^Fix:/`\n- Explains the mechanism. `grade: judge`\n');
    fs.writeFileSync(path.join(dir, 'claude-sonnet-4-low-with-1.md'), 'The cause is toCents: it floors the product, so 29 comes out as 28.');
    fs.writeFileSync(path.join(dir, 'claude-sonnet-4-low-without-1.md'), 'Fix: round the value.');
    const judge = (prompt) => (/floors the product/.test(prompt) ? 'PASS\nexplains it' : 'FAIL\nno mechanism');
    const runs = regradeFolder(dir, { promptFile: 'a.txt', grade: { criteriaFile, votes: 1 }, judge })['claude-sonnet-4:low'];
    const [good, bad] = ['with', 'without'].map((arm) => runs.find((graded) => graded.arm === arm));
    assert.deepEqual(good.lines.map((line) => line.pass), [true, true, true]);
    assert.deepEqual(bad.lines.map((line) => line.pass), [false, false, false]);
    assert.equal(bad.lines[2].skipped, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
