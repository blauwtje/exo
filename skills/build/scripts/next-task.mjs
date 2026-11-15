import fs from 'node:fs';
import { parseFlags, isMain } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { landedTasks, planIdOf } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';

const USAGE = 'usage: next-task.mjs --plan <plan> [--root <checkout>]';

const STANDING = [['Decisions', 'decisions'], ['Non-goals', 'nonGoals'], ['Assumptions', 'assumptions']];

function standingText(frame) {
  const found = frameOf(frame);
  return STANDING.filter(([, key]) => found[key].length > 0)
    .map(([title, key]) => `${title}:\n${found[key].map((item) => (/^\d+\. /.test(item) ? item : `- ${item}`)).join('\n')}\n`)
    .join('\n');
}

export function nextTaskReport({ planText, planPath, root }) {
  const { tasks, frame } = parsePlan(planText);
  const landed = landedTasks(tasks, root, planIdOf(planPath));
  const next = tasks.find((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
  const landedLine = `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}\n`;
  if (next === undefined) return `${landedLine}Next: none\n`;
  const standing = standingText(frame);
  const task = `${landedLine}Next: ${next.number} ${next.title}\n\n${next.section.trim()}\n`;
  return standing === '' ? task : `${task}\n${standing}`;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  process.stdout.write(nextTaskReport({ planText: fs.readFileSync(planPath, 'utf8'), planPath, root: flags.root ?? process.cwd() }));
}
