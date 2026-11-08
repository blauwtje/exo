import {
  FLOW_HELPERS, prepareBuildRepository, prepareFixerBranch, prepareFlowRepository,
  prepareFlowWebRepository, prepareGreenFirstBranch, prepareReviewBranch
} from './sweep-fixtures.mjs';
import { FLOW_LARGE_EXTRA } from './sweep-large.mjs';

function flowPlanMode(cell) {
  if (cell.compactPlan) return 'compact';
  return cell.kind.startsWith('flow');
}

export function flowHelpers(cell) {
  if (cell.kind === 'flow-large') return [...FLOW_HELPERS, ...FLOW_LARGE_EXTRA];
  return FLOW_HELPERS;
}

export function prepareRepository(cell, repository, origin) {
  if (cell.fixture === 'flow-web') prepareFlowWebRepository(repository, { profile: cell.fixtureProfile, reviewOnly: cell.reviewOnly });
  else if (cell.variant === 'green-first') prepareGreenFirstBranch(repository);
  else if (cell.kind === 'review') prepareReviewBranch(repository, cell.task, cell.source);
  else if (cell.kind === 'build') prepareBuildRepository(repository, cell.task);
  else if (cell.kind === 'fixer') prepareFixerBranch(repository, cell.task);
  else prepareFlowRepository(repository, origin, { withPlan: flowPlanMode(cell), helpers: flowHelpers(cell) });
}
