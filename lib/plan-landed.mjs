import path from 'node:path';
import { PLAN_TASK_TRAILER } from './shared-values.mjs';
import { defaultRef, gitLine, gitText } from './git.mjs';

export function defaultBase(root) {
  const base = defaultRef(root);
  const current = gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  return base === null || base.name === current ? null : base.ref;
}

export function commitsOf(root, base = defaultBase(root)) {
  let log;
  try {
    const range = base === null ? [] : [`${base}..HEAD`];
    log = gitText(root, ['log', `--grep=^${PLAN_TASK_TRAILER}: `, '--format=%x1e%H%x1f%s%x1f%B', ...range], { trim: false });
  } catch (error) {
    if (/does not have any commits yet/.test(error.stderr ?? '')) return [];
    throw error;
  }
  return log.split('\x1e').filter((entry) => entry !== '').map((entry) => {
    const [sha, subject, body] = entry.split('\x1f');
    return { sha, subject, body: body ?? '' };
  });
}

export function planIdOf(planPath) {
  return path.basename(planPath, '.md');
}

export function planTaskTrailer(planId, number) {
  return `${PLAN_TASK_TRAILER}: ${planId}/${number}`;
}

function carriesTask(commit, task, planId) {
  const lines = commit.body.split('\n');
  const named = lines.includes(planTaskTrailer(planId, task.number)) || lines.includes(`${PLAN_TASK_TRAILER}: ${task.number}`);
  return named && commit.subject === task.title;
}

export function landedTasks(tasks, commits, planId) {
  return tasks
    .filter((task) => commits.some((commit) => carriesTask(commit, task, planId)))
    .map((task) => task.number);
}

export function taskCommits(task, commits, planId) {
  return commits.filter((commit) => carriesTask(commit, task, planId)).map((commit) => commit.sha);
}
