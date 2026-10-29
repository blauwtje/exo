import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { git, gitRepository } from './harness.mjs';

const finding = (quote, file = 'src/a.js') => [
  `${file}:2-3; defect; swallowed failure; catch drops error; fix`,
  '  Probe: true',
  '  Class: swallowed failure',
  '  Sweep: true',
  ...(quote === null ? [] : [`  Quote: ${quote}`]),
  ''
].join('\n');

const checkout = async () => {
  const root = await gitRepository({ 'src/a.js': 'try {\n  run();\n} catch (error) {\n  ignore();\n}\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  return root;
};

const merge = (root, text, name = 'review-branch') => mergeReviews([{ name, text: `FINDINGS\n${text}` }], new Map(), null, root);

test('a fix finding whose quote is in the file at HEAD, whitespace collapsed, stays a fix', async () => {
  const merged = merge(await checkout(), finding('`} catch (error) {   ignore();`'));
  assert.equal(merged.counts.fix, 1);
  assert.deepEqual(merged.quoteDemoted, []);
  assert.equal(merged.findings[0].state, 'open');
});

test('a fix finding whose quote is not in the file is demoted to report and named', async () => {
  const merged = merge(await checkout(), finding('`catch (error) { swallow(); }`'));
  assert.equal(merged.counts.fix, 0);
  assert.equal(merged.demoted, 0);
  assert.deepEqual(merged.quoteDemoted, ['src/a.js:2-3']);
  assert.deepEqual(merged.shown, ['src/a.js:2-3; defect; swallowed failure; catch drops error; report']);
  assert.equal(merged.findings[0].state, 'reported');
});

test('a fix finding whose file is absent at HEAD is demoted', async () => {
  const merged = merge(await checkout(), finding('`ignore();`', 'src/new.js'));
  assert.deepEqual(merged.quoteDemoted, ['src/new.js:2-3']);
});

test('a fix finding with no Quote line keeps today handling', async () => {
  const merged = merge(await checkout(), finding(null));
  assert.equal(merged.counts.fix, 1);
  assert.deepEqual(merged.quoteDemoted, []);
});

test('no root skips the quote check', () => {
  const merged = mergeReviews([{ name: 'review-branch', text: `FINDINGS\n${finding('`absent`')}` }]);
  assert.equal(merged.counts.fix, 1);
});

test('the code-rules report is exempt from the quote check', async () => {
  const merged = merge(await checkout(), finding('`absent`'), 'code-rules');
  assert.equal(merged.counts.fix, 1);
  assert.deepEqual(merged.quoteDemoted, []);
});

test('a Quote line is a detail line, not an unread finding', async () => {
  const merged = merge(await checkout(), finding('`the defect is a fix`'));
  assert.equal(merged.unread, 0);
});
