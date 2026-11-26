import fs from 'node:fs';
import { parseFlags, isMain } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { commitsOf, planIdOf, taskCommits } from '#plan-landed';
import { gitLine, gitText } from '#git';
import { parsePlan } from '#plan-tasks';
import { PLAN_TASK_TRAILER } from '#shared-values';

const USAGE = 'usage: undo-task.mjs --plan <plan> [--root <checkout>] <n>';
const FOOTER = `Fix commits carry no ${PLAN_TASK_TRAILER} trailer and are not listed.`;
const IN_PROGRESS = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'];

function unfinishedOperation(root) {
  return IN_PROGRESS.find((name) => fs.existsSync(gitText(root, ['rev-parse', '--path-format=absolute', '--git-path', name])));
}

function dependents(tasks, number) {
  const chosen = new Set([number]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of tasks) {
      if (!chosen.has(task.number) && task.dependsOn.some((dependency) => chosen.has(dependency))) {
        chosen.add(task.number);
        grew = true;
      }
    }
  }
  return tasks.filter((task) => chosen.has(task.number));
}

export function undoLines({ planText, planPath, root, number }) {
  if (gitLine(root, ['status', '--porcelain']) !== '') throw new Error('the working tree is dirty; commit or stash first');
  const operation = unfinishedOperation(root);
  if (operation !== undefined) throw new Error(`a ${operation} is in progress; finish or abort it first`);
  const { tasks } = parsePlan(planText);
  const planId = planIdOf(planPath);
  const commits = commitsOf(root);
  const task = tasks.find((candidate) => candidate.number === number);
  if (task === undefined || taskCommits(task, commits, planId).length === 0) {
    throw new Error(`task ${number} has no ${PLAN_TASK_TRAILER} commit`);
  }
  const shas = new Set(dependents(tasks, number).flatMap((member) => taskCommits(member, commits, planId)));
  const lines = commits.filter((commit) => shas.has(commit.sha)).map((commit) => `git revert --no-commit ${commit.sha}`);
  return `${[...lines, FOOTER].join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.findLastIndex((token) => !token.startsWith('--'));
  const text = at === -1 ? '' : argv[at];
  const flags = parseFlags(argv.filter((_, index) => index !== at), { plan: 'value', root: 'value' }, { usage: USAGE });
  try {
    if (!/^[1-9]\d*$/.test(text) || flags.plan === undefined) throw new Error(USAGE);
    const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
    process.stdout.write(undoLines({ planText: fs.readFileSync(planPath, 'utf8'), planPath, root: flags.root ?? process.cwd(), number: Number(text) }));
  } catch (error) {
    console.error(`undo-task: ${error.message}`);
    process.exit(1);
  }
}
