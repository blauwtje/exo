import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stopOutput } from './proof-check.mjs';

// The four report shapes of issue #94: a build turn that changes no code.
function reportOutput(reportText) {
  const rows = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', id: 'toolu_skill', input: { skill: 'build' } }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: reportText }] } }
  ];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proof-check-94-')), 'transcript.jsonl');
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return stopOutput({ transcript_path: file });
}

test('#94: a plain Unverified line without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\nUnverified: no exo checks run; git pull changes no code.'), '');
});

test('#94: a bold Unverified label without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\n**Unverified:** no exo checks run; git pull changes no code.'), '');
});

test('#94: a bulleted Unverified line without a Done claim passes', () => {
  assert.equal(reportOutput('Pulled 3 commits, main up to date.\n- Unverified: no checks run.'), '');
});

test('#94: a report with no Proof and no Unverified line never says it claims Done', () => {
  const result = JSON.parse(reportOutput('Pulled 3 commits.'));
  assert.equal(result.decision, 'block');
  assert.doesNotMatch(result.reason, /claims Done/);
  assert.match(result.reason, /Unverified/);
});

test('#94: a Done report with no Proof line still names the Done claim', () => {
  const result = JSON.parse(reportOutput('**Done:** pulled 3 commits.'));
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /claims Done/);
});
