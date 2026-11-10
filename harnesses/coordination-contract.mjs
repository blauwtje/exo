import fs from 'node:fs';

const FILE = new URL('./coordination-contract.json', import.meta.url);

export const ROLES = ['main', 'fork-coordinator', 'subagent-coordinator', 'worker', 'run-session'];

export function readContract(file = FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function contractRow(harness, role, file = FILE) {
  const row = readContract(file)[harness]?.[role];
  if (row === undefined) throw new Error(`no coordination contract row for ${harness} ${role}`);
  return row;
}

export function sessionWait(env = process.env) {
  return contractRow('claude', env.EXO_RUN_SESSION === '1' ? 'run-session' : 'main').wait;
}
