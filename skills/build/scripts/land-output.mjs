import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedCheckout, nextWave, planRoute, routeLine, waveLine } from '#plan-waves';
import { keepLines } from '#script-output';
import { chainedForCaller } from './next-task-caller.mjs';
import { nextTaskReport } from './next-task-report.mjs';
import { proofOutcomeOf } from './land-record.mjs';

function nextLine(wave, planPath, root) {
  if (wave.length === 0) return waveLine(wave);
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'next-task.mjs');
  return `Then: node "${script}" --block --plan "${planPath}" --root "${root}"`;
}


export function landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine }) {
  const proofLines = proofs.map(({ command, tail }) => `Proof: ${[`${command}: pass (${proofOutcomeOf(tail)})`, ...tail].join('\n')}\n`).join('');
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  const route = planRoute(plan.tasks);
  const wave = nextWave(plan.tasks, landed, route.route === 'inline' || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  return `Committed: ${sha} Task ${number}\n${proofLines}${gateLine}${pendingLine}Landed: ${landed.join(', ')}\n${routeLine(route)}\n${nextLine(wave, planPath, root)}\n`;
}


const PROOF_TAIL = /^ {2}/;
const NEXT_REPEATS = /^(?:Landed|Route|Then): /;

export function landingForCaller(text, { followed = false } = {}) {
  return keepLines(text, (line) => !PROOF_TAIL.test(line) && !(followed && NEXT_REPEATS.test(line)));
}

export function withNext(output, { planPath, planText, root }) {
  const kept = output.split('\n').filter((line) => !line.startsWith('Then: ')).join('\n');
  const next = nextTaskReport({ planPath, planText, root, open: true });
  return { full: `${kept}${next}`, shown: `${landingForCaller(output, { followed: true })}${chainedForCaller(next)}` };
}
