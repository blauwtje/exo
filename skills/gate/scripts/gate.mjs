#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { selfHostPlan } from './self-host.mjs';
import { repairLines } from './gate-repair.mjs';
import { runGate } from './gate-run.mjs';
import { writeRunReport } from './run-report.mjs';

const USAGE = `Usage: node gate.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>] [--reviews-only]
       node gate.mjs --repair --plan <path> --root <checkout> --pre-fix-sha <sha> --findings <path> --findings-sha256 <hash>
Runs a plan's gate: each landed task's Proof, the Success criterion command and an unplanned-path check.
Prints one PASS, FAIL, WARN, SKIP, SESSION, UNRUN, UNPLANNED or FIX-ONLY line per check,
then one REVIEW Branch line and the OVERLAP lines, one DONE or OPEN line per task,
one MANUAL line per manual check and a last REPORT <root>/.exo/run-report.md line.
--reviews-only prints only the REVIEW and OVERLAP lines, then one DISPATCH line per review to dispatch
(code standard, review rules, plan, checkout, base, reports, scope, findings path, proof files), and runs no proof or gate.
--base also checks the lines each task added against the code rules, into <root>/.exo/code-rules.md.
--reviews-only also prints HEAD.
--repair checks the fixer's return and prints FAIL fixer-uncommitted, FAIL fixer-no-commits, FAIL stale-findings,
FAIL fixer-no-guard (a commit lacks Guard:) or FAIL fixer-guard-not-in-diff, else PASS fixer-committed.
It then rechecks only the repair diff: the Land gate, the tests covering the changed files and each named Guard test,
then prints one DISPATCH Repair line for the fix-diff review and LOOP next=fix|done|stop round=<n>/2.
A third repair pass prints STOP repair-bound. The pass count lives in <root>/.exo/verify-state.json.
Exits 1 on any FAIL or UNPLANNED line.`;

function resolvedArgs(flags, planPath, root) {
  const named = { ...flags, plan: planPath, root };
  return Object.entries(named).flatMap(([name, value]) => {
    if (value === undefined || value === false) return [];
    return value === true ? [`--${name}`] : [`--${name}`, value];
  });
}

async function printRepair(flags, root, { planPath, planText }) {
  for (const name of ['pre-fix-sha', 'findings', 'findings-sha256']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required with --repair`);
  }
  const lines = await repairLines({ root, planText, planPath, preFixSha: flags['pre-fix-sha'], findings: path.resolve(flags.findings), findingsSha256: flags['findings-sha256'] });
  process.stdout.write(`${lines.join('\n')}\n`);
  if (lines.some((line) => /^(?:FAIL|STOP) /.test(line))) process.exitCode = 1;
}

async function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value', 'reviews-only': 'boolean', repair: 'boolean', 'pre-fix-sha': 'value', findings: 'value', 'findings-sha256': 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planPath = path.resolve(flags.plan);
  const planText = fs.readFileSync(planPath, 'utf8');
  const root = flags.root === undefined ? undefined : path.resolve(flags.root);
  if (root !== undefined) process.chdir(root);
  const hosting = selfHostPlan({ root: root ?? process.cwd(), base: flags.base, running: fs.realpathSync(fileURLToPath(import.meta.url)) });
  if (hosting.reexec !== null) {
    process.exitCode = spawnSync(process.execPath, [hosting.reexec, ...resolvedArgs(flags, planPath, root)], { stdio: 'inherit' }).status ?? 1;
    return;
  }
  if (flags.repair === true) return printRepair(flags, root ?? process.cwd(), { planPath, planText });
  const gate = await runGate(planText, { planPath, checkCommand: flags['check-command'], root, base: flags.base, reviewsOnly: flags['reviews-only'] === true });
  const lines = hosting.note === null ? gate.lines : [hosting.note, ...gate.lines];
  const failed = gate.failed;
  process.stdout.write(`${lines.join('\n')}\n`);
  if (flags['reviews-only']) return;
  const reportPath = writeRunReport(lines, { planPath, planText, root: path.resolve('.') });
  process.stdout.write(`REPORT ${reportPath}\n`);
  if (failed) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`gate: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
