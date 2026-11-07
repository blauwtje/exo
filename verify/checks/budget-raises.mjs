import fs from 'node:fs';
import { git } from '#git';

const NAME = 'budget raises';
const BUDGETS_PATH = 'verify/budgets.mjs';
const BASE_REFS = ['main', 'origin/main'];
const RAISE_LINE = /^Budget-raise:[ \t]+(\S+)[ \t]+(-?\d+(?:\.\d+)?)[ \t]+to[ \t]+(-?\d+(?:\.\d+)?):[ \t]*(\S.*)$/;

function mergeBase(root) {
  for (const ref of BASE_REFS) {
    const found = git(root, ['merge-base', 'HEAD', ref]);
    if (found.status === 0) return found.stdout.trim();
  }
  return null;
}

function numericLeaves(value, prefix, leaves) {
  if (typeof value === 'number') {
    leaves.set(prefix, value);
    return leaves;
  }
  if (value === null || typeof value !== 'object') return leaves;
  for (const [key, child] of Object.entries(value)) {
    numericLeaves(child, prefix === '' ? key : `${prefix}.${key}`, leaves);
  }
  return leaves;
}

async function budgetValues(source) {
  const encoded = Buffer.from(source).toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}`);
  return numericLeaves(module, '', new Map());
}

function claimedRaises(root, base) {
  const log = git(root, ['log', `${base}..HEAD`, '--format=%B%x1e']);
  if (log.status !== 0) return null;
  const claimed = new Set();
  for (const line of log.stdout.split('\n')) {
    const match = RAISE_LINE.exec(line.replace(/\x1e/g, '').trim());
    if (match) claimed.add(`${match[1]} ${Number(match[2])} ${Number(match[3])}`);
  }
  return claimed;
}

function raisedValues(before, after) {
  const raised = [];
  for (const [id, now] of after) {
    if (before.has(id) && now > before.get(id)) raised.push({ id, old: before.get(id), now });
  }
  return raised;
}

export async function checkBudgetRaises(report, repository) {
  const root = repository.root;
  const base = mergeBase(root);
  if (base === null) {
    report.result('UNRUN', NAME, `the merge base with ${BASE_REFS.join(' or ')} is not available to compare against`);
    return;
  }
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  if (head === base) {
    report.assert(true, NAME, 'no commits since the merge base, so no budget was raised', '');
    return;
  }
  const previous = git(root, ['show', `${base}:${BUDGETS_PATH}`]);
  const file = repository.join(BUDGETS_PATH);
  if (previous.status !== 0 || !fs.existsSync(file)) {
    report.assert(true, NAME, `${BUDGETS_PATH} is not in both the merge base and the working tree`, '');
    return;
  }
  const claimed = claimedRaises(root, base);
  if (claimed === null) {
    report.result('UNRUN', NAME, `git could not list the commits since ${base}`);
    return;
  }
  const raised = raisedValues(await budgetValues(previous.stdout), await budgetValues(fs.readFileSync(file, 'utf8')));
  const unclaimed = raised.filter(({ id, old, now }) => !claimed.has(`${id} ${old} ${now}`));
  const detail = unclaimed.map(({ id, old, now }) => `${id} raised ${old} to ${now}`).join('; ');
  report.assert(
    unclaimed.length === 0,
    NAME,
    `${raised.length} raised budget values since the merge base, each with a Budget-raise line`,
    `${detail}; trim the text instead, or add \`Budget-raise: <id> <old> to <new>: <reason>\` to the body of a commit in the range`
  );
}
