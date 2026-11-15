import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defaultRef, gitLine } from './git.mjs';

export function defaultBase(root) {
  const base = defaultRef(root);
  const current = gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  return base === null || base.name === current ? null : base.ref;
}

export function commitsOf(root) {
  const base = defaultBase(root);
  let log;
  try {
    const range = base === null ? [] : [`${base}..HEAD`];
    log = execFileSync('git', ['-C', root, 'log', '--grep=^Plan-task: ', '--format=%x1e%H%x1f%s%x1f%B', ...range], {
      encoding: 'utf8',
      maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'pipe']
    });
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
  return `Plan-task: ${planId}/${number}`;
}

function carriesTask(commit, task, planId) {
  const lines = commit.body.split('\n');
  const named = lines.includes(planTaskTrailer(planId, task.number)) || lines.includes(`Plan-task: ${task.number}`);
  return named && commit.subject === task.title;
}

function commitsFrom(rootOrCommits) {
  return Array.isArray(rootOrCommits) ? rootOrCommits : commitsOf(rootOrCommits);
}

export function landedTasks(tasks, rootOrCommits, planId) {
  const commits = commitsFrom(rootOrCommits);
  return tasks
    .filter((task) => commits.some((commit) => carriesTask(commit, task, planId)))
    .map((task) => task.number);
}

export function taskCommits(task, rootOrCommits, planId) {
  return commitsFrom(rootOrCommits).filter((commit) => carriesTask(commit, task, planId)).map((commit) => commit.sha);
}
