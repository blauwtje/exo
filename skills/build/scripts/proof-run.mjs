import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';

const USAGE = 'usage: proof-run.mjs --name <name> --command <command>';
const FAILING_LINE = /not ok|✖|FAIL/;
const TAIL_LINES = 40;
const MAX_BUFFER = 256 * 1024 * 1024;

export function summary(output) {
  const lines = output.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const failing = lines.filter((line) => FAILING_LINE.test(line));
  return failing.length > 0 ? failing : lines.slice(-TAIL_LINES);
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { name: 'value', command: 'value' }, { usage: USAGE });
  if (flags.name === undefined || flags.command === undefined) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const cwd = process.cwd();
  const result = spawnSync(flags.command, { shell: true, cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const log = path.join(scratchPath(cwd, 'logs'), `${flags.name}.log`);
  fs.writeFileSync(log, output);
  process.stdout.write([`Log: ${log}`, `Exit: ${result.status ?? result.signal}`, ...summary(output)].join('\n') + '\n');
}
