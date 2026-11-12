import { runCoveringTests } from './land-proof.mjs';
import { gateEnvOf } from './land-gate.mjs';
import { taskChangedPaths } from './land-refusals.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { writeBehaviour } from '../../spec/scripts/behaviour.mjs';
import { runPreCommitGates } from './land-prove.mjs';
import { dropCandidate, stageOutside, commitCandidate, promoteCandidate, gateCandidate, committedSha } from './land-candidate.mjs';

function refreshedBehaviour(root) {
  return fs.existsSync(path.join(root, 'docs/behaviour')) ? writeBehaviour(root).written : [];
}

export function stageCandidate({ plan, task, frame, block, outside, root, planId, reportText }) {
  const warnLines = runPreCommitGates(task, frame, root);
  const changed = taskChangedPaths(root);
  stageOutside(root, [...outside, ...refreshedBehaviour(root)]);
  const candidate = commitCandidate(block, root, task, planId, reportText);
  const gateLine = warnLines + gateCandidate(frame, root, gateEnvOf(plan, task, root, planId), candidate);
  return { changed, candidate, gateLine };
}

export function coverOrDrop({ task, proofs, root, changed, pendingEvidence, candidate }) {
  try {
    runCoveringTests(task, proofs.map(({ command }) => command), root, changed, pendingEvidence);
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
}

export function promoteAndCommit({ task, root, planId, planPath, candidate }) {
  promoteCandidate(root, task, planId, candidate);
  return committedSha(task, { root, planId, planPath, base: candidate.base });
}
