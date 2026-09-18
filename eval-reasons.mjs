// Store a reason beside every failed llm grader vote of one `claude plugin eval`
// run. The runner's judges answer one word, PASS or FAIL, and keep no
// reasoning, so for each grader that failed a run this asks one more judge, on
// the same criterion, the same agent output and the run's judge model, to
// reason first and then vote. Its vote sits beside the runner's votes and can
// disagree with them; a disagreement is itself worth reading. A passed vote
// gets no reason, so a lenient runner judge shows only as a high pass rate.
//
//   node eval-reasons.mjs [results-dir]    defaults to the newest evals/results/ run
//
// Writes judge-reasons.json into the results directory and prints each grader's
// pass rate across runs, per arm; a run that ended in an error is counted apart.
// Then prints one GATE line per arm, the verdict a plan's final verification reads.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const RESULTS_ROOT = path.join(import.meta.dirname, 'evals', 'results');
// The runner's own default when a run names no --judge-model.
const DEFAULT_JUDGE_MODEL = 'haiku';
const CONCURRENT_JUDGES = 4;
const JUDGE_TIMEOUT_MS = 180_000;
const SYSTEM_PROMPT = 'You are a strict evaluation judge for coding-agent traces.';
// A gate tolerates one failed run per grader, because the one-word judge fails
// correct answers often enough that n of n fails a working skill; CONTRIBUTING.md
// holds the measurement. Below three runs one failure is most of the arm, so no gate.
const TOLERATED_FAILED_RUNS = 1;
const MINIMUM_GATE_RUNS = 3;

function newestResultsDirectory() {
  if (!fs.existsSync(RESULTS_ROOT)) return undefined;
  const runs = fs.readdirSync(RESULTS_ROOT)
    .filter((name) => fs.existsSync(path.join(RESULTS_ROOT, name, 'aggregate-result.json')))
    .sort();
  const newest = runs.at(-1);
  return newest === undefined ? undefined : path.join(RESULTS_ROOT, newest);
}

function judgePrompt(criteria, focus, agentOutput) {
  return [
    'You are grading the output of a coding agent against a criterion.',
    '',
    'Criterion:',
    criteria,
    '',
    `Agent output (${focus}):`,
    agentOutput,
    '',
    'First explain, in at most four sentences, which parts of the criterion the output meets and which it misses, quoting the output where it decides the verdict.',
    'Then end with one line that reads exactly VERDICT: PASS or VERDICT: FAIL.'
  ].join('\n');
}

// The last VERDICT line wins, so a quoted criterion earlier in the answer cannot decide it.
function parseVerdict(answer) {
  const verdicts = [...answer.matchAll(/^\s*VERDICT:\s*(PASS|FAIL)\s*$/gim)];
  const last = verdicts.at(-1);
  if (last === undefined) return { passed: null, reasoning: answer.trim() };
  const reasoning = answer.slice(0, last.index).trim();
  return { passed: last[1].toUpperCase() === 'PASS', reasoning };
}

// No user or project settings load, so no plugin, hook or CLAUDE.md reaches the judge.
function askJudge(model, prompt) {
  const args = [
    '-p', '--model', model, '--system-prompt', SYSTEM_PROMPT,
    '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands',
    '--tools', '', '--no-session-persistence', '--output-format', 'json'
  ];
  return new Promise((resolve, reject) => {
    const child = execFile('claude', args, { cwd: os.tmpdir(), timeout: JUDGE_TIMEOUT_MS, maxBuffer: 10_000_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`claude -p failed: ${String(stderr).trim() || error.message}`));
        return;
      }
      const reply = JSON.parse(String(stdout));
      if (reply.is_error) {
        reject(new Error(`claude -p returned an error: ${reply.result}`));
        return;
      }
      resolve({ answer: String(reply.result), costUsd: reply.total_cost_usd ?? 0 });
    });
    child.stdin.end(prompt);
  });
}

function collectVotes(aggregate) {
  const votes = [];
  for (const evalCase of aggregate.cases) {
    const llmGraders = new Map(evalCase.graders.filter((grader) => grader.type === 'llm').map((grader) => [grader.name, grader.config]));
    for (const [arm, runs] of Object.entries(evalCase.arms)) {
      runs.forEach((run, runIndex) => {
        if (run.error) {
          votes.push({ case: evalCase.name, arm, run: runIndex, grader: null, error: run.error });
          return;
        }
        for (const grader of run.graders ?? []) {
          const config = llmGraders.get(grader.name);
          if (config === undefined || grader.judgeVotes === undefined) continue;
          votes.push({
            case: evalCase.name,
            arm,
            run: runIndex,
            grader: grader.name,
            runnerVotes: grader.judgeVotes,
            runnerPassed: grader.passed,
            criteria: config.criteria,
            focus: typeof config.focus === 'string' ? config.focus : 'last_message',
            agentOutput: grader.evidence ?? ''
          });
        }
      });
    }
  }
  return votes;
}

async function reasonAll(votes, model) {
  const records = new Array(votes.length);
  let next = 0;
  let done = 0;
  let costUsd = 0;
  async function worker() {
    while (next < votes.length) {
      const index = next++;
      const vote = votes[index];
      const { answer, costUsd: callCost } = await askJudge(model, judgePrompt(vote.criteria, vote.focus, vote.agentOutput));
      const verdict = parseVerdict(answer);
      costUsd += callCost;
      const { criteria, focus, ...kept } = vote;
      records[index] = { ...kept, reasonedPassed: verdict.passed, reasoning: verdict.reasoning };
      done++;
      console.error(`judged ${done}/${votes.length}  $${costUsd.toFixed(2)}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENT_JUDGES }, worker));
  return { records, costUsd };
}

function percent(count, total) {
  return total === 0 ? '-' : `${Math.round((100 * count) / total)}%`;
}

function printPassRates(graded, reasoned, erroredByArm) {
  const groups = new Map();
  for (const vote of graded) {
    const key = `${vote.case}\t${vote.arm}\t${vote.grader}`;
    if (!groups.has(key)) groups.set(key, { arm: vote.arm, passes: 0, total: 0, reasonedPasses: 0 });
    const group = groups.get(key);
    group.total++;
    if (vote.runnerPassed) group.passes++;
  }
  for (const record of reasoned) {
    if (record.reasonedPassed === true) groups.get(`${record.case}\t${record.arm}\t${record.grader}`).reasonedPasses++;
  }
  console.log('case\tarm\tgrader\tpass rate\tfailed\treasoning judge passed a failure\terrored runs');
  for (const [key, group] of groups) {
    const rate = `${percent(group.passes, group.total)} (${group.passes}/${group.total})`;
    console.log(`${key}\t${rate}\t${group.total - group.passes}\t${group.reasonedPasses}\t${erroredByArm.get(group.arm) ?? 0}`);
  }
}

// Failed runs per grader of one arm, free graders included. An errored run fails
// every grader, a grader without a verdict fails as it does in the pass-rate table,
// and a failed llm verdict the reasoning judge reversed is counted apart.
function failedRunsByGrader(evalCase, arm, runs, reversedVotes) {
  const erroredRuns = runs.filter((run) => run.error).length;
  const counts = new Map(evalCase.graders.map((grader) => [grader.name, { failed: erroredRuns, reversed: 0 }]));
  runs.forEach((run, runIndex) => {
    if (run.error) return;
    for (const grader of run.graders ?? []) {
      if (grader.passed === true) continue;
      if (!counts.has(grader.name)) counts.set(grader.name, { failed: erroredRuns, reversed: 0 });
      const count = counts.get(grader.name);
      count.failed++;
      if (reversedVotes.has(`${evalCase.name}\t${arm}\t${runIndex}\t${grader.name}`)) count.reversed++;
    }
  });
  return counts;
}

// PASS: no grader failed more than the tolerated runs. DISPUTED: one did, but
// only through verdicts the reasoning judge reversed, so judge-reasons.json is
// read before anything is rerun. FAIL: one did on verdicts both judges share.
function printGates(aggregate, reasoned) {
  const reversedVotes = new Set(reasoned
    .filter((record) => record.reasonedPassed === true)
    .map((record) => `${record.case}\t${record.arm}\t${record.run}\t${record.grader}`));
  for (const evalCase of aggregate.cases) {
    for (const [arm, runs] of Object.entries(evalCase.arms)) {
      // eval-case.mjs marks a draft run, which is for wording and never a verdict.
      if (aggregate.suite?.authoritative === false) {
        console.log(`GATE NONE\t${evalCase.name}\t${arm}\tdraft run, a gate needs the full run`);
        continue;
      }
      if (runs.length < MINIMUM_GATE_RUNS) {
        console.log(`GATE NONE\t${evalCase.name}\t${arm}\t${runs.length} runs, a gate needs ${MINIMUM_GATE_RUNS}`);
        continue;
      }
      const counts = [...failedRunsByGrader(evalCase, arm, runs, reversedVotes)];
      const overTolerance = counts.filter(([, count]) => count.failed > TOLERATED_FAILED_RUNS);
      if (overTolerance.length === 0) {
        console.log(`GATE PASS\t${evalCase.name}\t${arm}\tno grader failed more than ${TOLERATED_FAILED_RUNS} of ${runs.length} runs`);
        continue;
      }
      const upheld = overTolerance.filter(([, count]) => count.failed - count.reversed > TOLERATED_FAILED_RUNS);
      const verdict = upheld.length === 0 ? 'DISPUTED' : 'FAIL';
      const failures = overTolerance.map(([name, count]) => `${name} failed ${count.failed} of ${runs.length} runs, ${count.reversed} reversed by the reasoning judge`);
      console.log(`GATE ${verdict}\t${evalCase.name}\t${arm}\t${failures.join('; ')}`);
    }
  }
}

const resultsDirectory = process.argv[2] ?? newestResultsDirectory();
if (resultsDirectory === undefined) {
  console.error('no results directory given and none under evals/results/');
  process.exit(1);
}
const aggregateFile = path.join(resultsDirectory, 'aggregate-result.json');
if (!fs.existsSync(aggregateFile)) {
  console.error(`${aggregateFile} does not exist`);
  process.exit(1);
}

const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
// A run without --judge-model records no model; the source says so, so two runs
// judged by different models are never compared unawares.
const recordedJudgeModel = aggregate.suite?.judgeModel;
const judgeModel = recordedJudgeModel ?? DEFAULT_JUDGE_MODEL;
const judgeModelSource = recordedJudgeModel === undefined ? 'runner default, not recorded by the run' : 'recorded by the run';
const collected = collectVotes(aggregate);
const graded = collected.filter((vote) => vote.grader !== null);
// A case graded by free graders alone, or one whose every run errored, still gets its gate.
if (graded.length === 0) console.error(`${aggregateFile} holds no llm grader votes`);
const erroredByArm = new Map();
for (const vote of collected.filter((entry) => entry.grader === null)) {
  erroredByArm.set(vote.arm, (erroredByArm.get(vote.arm) ?? 0) + 1);
}

const failed = graded.filter((vote) => !vote.runnerPassed);
const { records, costUsd } = await reasonAll(failed, judgeModel);
const reasonsFile = path.join(resultsDirectory, 'judge-reasons.json');
const errors = collected.filter((entry) => entry.grader === null);
const reasons = { judgeModel, judgeModelSource, costUsd, votes: records, errors };
fs.writeFileSync(reasonsFile, `${JSON.stringify(reasons, null, 2)}\n`);
console.log(`judge model: ${judgeModel} (${judgeModelSource})`);
printPassRates(graded, records, erroredByArm);
printGates(aggregate, records);
console.error(`wrote ${reasonsFile}`);
