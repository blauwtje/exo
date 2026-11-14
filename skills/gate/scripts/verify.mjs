import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { parsePlan } from '../../../lib/plan-tasks.mjs';
import { criterionCommand } from '../../../lib/plan-frame.mjs';

const COMMAND_TIMEOUT_MS = 600000;
const LOG_PATH = path.join('.exo', 'logs', 'gate-verify.log');

function runCommand(command, root) {
  const run = spawnSync('sh', ['-c', command], { cwd: root, encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  return { ok: run.status === 0, output: `${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd() };
}

function proofCommand(proof) {
  if (proof === null) return null;
  const command = proof.replace(/^`([^`]+)`$/, '$1').trim();
  return command === '' || command === 'none' ? null : command;
}

function checkLine(label, command, root) {
  if (command === null) return { line: `PASS ${label} (no command)`, ok: true };
  const { ok, output } = runCommand(command, root);
  fs.appendFileSync(path.join(root, LOG_PATH), `${ok ? 'PASS' : 'FAIL'} ${label}\n${output}\n`);
  return { line: ok ? `PASS ${label}` : `FAIL ${label} (output in ${LOG_PATH})`, ok };
}

function verifyPlan(planText, root) {
  const plan = parsePlan(planText);
  const checks = plan.tasks.map((task) => checkLine(`Task ${task.number}`, proofCommand(task.proof), root));
  checks.push(checkLine('criterion', criterionCommand(plan.frame['Success criterion']), root));
  return { lines: checks.map((check) => check.line), passed: checks.every((check) => check.ok) };
}

function main() {
  const { values } = parseArgs({ options: { plan: { type: 'string' }, root: { type: 'string', default: process.cwd() } } });
  const root = path.resolve(values.root);
  const planPath = values.plan === undefined ? undefined : path.resolve(root, values.plan);
  if (planPath === undefined || !fs.existsSync(planPath)) {
    console.log('FAIL no-plan');
    return 1;
  }
  fs.mkdirSync(path.join(root, path.dirname(LOG_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, LOG_PATH), '');
  const { lines, passed } = verifyPlan(fs.readFileSync(planPath, 'utf8'), root);
  console.log(lines.join('\n'));
  return passed ? 0 : 1;
}

process.exitCode = main();
