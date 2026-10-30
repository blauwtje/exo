import assert from 'node:assert/strict';
import test from 'node:test';
import { agentArguments, dryRunLine, gradedSession, gradeReturn, mentionedFiles, plannedBriefs, resultOfStream, summarize } from '../benchmarks/locate-recall.mjs';

const FILES = ['lib/a.mjs', 'lib/b.mjs', 'hooks/c.mjs', 'tests/a.test.mjs', 'tests/hooks/c.mjs', 'docs/README.md', 'lib/README.md'];
const BRIEF = { id: 'x', expected: ['lib/a.mjs', 'hooks/c.mjs', 'tests/a.test.mjs'], acceptable: ['lib/b.mjs'] };

test('mentionedFiles takes a full path or a unique basename and ignores a path suffix of another file', () => {
  assert.deepEqual(mentionedFiles('see lib/a.mjs and c.mjs', FILES), ['lib/a.mjs']);
  assert.deepEqual(mentionedFiles('see a.test.mjs', FILES), ['tests/a.test.mjs']);
  assert.deepEqual(mentionedFiles('see tests/hooks/c.mjs', FILES), ['tests/hooks/c.mjs']);
  assert.deepEqual(mentionedFiles('see README.md', FILES), []);
});

test('gradeReturn scores recall on expected files and precision on expected plus acceptable', () => {
  const grade = gradeReturn('lib/a.mjs, lib/b.mjs, docs/README.md, hooks/c.mjs', BRIEF, FILES);
  assert.equal(grade.recall, 2 / 3);
  assert.equal(grade.precision, 3 / 4);
  assert.deepEqual(grade.missed, ['tests/a.test.mjs']);
  assert.deepEqual(gradeReturn('lib/a.mjs lib/README.md', BRIEF, FILES).extra, ['lib/README.md']);
});

test('gradeReturn gives null precision when no file is named', () => {
  const grade = gradeReturn('nothing found', BRIEF, FILES);
  assert.equal(grade.recall, 0);
  assert.equal(grade.precision, null);
});

test('resultOfStream reads the last result event', () => {
  const stream = [JSON.stringify({ type: 'assistant' }), JSON.stringify({ type: 'result', result: 'lib/a.mjs', total_cost_usd: 0.02, num_turns: 4 })].join('\n');
  assert.deepEqual(resultOfStream(stream), { text: 'lib/a.mjs', cost_usd: 0.02, numTurns: 4, error: undefined });
  assert.equal(resultOfStream('not json'), null);
});

test('gradedSession records an error without grading and a return with both grades', () => {
  const failed = gradedSession({ brief: BRIEF, model: 'haiku', run: 1, outcome: { error: 'timeout', durationMs: 5 }, files: FILES });
  assert.equal(failed.error, 'timeout');
  assert.equal(failed.recall, undefined);
  const outcome = { text: 'lib/a.mjs hooks/c.mjs', reports: ['tests/a.test.mjs lib/a.mjs'], cost_usd: 0.01, durationMs: 2000 };
  const graded = gradedSession({ brief: BRIEF, model: 'sonnet', run: 2, outcome, files: FILES });
  assert.equal(graded.recall, 2 / 3);
  assert.equal(graded.reportRecall, 2 / 3);
});

test('summarize averages per model and leaves out errored sessions from the grades', () => {
  const sessions = [
    { model: 'haiku', recall: 1, precision: 0.5, reportRecall: 1, cost_usd: 0.01, durationMs: 10_000 },
    { model: 'haiku', recall: 0, precision: 0.5, reportRecall: 0, cost_usd: 0.01, durationMs: 20_000 },
    { model: 'haiku', error: 'timeout', cost_usd: null, durationMs: 30_000 },
    { model: 'sonnet', recall: 1, precision: 1, reportRecall: 1, cost_usd: 0.05, durationMs: 40_000 }
  ];
  const summary = summarize(sessions, ['haiku', 'sonnet']);
  assert.equal(summary.haiku.recall, 0.5);
  assert.equal(summary.haiku.errors, 1);
  assert.equal(summary.haiku.cost_usd, 0.02);
  assert.equal(summary.sonnet.meanWallS, 40);
});

test('plannedBriefs picks the quick set, every brief, or one by id', () => {
  const fixture = { briefs: [{ id: 'a', quick: true }, { id: 'b', quick: false }] };
  assert.deepEqual(plannedBriefs(fixture, {}).map((entry) => entry.id), ['a']);
  assert.deepEqual(plannedBriefs(fixture, { full: true }).map((entry) => entry.id), ['a', 'b']);
  assert.deepEqual(plannedBriefs(fixture, { brief: 'b' }).map((entry) => entry.id), ['b']);
  assert.throws(() => plannedBriefs(fixture, { brief: 'z' }), /not in the fixture/);
});

test('dryRunLine multiplies the session count by the recorded median', () => {
  assert.equal(dryRunLine(6, [{ cost_usd: 0.1 }, { cost_usd: 0.3 }]), 'dry-run: 6 sessions x median $0.2000 = $1.20');
  assert.equal(dryRunLine(6, []), 'dry-run: 6 sessions, cost unknown');
});

test('agentArguments passes the prompt last after -- so a leading dash stays positional', () => {
  const base = { agent: 'exo:run-unit', model: 'haiku', effort: 'low', pluginDir: '/plugin' };
  for (const prompt of ['- Plan: x', 'plain prompt']) {
    const args = agentArguments({ ...base, prompt });
    assert.equal(args.at(-1), prompt);
    assert.equal(args.at(-2), '--');
    assert.equal(args.filter((arg) => arg === prompt).length, 1);
    assert.deepEqual(args.slice(0, 3), ['-p', '--agent', 'exo:run-unit']);
  }
});
