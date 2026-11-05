import { namesPath } from './code-rule-lines.mjs';

const PASS_REPORT_LINE = /^\s*(?:#\s*Subtest:|ok\b|pass\b|✔|✓)/i;

const FAIL_REPORT_LINE = /^\s*(?:fail\b|not ok\b|✖|✗|×)/i;

export function unlandedBlame(tasks, landed, output) {
  const blaming = output.split(/\r?\n/).filter((line) => !PASS_REPORT_LINE.test(line));
  const names = (line, task) => task.files.some((file) => namesPath(line, file.path));
  const open = tasks.filter((task) => !landed.has(task.number));
  if (tasks.some((task) => landed.has(task.number) && blaming.some((line) => names(line, task)))) return [];
  if (blaming.some((line) => FAIL_REPORT_LINE.test(line) && !open.some((task) => names(line, task)))) return [];
  return open.filter((task) => blaming.some((line) => names(line, task))).map((task) => task.number);
}

export function taskStates(tasks, landed) {
  return tasks.map((task) => ({ task: task.number, title: task.title, done: landed.has(task.number) }));
}

export function manualChecks(frame) {
  const section = frame['Manual checks'] ?? '';
  return section.split('\n').filter((line) => line.trim().startsWith('- ')).map((line) => line.trim().slice(2));
}
