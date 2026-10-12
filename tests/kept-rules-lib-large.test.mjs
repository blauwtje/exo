import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confineRefusal, sandboxProfile } from '../lib/confine-claude.mjs';
import { parallelValueValid, planTaskTrailer } from '../lib/plan-tasks.mjs';
import { isSmall, parseNumstat } from '../lib/size-facts.mjs';

test('plan tasks: a Parallel value is none, every task or a task list, with an optional period', () => {
  assert.ok(parallelValueValid('none'));
  assert.ok(parallelValueValid('every task.'));
  assert.ok(parallelValueValid('Tasks 1 and 2'));
  assert.ok(parallelValueValid('Task 1, 2'));
  assert.equal(parallelValueValid('see the notes for 3'), false);
});

test('plan tasks: the trailer names the plan, so stacked plans keep their tasks apart', () => {
  assert.equal(planTaskTrailer('strip', 5), 'Plan-task: strip/5');
});

test('size facts: a binary line counts as a file with no changed lines', () => {
  assert.deepEqual(parseNumstat('3\t2\ta.mjs\n-\t-\timage.png\n'), { files: 2, changedLines: 5 });
});

test('size facts: small is at most two files, under 80 lines and no added dependency', () => {
  assert.ok(isSmall({ files: 2, changedLines: 79, dependencyAdded: false }));
  assert.equal(isSmall({ files: 3, changedLines: 10, dependencyAdded: false }), false);
  assert.equal(isSmall({ files: 1, changedLines: 80, dependencyAdded: false }), false);
  assert.equal(isSmall({ files: 1, changedLines: 10, dependencyAdded: true }), false);
});

test('confine claude: only Windows is refused', () => {
  assert.ok(confineRefusal('win32'));
  assert.equal(confineRefusal('darwin'), undefined);
  assert.equal(confineRefusal('linux'), undefined);
});

test('confine claude: a quote or backslash in a root cannot end the profile string', () => {
  const profile = sandboxProfile(['/tmp/a"b\\c']);
  assert.ok(profile.includes('/tmp/a\\"b\\\\c'));
});
