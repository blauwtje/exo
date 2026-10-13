// Behavioral tests for the ui-design skill scripts. No dependency beyond node:*.
// Every fixture lives under the OS temp directory and is removed afterwards;
// nothing is written inside the repository.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applyNotesTable, notesTable, omitAdvisory, summaryLines } from '../skills/design-ui/scripts/check-ui.mjs';
import { fixture, run, script } from './harness.mjs';

describe('check-ui.mjs notes table', () => {
  it('collapses two findings of one type into one notes entry with no threshold/note on the findings', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');
    await fs.writeFile(path.join(root, 'b.css'), '.b { transition: all 100ms linear; }\n');

    const result = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const transitions = report.static.findings.filter((entry) => entry.type === 'transition-all');
    assert.equal(transitions.length, 2);
    assert.ok(transitions.every((entry) => !('threshold' in entry) && !('note' in entry)));
    assert.ok(report.notes['transition-all'].threshold);
    assert.ok(report.notes['transition-all'].note);
  });

  it('keeps a dynamic note on the finding it differs from in the table', () => {
    const definiteNote = 'text below the AA contrast minimum';
    const potentialNote = 'effective background is composited, so the ratio is indeterminate';
    const definite = {
      type: 'contrast-large-text', confidence: 'definite', selector: 'a', measured: '2:1',
      threshold: '3:1', note: definiteNote
    };
    const potential = {
      type: 'contrast-large-text', confidence: 'potential', selector: 'b', measured: '2:1',
      threshold: '3:1', note: potentialNote
    };
    const findings = [definite, potential];
    const table = applyNotesTable(findings);
    assert.deepEqual(table['contrast-large-text'], { threshold: '3:1', note: definiteNote });
    assert.equal(definite.threshold, undefined);
    assert.equal(definite.note, undefined);
    assert.equal(potential.threshold, undefined);
    assert.equal(potential.note, potentialNote);
  });

  it('reconstructs a finding from the table lossless', () => {
    const entries = [
      { type: 't', confidence: 'definite', selector: 'a', measured: '1', threshold: 'T', note: 'N' },
      { type: 't', confidence: 'definite', selector: 'b', measured: '2', threshold: 'T', note: 'other' }
    ];
    const table = notesTable(entries.map((entry) => ({ ...entry })));
    const stripped = entries.map((entry) => ({ ...entry }));
    applyNotesTable(stripped);
    const reconstructed = stripped.map((entry) => ({
      ...entry,
      threshold: entry.threshold ?? table[entry.type].threshold,
      note: entry.note ?? table[entry.type].note
    }));
    assert.deepEqual(reconstructed, entries);
  });

  it('prints one total line by default, and writes the full report and its per-type lines to --out', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '.a { transition: all 200ms ease; }',
      '.b { transition: all 100ms linear; }',
      '.c { color: #ff0055; }'
    ].join('\n'));
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.equal(lines[0], `static=ok rendered=unavailable findings=3 shown=2 blocking=2 omitted=0 report=${reportFile}`);
    assert.equal(lines.length, 1);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.deepEqual(report.typeSummary, ['transition-all 2 blocking=2']);
    assert.equal(report.static.findings.length, 3);
  });

  it('prints at most two stdout lines however many types it finds, and keeps the per-type lines in the report file', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '.a { transition: all 200ms ease; }',
      '.b { transition: all 100ms linear; }'
    ].join('\n'));
    await fs.writeFile(path.join(root, 'a.html'), '<html><body><img src="x.png"><svg></svg></body></html>\n');
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.ok(lines.length <= 2, `stdout held ${lines.length} lines:\n${result.stdout}`);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.ok(report.typeSummary.length >= 2, `typeSummary: ${JSON.stringify(report.typeSummary)}`);
    assert.ok(report.typeSummary.includes('transition-all 2 blocking=2'));
  });

  it('names a temp report file when --out is not given', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), '.a { transition: all 200ms ease; }\n');

    const result = await run(script('check-ui.mjs'), ['--source', root]);
    assert.equal(result.code, 0, result.stderr);
    const reportFile = /report=(\S+)$/.exec(result.stdout.split('\n')[0])[1];
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.equal(report.static.findings[0].type, 'transition-all');
    await fs.rm(path.dirname(reportFile), { recursive: true, force: true });
  });

  it('leaves media-query px out unless --all, and keeps a rule px in the same line', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '@media (min-width: 768px) {',
      '  .a { display: grid; }',
      '}',
      '@container (max-width: 40px) { .b { padding: 32px; } }'
    ].join('\n'));

    const types = (report) => report.static.findings.map((entry) => `${entry.type} ${entry.measured}`);
    const plain = await run(script('check-ui.mjs'), ['--json', '--source', root]);
    assert.equal(plain.code, 0, plain.stderr);
    assert.deepEqual(types(JSON.parse(plain.stdout)), ['raw-value-in-component-rule 32px']);
    const all = await run(script('check-ui.mjs'), ['--json', '--all', '--source', root]);
    assert.deepEqual(types(JSON.parse(all.stdout)), [
      'raw-value-in-media-query 768px', 'raw-value-in-media-query 40px', 'raw-value-in-component-rule 32px'
    ]);
  });

  it('writes every finding to the report file without --all, while the summary omits the advisory ones', async () => {
    const root = await fixture();
    await fs.writeFile(path.join(root, 'a.css'), [
      '@media (min-width: 768px) {',
      '  .a { display: grid; }',
      '}',
      '@container (max-width: 40px) { .b { padding: 32px; } }'
    ].join('\n'));
    const reportFile = path.join(root, 'report.json');

    const result = await run(script('check-ui.mjs'), ['--source', root, '--out', reportFile]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout.split('\n')[0], / findings=1 .* omitted=2 /);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.deepEqual(report.static.findings.map((entry) => `${entry.type} ${entry.measured}`), [
      'raw-value-in-media-query 768px', 'raw-value-in-media-query 40px', 'raw-value-in-component-rule 32px'
    ]);
  });

  it('omitAdvisory drops target-size-enhanced from every list and counts it', () => {
    const enhanced = { type: 'target-size-enhanced', confidence: 'potential', selector: 'a', measured: '30×30 CSS px' };
    const minimum = { type: 'target-size-minimum', confidence: 'definite', selector: 'b', measured: '20×20 CSS px' };
    const report = {
      static: { status: 'ok', findings: [] },
      rendered: {
        status: 'ok',
        fixed: { findings: [enhanced] },
        viewports: { '390x844': { status: 'ok', findings: [enhanced, minimum] } }
      }
    };
    assert.equal(omitAdvisory(report), 2);
    assert.deepEqual(report.rendered.fixed.findings, []);
    assert.deepEqual(report.rendered.viewports['390x844'].findings, [minimum]);
  });

  it('summaryLines puts the most blocking type first and hides ignored definite findings', () => {
    const contrast = { type: 'contrast-normal-text', confidence: 'definite', selector: 'p' };
    const ignoredCopy = { type: 'placeholder-copy', confidence: 'definite', selector: 'src/a.html:3' };
    const transition = { type: 'transition-all', confidence: 'definite', selector: 'src/a.css:1' };
    const findings = [transition, ignoredCopy, contrast];
    const report = {
      static: { status: 'ok' }, rendered: { status: 'ok' },
      comparison: { counts: { new: 1, predating: 1, ignored: 1 } }
    };
    const lines = summaryLines({
      report, findings, comparison: { blocking: [contrast] },
      ignoreEntries: [{ type: 'placeholder-copy', file: 'src/a.html', reason: 'fixture' }],
      omitted: 4, reportFile: null
    });
    assert.deepEqual(lines, {
      total: 'static=ok rendered=ok findings=3 shown=2 blocking=1 omitted=4 new=1 predating=1 ignored=1',
      types: ['contrast-normal-text 1 blocking=1', 'transition-all 1 blocking=0']
    });
  });
});
