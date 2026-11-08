import fs from 'node:fs';
import path from 'node:path';
import { gitText } from '../../../lib/git.mjs';
import { criterionCommand } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { compareToBaseline, parseResultRuns } from '../../../lib/benchmark-compare.mjs';

const DEFAULT_RESULTS = 'benchmarks/results';
const NO_OVERRIDE = { reason: null, ignored: false };

function resultsFolder(plan) {
  const command = criterionCommand(plan.frame['Success criterion']) ?? '';
  return command.match(/--results[= ](\S+)/)?.[1] ?? DEFAULT_RESULTS;
}

function newestSweep(folder) {
  if (!fs.existsSync(folder)) return null;
  const names = fs.readdirSync(folder).filter((name) => name.endsWith('-sweep.md')).sort();
  return names.length === 0 ? null : path.join(folder, names.at(-1));
}

function specCommitPlan(planPath, root) {
  const relative = path.relative(root, path.resolve(root, planPath));
  const added = gitText(root, ['log', '--diff-filter=A', '--format=%H', '--', relative]).split('\n').at(-1);
  if (!added) return null;
  return gitText(root, ['show', `${added}:${relative}`], { trim: false });
}

export function benchmarkOverride(plan, { root, planPath }) {
  if (plan.benchmarkOverride === null) return NO_OVERRIDE;
  const atSpec = planPath === undefined ? null : specCommitPlan(planPath, root);
  const committed = atSpec === null ? null : parsePlan(atSpec).benchmarkOverride;
  if (committed === plan.benchmarkOverride) return { reason: committed, ignored: false };
  return { reason: null, ignored: true };
}

function verdictLine(compared) {
  if (!compared.blocked) return 'PASS benchmark';
  const bad = compared.cells.filter((cell) => cell.status !== 'ok');
  const kind = bad.some((cell) => cell.status === 'unmeasured') ? 'unmeasured' : 'regression';
  return `FAIL benchmark (${kind}: ${bad.map((cell) => `${cell.cell} ${cell.status}`).join(', ')})`;
}

function compareResults(plan, root) {
  const baseline = plan.successBaseline;
  const file = newestSweep(path.resolve(root, resultsFolder(plan)));
  if (file === null) return null;
  const baseMarkdown = gitText(root, ['show', `${baseline.commit}:${baseline.file}`], { trim: false });
  return compareToBaseline({
    baseline: parseResultRuns(baseMarkdown),
    candidate: parseResultRuns(fs.readFileSync(file, 'utf8')),
  });
}

function safeCompare(plan, root) {
  try {
    return compareResults(plan, root);
  } catch (error) {
    return String(error.message).split('\n')[0];
  }
}

export function benchmarkLines(plan, { root, planPath }) {
  const baseline = plan.successBaseline;
  if (baseline === null) return ['PASS benchmark (baseline: none)'];
  if (baseline.malformed !== undefined) return ['FAIL benchmark (unmeasured: malformed Baseline line)'];
  const compared = safeCompare(plan, root);
  if (typeof compared === 'string') return [`FAIL benchmark (unmeasured: ${compared})`];
  if (compared === null) return ['FAIL benchmark (unmeasured: no *-sweep.md results file)'];
  const override = benchmarkOverride(plan, { root, planPath });
  const warning = override.ignored ? ['WARN benchmark override ignored (added after the run started)'] : [];
  if (compared.blocked && override.reason !== null) return [`WARN benchmark override (${override.reason})`];
  return [verdictLine(compared), ...warning];
}
