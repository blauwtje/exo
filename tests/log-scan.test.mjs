// The log scan hook adds a note of at most 5 lines when a Bash command names,
// or a Read opens, a long log file, only with the `log_scan` setting on. The
// log is the one the context-guards seed's report writes to stderr.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../hooks/log-scan.mjs', import.meta.url));
const SEED = fileURLToPath(new URL('../benchmarks/value/context-guards/seed/', import.meta.url));

let work;
let reportLog;

before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-log-scan-'));
  reportLog = path.join(work, 'report.log');
  const run = spawnSync(process.execPath, [
    'bin/report.mjs', '--transactions', 'data/transactions-2026-03.csv', '--fx', 'data/fx-2026-03.csv', '--merchants', 'data/merchants.csv'
  ], { cwd: SEED, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.slice(-200));
  fs.writeFileSync(reportLog, run.stderr);
});

after(() => fs.rmSync(work, { recursive: true, force: true }));

// The hook's stdout for `input`, with the setting at `setting`.
function scan(input, setting = 'on') {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: work, CLAUDE_PROJECT_DIR: work, CLAUDE_PLUGIN_OPTION_LOG_SCAN: setting };
  const run = spawnSync(process.execPath, [HOOK], { env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

const note = (stdout) => JSON.parse(stdout).hookSpecificOutput;
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command }, cwd: work });
const read = (file) => ({ tool_name: 'Read', tool_input: { file_path: file }, cwd: work });

test('a Bash command that names the report log gets the line count, the levels and the top 3 templates', () => {
  const output = note(scan(bash(`npm run report 2> report.log; tail -n 200 ${reportLog}`)));
  assert.equal(output.hookEventName, 'PostToolUse');
  const lines = output.additionalContext.split('\n');
  assert.ok(lines.length <= 5, output.additionalContext);
  assert.match(lines[0], /report\.log has 5478 lines \(DEBUG 4948, INFO 2, WARN 528\)/);
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^\d+x WARN "fx: no [A-Z]+ rate for #, using #", first line \d+, last line \d+$/);
  const [, first, last] = /first line (\d+), last line (\d+)/.exec(lines[1]);
  const logLines = fs.readFileSync(reportLog, 'utf8').split('\n');
  assert.match(logLines[first - 1], / WARN {2}fx: no [A-Z]+ rate/);
  assert.match(logLines[last - 1], / WARN {2}fx: no [A-Z]+ rate/);
  const counts = lines.slice(1).map((line) => Number(line.split('x ')[0]));
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(counts.reduce((sum, count) => sum + count, 0) <= 528, true);
});

test('a Read of the report log gets the same note, and a relative path in a command resolves against cwd', () => {
  const viaRead = note(scan(read(reportLog))).additionalContext;
  assert.match(viaRead, /5478 lines/);
  assert.equal(note(scan(bash('grep WARN "report.log" | head'))).additionalContext, viaRead);
});

test('with log_scan off the hook prints nothing', () => {
  assert.equal(scan(read(reportLog), 'off'), '');
  assert.equal(scan(bash(`tail ${reportLog}`), 'off'), '');
});

test('a file under 200 lines, a file that is not a log, a directory and a missing path stay silent', () => {
  const short = path.join(work, 'short.log');
  fs.writeFileSync(short, fs.readFileSync(reportLog, 'utf8').split('\n').slice(0, 199).join('\n'));
  const prose = path.join(work, 'notes.txt');
  fs.writeFileSync(prose, 'a line of prose, no level\n'.repeat(500));
  for (const input of [read(short), read(prose), read(work), read(path.join(work, 'absent.log')), bash(`cat ${prose} ${work}`)]) {
    assert.equal(scan(input), '', JSON.stringify(input));
  }
});

test('a named pipe is skipped without blocking, and other tools and bad input stay silent', () => {
  if (process.platform !== 'win32') {
    const pipe = path.join(work, 'feed.log');
    execFileSync('mkfifo', [pipe]);
    assert.equal(scan(read(pipe)), '');
  }
  assert.equal(scan({ tool_name: 'Grep', tool_input: { pattern: 'x' } }), '');
  assert.equal(scan('not json'), '');
  assert.equal(scan(''), '');
});

test('a log over the byte cap reports its line count as a lower bound', () => {
  const big = path.join(work, 'big.log');
  fs.writeFileSync(big, '2026-03-01T00:00:00.000Z INFO  tick 1\n'.repeat(120_000));
  const text = note(scan(read(big))).additionalContext;
  assert.match(text, /big\.log has \d+\+ lines \(INFO \d+\)/);
});
