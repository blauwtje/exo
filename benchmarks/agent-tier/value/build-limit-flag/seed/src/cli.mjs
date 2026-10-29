import { listTasks } from './tasks.mjs';

function readOption(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

export function run(argv, tasks) {
  const [command, ...args] = argv;
  if (command !== 'list') throw new Error(`unknown command: ${command}`);
  const status = readOption(args, '--status');
  return listTasks(tasks, { status })
    .map((task) => `${task.id}\t${task.status}\t${task.title}`)
    .join('\n');
}
