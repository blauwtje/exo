import fs from 'node:fs';
import path from 'node:path';
import { defaultBranch, gitLine } from '#git';
import { readDecisions } from '#run-decision';
import { planFrame } from './plan-file.mjs';
import { readGates, readState, runDir } from './run-state.mjs';

function branchRange(root, state) {
  const base = defaultBranch(root);
  if (!state.branch || base === null) return null;
  const head = gitLine(state.runRoot ?? root, ['rev-parse', '-q', '--verify', `refs/heads/${state.branch}`]);
  const fork = head === null ? null : gitLine(state.runRoot ?? root, ['merge-base', base, head]);
  if (fork === null || fork === head) return null;
  return `${fork.slice(0, 7)}..${head.slice(0, 7)}`;
}

export function writeReport(root, id, { phase, result, reason }) {
  const state = readState(root, id);
  // why: a stopped, crashed or parked run never reaches landRun, yet its tasks may already be committed on the run branch.
  const range = result?.range ?? (['stopped', 'crashed', 'parked'].includes(phase) ? branchRange(root, state) : null);
  let land = null;
  try {
    land = planFrame(state.plan).land;
  } catch {
  }
  const dir = runDir(root, id);
  const open = readGates(dir).filter((gate) => gate.status === 'open');
  const lines = [
    `# exo run ${id}`,
    `Phase: ${phase}`,
    ...(reason && ['refused', 'stopped', 'crashed'].includes(phase) ? [`Reason: ${reason.replace(/\s*\n\s*/g, ' ')}`] : []),
    `Land: ${land ?? 'none'}`,
    `Branch: ${state.branch ?? 'none'}`,
    `Landed: ${range ?? 'none'}`,
    `Pushed: ${result?.prUrl ?? result?.pushed ?? 'none'}`,
    `Open gates: ${open.length}`,
    ...open.slice(0, 4).map((gate) => `- ${gate.source}: ${gate.action} (${gate.reason})`),
    `Decisions: ${readDecisions(dir).length}`,
    `Cleanup: ${result?.cleanup ?? 'none'}`
  ];
  const denied = path.join(dir, 'denied.txt');
  const refused = fs.existsSync(denied) ? fs.readFileSync(denied, 'utf8') : '';
  fs.writeFileSync(path.join(dir, 'report.md'), `${lines.slice(0, 15).join('\n')}\n${refused}`);
}
