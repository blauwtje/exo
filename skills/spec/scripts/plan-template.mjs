import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';

const USAGE = 'usage: plan-template.mjs done --root <dir> --plan <file>';
const DONE_FILE = path.join('docs', 'plans', 'definition-of-done.md');
const CRITERION_HEADING = /^## Success criterion[ \t]*$/m;
const CHAIN = ' && ';

function doneCommands(root) {
  const file = path.join(root, DONE_FILE);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return [...new Set(lines.map((line) => line.match(/^\s*[-*]\s+`([^`]+)`/)?.[1].trim()).filter(Boolean))];
}

export function applyDone(planText, commands) {
  const heading = planText.match(CRITERION_HEADING);
  if (heading === null) throw new UsageError("the plan has no '## Success criterion'");
  const start = heading.index + heading[0].length;
  const found = planText.slice(start).match(/`([^`]+)`/);
  if (found === null) throw new UsageError("the plan's Success criterion holds no backticked command");
  const present = found[1].split(CHAIN).map((part) => part.trim());
  const missing = commands.filter((command) => !present.includes(command));
  if (missing.length === 0) return planText;
  if (found[1].startsWith('mcp:')) throw new UsageError("the Success criterion is an 'mcp:' call, which cannot chain the done-list commands");
  const commandStart = start + found.index + 1;
  return planText.slice(0, commandStart) + [found[1], ...missing].join(CHAIN) + planText.slice(commandStart + found[1].length);
}

function main(argv) {
  const flags = parseFlags(argv.slice(1), { root: 'value', plan: 'value' }, { usage: USAGE });
  if (argv[0] !== 'done' || flags.root === undefined || flags.plan === undefined) throw new UsageError('missing command or flags');
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at ${flags.plan}`);
  const before = fs.readFileSync(flags.plan, 'utf8');
  const after = applyDone(before, doneCommands(path.resolve(flags.root)));
  if (after === before) return 'done-list already in the Success criterion\n';
  fs.writeFileSync(flags.plan, after);
  return 'done-list appended to the Success criterion\n';
}

if (isMain(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exitCode = 1;
  }
}
