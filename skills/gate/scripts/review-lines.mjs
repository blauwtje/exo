import { planRoute } from '#plan-waves';
import { BRANCH_REVIEW_KEY, cachedPass } from '#check-cache';
import { REVIEWER_AGENTS, taskDiffOf, taskPaths, taskReviewer } from './pick-reviewer.mjs';
import { findOverlaps, formatOverlaps, readChanges } from './review-overlap.mjs';
import { DEFAULT_BASE } from './gate-constants.mjs';
import { gitOutput } from './gate-command.mjs';

export function reviewedState(root) {
  return [`HEAD ${gitOutput(root, ['rev-parse', 'HEAD'])}`];
}

export function reviewLines(plan, landed, { root, planId, base }) {
  const lines = [];
  const route = planRoute(plan.tasks).route;
  const reviewers = plan.tasks.filter((entry) => landed.has(entry.number))
    .map((task) => taskReviewer(task, taskPaths(task, root, planId), route, taskDiffOf(task, root, planId)));
  if (reviewers.length > 0) {
    const reviewer = reviewers.find((entry) => entry === REVIEWER_AGENTS.deep) ?? reviewers.find((entry) => !entry.startsWith('none')) ?? reviewers[0];
    const range = `${base ?? DEFAULT_BASE}..HEAD`;
    lines.push(cachedPass(root, BRANCH_REVIEW_KEY) === null ? `REVIEW Branch ${range}: ${reviewer}` : `REVIEW Branch ${range}: none (reviewed on this same tree)`);
  }
  lines.push(...(base === undefined ? ['OVERLAP none'] : formatOverlaps(findOverlaps(readChanges(base, root))).split('\n')));
  return lines;
}

export function taskOwners(plan, landed, { root, planId }) {
  const owners = new Map();
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    for (const file of taskPaths(task, root, planId)) if (!owners.has(file)) owners.set(file, task.number);
  }
  return owners;
}
