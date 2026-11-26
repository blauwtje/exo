import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, isMain, UsageError, USAGE_EXIT, POSITIVE_INTEGER } from '#script-flags';
import { RETRY_MODEL, RETRY_EFFORT } from '#shared-values';

const USAGE = 'usage: build-dispatch.mjs --plan <plan> --root <checkout> [--attempt <n>] [--missing-input]';
const NEXT_TASK = fileURLToPath(new URL('./next-task.mjs', import.meta.url));
const BUILDER_MODEL = 'sonnet medium';

function modelLine(attempt, missingInput) {
  if (attempt <= 1) return 'none';
  return missingInput ? BUILDER_MODEL : `${RETRY_MODEL} ${RETRY_EFFORT}`;
}

export function dispatchReport(nextOutput, { attempt = 1, missingInput = false } = {}) {
  const lines = nextOutput.split('\n');
  const start = lines.indexOf('Dispatch:');
  if (start === -1) return nextOutput;
  const head = lines.slice(0, start).join('\n');
  const prompt = lines.slice(start + 1).join('\n').replace(/\n+$/, '');
  return `${head}\nAgent: exo:builder\nModel: ${modelLine(attempt, missingInput)}\nPrompt:\n${prompt}\n`;
}

if (isMain(import.meta.url)) {
  try {
    const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value', attempt: 'value', 'missing-input': 'boolean' }, { usage: USAGE });
    if (flags.attempt !== undefined && !POSITIVE_INTEGER.test(flags.attempt)) throw new UsageError(`--attempt '${flags.attempt}' must be a whole number of 1 or more`);
    const args = Object.entries({ plan: flags.plan, root: flags.root }).filter(([, value]) => value !== undefined).flatMap(([name, value]) => [`--${name}`, value]);
    const output = execFileSync(process.execPath, [NEXT_TASK, ...args], { encoding: 'utf8', cwd: process.cwd() });
    process.stdout.write(dispatchReport(output, { attempt: Number(flags.attempt ?? 1), missingInput: flags['missing-input'] === true }));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = USAGE_EXIT;
  }
}
