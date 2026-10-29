import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proofRecordPath } from '#plan-tasks';
import { ledgerPath, latestRound, ledgerRows } from './merge-reviews.mjs';
import { reviewShardTokens } from '#context-limits';
import { branchFiles, shardBranch, shardDiffText, shardFileLines } from './review-shards.mjs';

const GATE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_RULES = path.join(GATE_DIRECTORY, '..', 'references', 'review-rules.md');
const DEFAULT_CODE_STANDARD = path.join(GATE_DIRECTORY, '..', '..', 'route-skills', 'references', 'code-standard.md');
const STANDARD_FILES = ['CLAUDE.md', path.join('.claude', 'CLAUDE.md'), 'AGENTS.md'];
const MARKDOWN_PATH = /`([^`\s]+\.md)`|\]\(([^)\s]+\.md)\)/g;

function standardFileMention(root, file) {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => /code standard/i.test(line));
  const mentions = lines.flatMap((line) => [...line.matchAll(MARKDOWN_PATH)].map((match) => path.resolve(root, match[1] ?? match[2])));
  return mentions.find((mention) => fs.existsSync(mention)) ?? null;
}

export function codeStandardPath(root) {
  for (const name of STANDARD_FILES) {
    const mention = standardFileMention(root, path.join(root, name));
    if (mention !== null) return mention;
  }
  return DEFAULT_CODE_STANDARD;
}

function dispatchFields(checkout, planPath, base) {
  return [
    `code-standard=${codeStandardPath(checkout)}`,
    `review-rules=${REVIEW_RULES}`,
    `plan=${planPath}`,
    `checkout=${checkout}`,
    `base=${base}`
  ].join(' ');
}

function branchDispatch({ common, checkout, range, shards }) {
  const exo = path.join(checkout, '.exo');
  const ledger = latestRound(checkout) > 0 ? ` ledger=${ledgerPath(checkout)}` : '';
  if (shards === 1) return [`DISPATCH Branch: ${common} scope=branch ${range} findings=${path.join(exo, 'review-branch.md')}${ledger}`];
  return Array.from({ length: shards }, (_, index) => {
    const number = index + 1;
    return `DISPATCH Branch ${number}/${shards}: ${common} scope=branch ${range} input=${shardInputPath(checkout, number)} findings=${path.join(exo, `review-branch-${number}.md`)}${ledger}`;
  });
}

export function dispatchLines(printed, { root, planPath, base, head, shards = 1 }) {
  const checkout = path.resolve(root ?? '.');
  const common = dispatchFields(checkout, planPath, base);
  const lines = [];
  if (printed.some((line) => /^REVIEW Branch [^:]*: review-branch\b/.test(line))) {
    lines.push(...branchDispatch({ common, checkout, range: `${base}..${head}`, shards }));
  }
  if (printed.some((line) => /^OVERLAP (?!none)/.test(line))) {
    lines.push(`DISPATCH Overlap: ${common} scope=overlap findings=${path.join(checkout, '.exo', 'review-overlap.md')}`);
  }
  return lines;
}

function ledgerSummary(checkout) {
  if (latestRound(checkout) === 0) return [];
  return ledgerRows(checkout).filter((row) => row.state !== 'none').map((row) => `- round ${row.round}: ${row.rule}@${row.path}:${row.range} ${row.weight} ${row.state}`);
}

function shardInputPath(checkout, number) {
  return path.join(checkout, `.exo/review-input-${number}.md`);
}

function shardDiffLines(shard, { number, shards }) {
  if (shards === 1) return ['```diff', shardDiffText(shard).trimEnd(), '```'];
  return [`Shard ${number} of ${shards}; review only these files:`, ...shardFileLines(shard), '```diff', shardDiffText(shard).trimEnd(), '```'];
}

const RED_LINE = /^Red:/;
const REPORT_RED_LINE = /^(?:Test first|Red):/;

function linesOf(file, pattern) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => pattern.test(line));
}

export function redLines(plan, landed, { checkout, planId }) {
  const lines = plan.tasks.filter((task) => landed.has(task.number)).flatMap((task) => {
    const proven = linesOf(proofRecordPath(checkout, planId, task.number), RED_LINE);
    const found = proven.length > 0 ? proven : linesOf(path.join(checkout, '.exo', `implementer-${task.number}.md`), REPORT_RED_LINE);
    return found.map((line) => `Task ${task.number}: ${line}`);
  });
  return lines.length === 0 ? ['none'] : lines;
}

const BOUNDARY_RULE = 'A bypass in an `out` class of a Boundary below gets weight `out-of-scope`, marked `report`, never `fix`.';

export function boundaryLines(plan, landed) {
  const lines = plan.tasks.filter((task) => landed.has(task.number) && task.boundary !== null)
    .map(({ number, boundary }) => `Task ${number}: Boundary: in ${boundary.in} | out ${boundary.out} | test ${boundary.test}`);
  return lines.length === 0 ? ['none'] : lines;
}

function clearShardInputs(exo) {
  if (!fs.existsSync(exo)) return;
  for (const name of fs.readdirSync(exo).filter((entry) => /^review-input(?:-\d+)?\.md$/.test(entry))) fs.rmSync(path.join(exo, name));
}

function shardInputText(frame, { shard, number, shards, redSection, boundaries, checkout, ledger }) {
  return [
    '## Goal', frame.goal, '',
    '## Non-goals', ...frame.nonGoals.map((goal) => `- ${goal}`), '',
    '## Branch diff', ...shardDiffLines(shard, { number, shards }), '',
    '## Red lines', ...redSection, '',
    '## Boundaries', BOUNDARY_RULE, ...boundaries, '',
    `code-standard=${codeStandardPath(checkout)}`,
    ...(ledger.length === 0 ? [] : ['', '## Ledger', ...ledger]),
    ''
  ].join('\n');
}

export function writeReviewInput(frame, { checkout, base, head, redSection, boundaries = ['none'], taskOf = new Map() }) {
  const ledger = ledgerSummary(checkout);
  const exo = path.join(checkout, '.exo');
  const shards = shardBranch(branchFiles({ checkout, base, head, taskOf }), reviewShardTokens());
  clearShardInputs(exo);
  fs.mkdirSync(exo, { recursive: true });
  shards.forEach((shard, index) => {
    const number = index + 1;
    const text = shardInputText(frame, { shard, number, shards: shards.length, redSection, boundaries, checkout, ledger });
    const file = shards.length === 1 ? path.join(exo, 'review-input.md') : shardInputPath(checkout, number);
    fs.writeFileSync(file, text);
  });
  return shards.length;
}
