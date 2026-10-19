import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { aggregate, gradeLine, gradeRun, linesForCase, parseCriteria } from '../skills/edit-skills/scripts/pressure-grade.mjs';

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

test('aggregate applies the threshold and reports the delta and no-skill-effect flag', () => {
  const run = ([caseFile, arm, n, ...passes]) => ({ case: caseFile, arm, run: n, lines: passes.map((pass) => ({ text: 't', pass, reason: '' })) });
  const grades = [
    run(['a.txt', 'with', 1, true]), run(['a.txt', 'with', 2, true]), run(['a.txt', 'with', 3, true]),
    run(['a.txt', 'without', 1, true]), run(['a.txt', 'without', 2, false]), run(['a.txt', 'without', 3, false]),
    run(['b.txt', 'with', 1, true]), run(['b.txt', 'with', 2, true, false]), run(['b.txt', 'with', 3, true]),
    run(['b.txt', 'without', 1, true]), run(['b.txt', 'without', 2, true]), run(['b.txt', 'without', 3, true])
  ];
  const [a, b] = aggregate(grades);
  assert.equal(a.pass, true);
  assert.ok(Math.abs(a.delta - 2 / 3) < 1e-9);
  assert.equal(a.noSkillEffect, false);
  assert.equal(b.pass, false);
  const [, loose] = aggregate(grades, { threshold: 0.6 });
  assert.equal(loose.pass, true);
  assert.equal(loose.noSkillEffect, true);
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
