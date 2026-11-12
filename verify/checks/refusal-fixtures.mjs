import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FIXTURES = 'tests/fixtures/hook-refusal-calls.json';
const OWN_ENV = /^(?:EXO_|CLAUDE_PLUGIN_OPTION_)/;

function cleanEnv(tmp, extra = {}) {
  const kept = Object.entries(process.env).filter(([name]) => !OWN_ENV.test(name));
  return { ...Object.fromEntries(kept), TMPDIR: tmp, ...extra };
}

function stdinOf(call, folder, session) {
  if (call.raw !== undefined) return call.raw;
  const input = { session_id: session, cwd: folder, tool_name: 'Bash', ...call.input };
  if (call.agent) input.agent_id = `agent-${session}`;
  if (call.tokens) {
    const transcript = path.join(folder, 'transcript.jsonl');
    fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: call.tokens } } })}\n`);
    input[call.agent ? 'agent_transcript_path' : 'transcript_path'] = transcript;
  }
  return JSON.stringify(input);
}

export function verdictOf(stdout) {
  if (stdout.trim() === '') return 'pass';
  const output = JSON.parse(stdout);
  const fields = output.hookSpecificOutput ?? {};
  if (fields.permissionDecision === 'deny' || output.decision === 'block') return 'deny';
  return fields.additionalContext ? 'note' : 'pass';
}

function runCall({ root, tmp }, call, index) {
  const folder = path.join(tmp, `call-${index}`);
  fs.mkdirSync(folder, { recursive: true });
  const stdin = stdinOf(call, folder, `fixture-${index}`);
  const env = cleanEnv(tmp, Object.fromEntries(Object.entries(call.env ?? {}).map(([name, value]) => [name, value.replace('{dir}', folder)])));
  let run;
  for (let round = 0; round < (call.repeat ?? 1); round += 1) {
    run = spawnSync(process.execPath, [path.join(root, 'hooks', `${call.hook}.mjs`)], { input: stdin, cwd: folder, env, encoding: 'utf8', timeout: 20000 });
  }
  return run;
}

export function refusalFixtureFindings(root, calls) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-refusal-fixtures-'));
  const findings = calls.flatMap((call, index) => {
    const run = runCall({ root, tmp }, call, index);
    const label = `${call.rule} (${call.hook} #${index})`;
    if (run.status !== 0) return [`${label} exited ${run.status}: ${run.stderr.trim().split('\n')[0]}`];
    const got = verdictOf(run.stdout);
    return got === call.expect ? [] : [`${label} expected ${call.expect} and got ${got}`];
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return findings;
}

export function checkRefusalFixtures(report, repository) {
  const file = path.join(repository.root, FIXTURES);
  if (!fs.existsSync(file)) return;
  const calls = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = refusalFixtureFindings(repository.root, calls);
  for (const finding of findings) report.result('FAIL', 'refusal fixtures', `${finding}: a legitimate call was refused or a harm call passed`);
  if (findings.length === 0) report.result('PASS', 'refusal fixtures', `${calls.length} real calls got their expected pass, note or deny`);
}
