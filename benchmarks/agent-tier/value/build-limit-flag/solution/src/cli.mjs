import { listTasks } from './tasks.mjs';

function readOption(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

function readLimit(args) {
  if (!args.includes('--limit')) return Infinity;
  const limit = Number(readOption(args, '--limit'));
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit needs a positive integer');
  return limit;
}

export function run(argv, tasks) {
  const [command, ...args] = argv;
  if (command !== 'list') throw new Error(`unknown command: ${command}`);
  const status = readOption(args, '--status');
  const limit = readLimit(args);
  return listTasks(tasks, { status })
    .slice(0, limit)
    .map((task) => `${task.id}\t${task.status}\t${task.title}`)
    .join('\n');
}
