import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { parseStream } from './pressure-stream.mjs';

export const TIMEOUT_MS = 1_800_000;

export function claudeArguments({ model, effort, promptText, settingSources, pluginFlags }) {
  const args = [
    '-p', promptText,
    '--model', model,
    '--effort', effort,
    '--output-format', 'stream-json',
    '--verbose',
    '--strict-mcp-config'
  ];
  if (settingSources !== undefined) args.push('--setting-sources', settingSources);
  args.push(...pluginFlags);
  return args;
}

export function runArm(run) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: { ...process.env, ...run.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ ...parseStream(stdout), timedOut, stderr, durationMs: Date.now() - started });
    });
  });
}

export function runSetup(setupScript) {
  const setup = spawnSync('bash', [setupScript], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (setup.error) throw setup.error;
  return { exit: setup.status ?? setup.signal, stderr: setup.stderr };
}

export async function runInSequence(planned, startRun) {
  const order = planned.map((_, index) => index)
    .sort((left, right) => planned[left].runNumber - planned[right].runNumber || left - right);
  const outcomes = new Array(planned.length);
  for (const index of order) outcomes[index] = await startRun(planned[index]);
  return outcomes;
}
