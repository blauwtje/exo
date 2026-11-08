import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { criterionCommand, frameOf } from '#plan-frame';
import { isPlanDoc, landedTasks, planIdOf } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { cachedPass, recordPass, successCriterionPasses, summaryLine } from '#check-cache';
import { failedTestFiles, isNodeTest, recordFlaky } from '../../../lib/flaky-record.mjs';
import { changedPaths } from '#size-facts';
import { mcpToolCall } from '#mcp-tool-call';
import { packageHasEntryPoint } from '#package-entry-point';
import { runnableProof } from '#red-green';
import { boundaryLines, dispatchLines, redLines, writeReviewInput } from './review-input.mjs';
import { DEFAULT_BASE, PROOF_TIMEOUT_MS } from './gate-constants.mjs';
import { unmarkedMcpTool, commandLine, runCommand, failReason, outputTail, failLines, mapLimited } from './gate-command.mjs';
import { reviewedState, reviewLines, taskOwners } from './review-lines.mjs';
import { recordRepairPasses } from './gate-repair.mjs';
import { packageScripts, suiteGlobs, filesUnderGlobs } from './proof-globs.mjs';
import { repoPathOf, findUnplannedPaths, splitFixOnlyPaths, commitsTouching } from './unplanned-paths.mjs';
import { claimLines, codeRuleLines } from './code-rule-lines.mjs';
import { benchmarkLines } from './benchmark-lines.mjs';
import { unlandedBlame, taskStates, manualChecks } from './task-states.mjs';

const DEFAULT_LAND_GATE = 'npm run check';

const TEST_SCRIPT_GATE = 'npm test';

const TEST_SCRIPT_PASS = 'PASS success-criterion (npm test; no check script)';

const TEST_SUITE_PROOF = /^npm test( |$)/;

const PROOF_CONCURRENCY = 3;

const GATE_TIMEOUT_MS = 1_800_000;

export async function runGate(planText, { planPath, checkCommand, root = process.cwd(), base, invocation = commandLine(process.argv), reviewsOnly = false } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const planId = planIdOf(planPath);
  const landed = new Set(landedTasks(plan.tasks, root, planId));
  if (reviewsOnly) {
    const printed = reviewLines(plan, landed, { root, planId, base });
    const checkout = path.resolve(root);
    const range = { base: base ?? DEFAULT_BASE, head: 'HEAD' };
    const taskOf = taskOwners(plan, landed, { root, planId });
    recordRepairPasses(checkout, 0);
    const shards = writeReviewInput(frame, { checkout, ...range, redSection: redLines(plan, landed, { checkout, planId }), boundaries: boundaryLines(plan, landed), taskOf });
    return { lines: [...printed, ...dispatchLines(printed, { root, planPath, ...range, shards }), ...reviewedState(checkout)], failed: false };
  }
  const lines = [];
  let failed = false;
  const landGateNone = frame.landGate === 'none' ? 'none' : null;
  const scripts = packageScripts(root);
  const namedGate = checkCommand ?? criterionCommand(frame.successCriterion) ?? landGateNone;
  const testScriptGate = namedGate === null && scripts.check === undefined && scripts.test !== undefined;
  const gateCommand = namedGate ?? (testScriptGate ? TEST_SCRIPT_GATE : DEFAULT_LAND_GATE);
  const gateSkipped = gateCommand === 'none';
  const gateMcpCall = mcpToolCall(gateCommand);

  const proofRuns = [];
  const queued = new Set();
  const globs = suiteGlobs(scripts);
  for (const task of plan.tasks) {
    if (!landed.has(task.number) || task.proof === null) continue;
    const command = runnableProof(task.proof);
    if (command === null) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: not a single \`command\`)` });
      continue;
    }
    const mcpCall = mcpToolCall(command);
    const check = mcpCall ?? command;
    const suiteUnderDefault = (gateCommand === DEFAULT_LAND_GATE || testScriptGate) && (TEST_SUITE_PROOF.test(command) || filesUnderGlobs(command, globs));
    if (!gateSkipped && (check === (gateMcpCall ?? gateCommand) || suiteUnderDefault)) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)` });
      continue;
    }
    if (cachedPass(root, command) !== null) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: passed on this same tree)` });
      continue;
    }
    if (queued.has(check)) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: repeats an earlier task's Proof, which runs once)` });
      continue;
    }
    queued.add(check);
    if (mcpCall !== null) {
      proofRuns.push({ line: `SESSION Task ${task.number} (Proof: ${mcpCall}; run it as an MCP tool call)` });
      continue;
    }
    proofRuns.push({ number: task.number, command });
  }

  const gateRuns = !gateSkipped && gateMcpCall === null && cachedPass(root, gateCommand) === null;
  const [proofResults, gateRun] = await Promise.all([
    mapLimited(proofRuns, PROOF_CONCURRENCY, (run) => (run.line ? null : runCommand(run.command, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS)))),
    gateRuns ? runCommand(gateCommand, environmentMs('EXO_GATE_TIMEOUT_MS', GATE_TIMEOUT_MS)) : null
  ]);
  for (const [index, run] of proofRuns.entries()) {
    if (run.line || proofResults[index].ok || !isNodeTest(run.command)) continue;
    const files = failedTestFiles(proofResults[index].output);
    if (files.length === 0) continue;
    const retried = await runCommand(`node --test ${files.join(' ')}`, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS));
    if (!retried.ok) continue;
    recordFlaky(root, files);
    proofResults[index] = retried;
    run.flaky = files;
  }
  proofRuns.forEach((run, index) => {
    if (run.line) {
      lines.push(run.line);
      return;
    }
    const proofRun = proofResults[index];
    if (proofRun.ok) {
      recordPass(root, run.command, proofRun.ms, undefined, proofRun.output);
      lines.push(run.flaky ? `FLAKY Task ${run.number} (passed on retry: ${run.flaky.join(', ')})` : `PASS Task ${run.number}`);
    } else {
      const tool = unmarkedMcpTool(run.command, proofRun);
      const reason = tool === null ? failReason(proofRun) : `${failReason(proofRun)}, ${tool} looks like an MCP tool; write the Proof as mcp:${tool}`;
      lines.push(...failLines(`Task ${run.number}`, reason, proofRun.output));
      failed = true;
    }
  });

  if (gateSkipped) {
    lines.push('UNRUN success-criterion (Land gate: none)');
  } else if (gateMcpCall !== null) {
    lines.push(`SESSION success-criterion (${gateMcpCall}; run it as an MCP tool call)`);
  } else if (!gateRuns) {
    lines.push('SKIP success-criterion (passed on this same tree)');
  } else {
    if (successCriterionPasses(gateRun)) recordPass(root, gateCommand, gateRun.ms, undefined, gateRun.output);
    if (successCriterionPasses(gateRun) && testScriptGate) {
      lines.push(TEST_SCRIPT_PASS);
      if (!packageHasEntryPoint(root)) lines.push(`Proof: \`${invocation}\` -> ${TEST_SCRIPT_PASS}`);
    } else if (successCriterionPasses(gateRun)) {
      lines.push('PASS success-criterion');
    } else {
      const reason = gateRun.ok ? summaryLine(gateRun.output) : failReason(gateRun);
      const blamed = unlandedBlame(plan.tasks, landed, gateRun.output);
      if (blamed.length > 0) {
        lines.push(`SKIP success-criterion (out of scope: ${reason} names only files of unlanded Task ${blamed.join(', ')})`, ...outputTail(gateRun.output));
      } else {
        lines.push(...failLines('success-criterion', reason, gateRun.output));
        failed = true;
      }
    }
  }

  const benchmark = benchmarkLines(plan, { root, planPath });
  lines.push(...benchmark);
  if (benchmark.some((line) => line.startsWith('FAIL '))) failed = true;

  const changed = changedPaths({ base });
  const planFile = repoPathOf(planPath, root);
  const undeclared = findUnplannedPaths(plan.tasks, changed.filter((changedPath) => changedPath !== planFile));
  const split = splitFixOnlyPaths(undeclared, commitsTouching(undeclared, root, base));
  const { fixOnly, lead } = split;
  const docs = split.unplanned.filter(isPlanDoc);
  const unplanned = split.unplanned.filter((candidate) => !isPlanDoc(candidate));
  if (unplanned.length === 0) {
    lines.push('PASS unplanned-paths');
  } else {
    for (const path of unplanned) lines.push(`UNPLANNED ${path}`);
    failed = true;
  }
  for (const path of docs) lines.push(`DOCS ${path}`);
  for (const { path, shas } of [...fixOnly].sort((a, b) => (a.path < b.path ? -1 : 1))) lines.push(`FIX-ONLY ${path} (${shas.join(',')})`);
  for (const { path, shas } of lead) lines.push(`LEAD ${path} (${shas.join(',')})`);

  const claims = plan.tasks.filter((task) => landed.has(task.number)).flatMap((task) => claimLines(task, { root, planId, base }));
  lines.push(...(claims.length === 0 ? ['PASS claims-diff'] : claims));
  if (claims.some((line) => line.startsWith('FAIL '))) failed = true;

  lines.push(...codeRuleLines(plan, landed, { root, planId, base }));
  lines.push(...reviewLines(plan, landed, { root, planId, base }));
  for (const { task, title, done } of taskStates(plan.tasks, landed)) lines.push(`${done ? 'DONE' : 'OPEN'} Task ${task}: ${title}`);
  for (const check of manualChecks(plan.frame)) lines.push(`MANUAL ${check}`);
  return { lines, failed };
}
