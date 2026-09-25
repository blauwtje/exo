// Behavioral tests for the checkpoint.mjs orchestration script.

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { criticEvidence, summaryLines } from '../skills/design-ui/scripts/checkpoint.mjs';
import { fixture, run, script } from './harness.mjs';

function findingsFixture(count, { type = 'crowded-controls', confidence = 'definite' } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    type, confidence, selector: `.thing-${index}`, measured: `${index}px`
  }));
}

describe('checkpoint summaryLines', () => {
  it('caps at 3 summary lines and 5 BLOCK lines for 7 blocking findings', () => {
    const checkUi = {
      static: { findings: findingsFixture(7) },
      rendered: { fixed: { findings: [] }, viewports: {} }
    };
    const lines = summaryLines({
      stage: 'post-build',
      renders: { '390x844': 'a.png', '1440x900': 'b.png' },
      checkUi,
      renderDelta: { '390x844': null, '1440x900': null },
      files: ['a.png', 'b.png'],
      failed: []
    });
    const blockLines = lines.filter((line) => line.startsWith('BLOCK'));
    assert.equal(lines.length - blockLines.length, 3);
    assert.equal(blockLines.length, 5);
  });
});

describe('checkpoint criticEvidence', () => {
  it('sets baselineRenders null and renderDelta values null with no baseline', () => {
    const checkUi = { static: { findings: [] }, rendered: { fixed: { findings: [] }, viewports: {} } };
    const evidence = criticEvidence({
      stage: 'post-build',
      contract: null,
      checkUi,
      renders: { '390x844': 'a.png', '1440x900': 'b.png' },
      baselineRenders: null,
      renderDelta: { '390x844': null, '1440x900': null },
      styles: null,
      failed: []
    });
    assert.equal(evidence.baselineRenders, null);
    assert.equal(evidence.renderDelta['390x844'], null);
    assert.equal(evidence.renderDelta['1440x900'], null);
  });
});

describe('checkpoint CLI', () => {
  it('rejects an unknown --stage with exit 2', async () => {
    const directory = await fixture();
    const result = await run(script('checkpoint.mjs'), [
      '--run', directory, '--stage', 'nope', '--url', pathToFileURL(path.join(directory, 'index.html')).href
    ]);
    assert.equal(result.code, 2);
  });

  it('exits 1 and names capture in failed= when no browser is available', async () => {
    const directory = await fixture();
    const url = pathToFileURL(path.join(directory, 'index.html')).href;
    const result = await run(script('checkpoint.mjs'), [
      '--run', path.join(directory, 'run'), '--stage', 'baseline', '--url', url
    ], { env: { UI_DESIGN_TEST_DISABLE_BROWSER_DISCOVERY: '1', CHROME_PATH: '' } });
    assert.equal(result.code, 1);
    const [firstLine] = result.stdout.split('\n');
    assert.match(firstLine, /^stage=baseline/);
    assert.match(firstLine, /failed=[^ ]*capture/);
  });
});
