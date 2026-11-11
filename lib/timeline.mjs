import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('.exo', 'timeline.log');
const LINE = /^(\d+) (\S+) (\S+)$/;

export const timelineFile = (root) => path.join(root, FILE);

export const taskOfReport = (reportPath) => path.basename(reportPath).match(/^implementer-(\d+)\.md$/)?.[1] ?? '-';

export function appendTimeline(root, event, task = '-', epochSeconds = Math.floor(Date.now() / 1000)) {
  const file = timelineFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${epochSeconds} ${event} ${task}\n`);
}

export function readTimeline(root) {
  if (!fs.existsSync(timelineFile(root))) return [];
  return fs.readFileSync(timelineFile(root), 'utf8').split('\n').flatMap((line) => {
    const match = line.match(LINE);
    return match === null ? [] : [{ at: Number(match[1]), event: match[2], task: match[3] }];
  });
}

const lastAt = (entries, event, task) => entries.findLast((entry) => entry.event === event && entry.task === task)?.at;

const span = (from, to) => (from === undefined || to === undefined ? null : Math.max(0, to - from));

const text = (seconds) => (seconds === null ? '-' : `${seconds}s`);

export function timelineLines(root) {
  const entries = readTimeline(root);
  const tasks = [...new Set(entries.map((entry) => entry.task).filter((task) => task !== '-'))].sort((left, right) => left - right);
  let idle = 0;
  const lines = tasks.map((task) => {
    const reported = lastAt(entries, 'report-written', task);
    const waited = lastAt(entries, 'wait-end', task);
    idle += span(reported, waited) ?? 0;
    const build = span(lastAt(entries, 'dispatched', task), reported);
    const wait = span(lastAt(entries, 'wait-start', task), waited);
    const land = span(reported, lastAt(entries, 'landed', task));
    return `Task ${task} time: build ${text(build)}, wait ${text(wait)}, land ${text(land)}`;
  });
  return lines.length === 0 ? [] : [...lines, `Idle total: ${idle}s`];
}
