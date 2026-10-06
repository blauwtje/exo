#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { NotFoundError, TaskStore } from './store.js';
import { search } from './search.js';
import { tagCounts } from './tags.js';
import { summary } from './stats.js';
import { toCsv, toJson } from './export.js';
import { dueReminders } from './reminders.js';

const USAGE = `usage: taskbook [--file <path>] [--now <iso>] <command>
  add <title> [--tags a,b] [--due <iso>]
  list [--status open|done]
  show <id>
  done <id>
  rm <id>
  search <text>
  tags
  stats
  export csv|json
  remind`;

function line(task) {
  const mark = task.status === 'done' ? 'x' : ' ';
  const tags = task.tags.length > 0 ? ` (${task.tags.join(',')})` : '';
  return `#${task.id} [${mark}] ${task.title}${tags}`;
}

function idArgument(text) {
  const id = Number(text);
  if (!Number.isInteger(id)) throw new TypeError(`not a task id: ${text}`);
  return id;
}

function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      file: { type: 'string', default: 'taskbook.json' },
      now: { type: 'string' },
      tags: { type: 'string' },
      due: { type: 'string' },
      status: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  const clock = values.now === undefined ? undefined : () => values.now;
  const store = TaskStore.load(values.file, clock && { now: clock });
  const now = values.now === undefined ? new Date() : new Date(values.now);
  const print = (text) => process.stdout.write(`${text}\n`);

  switch (command) {
    case 'add': {
      const tags = values.tags ? values.tags.split(',').map((tag) => tag.trim()) : [];
      const task = store.create({ title: rest.join(' '), tags, dueAt: values.due ?? null });
      store.save(values.file);
      print(`added #${task.id}`);
      return 0;
    }
    case 'list':
      for (const task of store.list({ status: values.status })) print(line(task));
      return 0;
    case 'show':
      print(JSON.stringify(store.get(idArgument(rest[0])), null, 2));
      return 0;
    case 'done':
      store.update(idArgument(rest[0]), { status: 'done' });
      store.save(values.file);
      return 0;
    case 'rm':
      store.delete(idArgument(rest[0]));
      store.save(values.file);
      print(`deleted #${rest[0]}`);
      return 0;
    case 'search':
      for (const task of search(store, rest.join(' '))) print(line(task));
      return 0;
    case 'tags':
      for (const { tag, count } of tagCounts(store)) print(`${tag}: ${count}`);
      return 0;
    case 'stats': {
      const stats = summary(store, now);
      for (const key of Object.keys(stats)) print(`${key}: ${stats[key]}`);
      return 0;
    }
    case 'export':
      process.stdout.write(rest[0] === 'json' ? toJson(store) : toCsv(store));
      return 0;
    case 'remind':
      for (const { id, title, dueAt } of dueReminders(store, now)) print(`#${id} ${title} (due ${dueAt})`);
      return 0;
    default:
      process.stderr.write(`${USAGE}\n`);
      return 2;
  }
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof NotFoundError || error instanceof TypeError)) throw error;
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
}
