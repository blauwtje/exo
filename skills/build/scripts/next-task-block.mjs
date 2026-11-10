import { proofLines } from '#proofs-report';
import { frameOf } from '#plan-frame';
import { nextBlock, planRoute, routeLine, waveLine } from '#plan-waves';
import { landedTasks, planIdOf } from '#plan-landed';
import { parseTasks, nextTaskReport } from './next-task-report.mjs';

function directionOf(visualDirection) {
  const pending = visualDirection?.match(/Direction: (pending at rung \d+)/);
  if (pending) return pending[1];
  return /Contract: /.test(visualDirection ?? '') ? 'named' : 'none';
}

function blockLine(block, visualDirection) {
  if (block.length === 0) return waveLine(block);
  if (block[0].design) return `Design: Task ${block[0].number}, direction ${directionOf(visualDirection)}`;
  return `Block: ${block.map((task) => `Task ${task.number}`).join(', ')}`;
}

export function blockReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
  if (planRoute(plan.tasks).route === 'inline') return nextTaskReport({ planPath, planText, root });
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const block = nextBlock(plan.tasks, landed);
  return `${[
    `Plan: ${planPath}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    blockLine(block, frameOf(plan.frame).visualDirection),
    ...(landed.length === 0 || block.length === 0 ? [] : proofLines(planPath, landed, root))
  ].join('\n')}\n`;
}
