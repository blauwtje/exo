import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BUFFER = 1 << 30;
const IDENTITY = ['-c', 'user.name=exo-bench', '-c', 'user.email=exo-bench@localhost', '-c', 'commit.gpgsign=false'];
const DROPPED_PATHS = ['benchmarks/results'];
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.exo', '.worktrees']);

export const SPLITS = {
  routing: {
    skill: 'find-cause',
    file: 'skills/find-cause/SKILL.md',
    data: 'benchmarks/routing/prompts.json',
    train: 'train',
    heldOut: 'held-out'
  },
  locate: {
    file: 'agents/locate-code.md',
    data: 'benchmarks/locate-recall/briefs.json',
    train: ['context-limit-note', 'model-kinds', 'check-cache', 'exo-prune', 'paid-benchmark-guard', 'statusline'],
    heldOut: ['git-deny', 'stall-guard', 'speed-ledger', 'remove-worktree']
  }
};

function spec(target) {
  const found = SPLITS[target];
  if (!found) throw new Error(`unknown target '${target}'; known: ${Object.keys(SPLITS).join(', ')}`);
  return found;
}

function git(args, { cwd, input, check = true } = {}) {
  const result = spawnSync('git', args, { cwd, input, maxBuffer: MAX_BUFFER });
  if (check && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd ?? '.'}: ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

function gitText(args, options) {
  return String(git(args, options)).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function ids(target, split) {
  return split === 'held-out' ? spec(target).heldOut : spec(target).train;
}

export function scorerView(tree, target, split, commit) {
  const { data } = spec(target);
  const file = path.join(tree, data);
  const content = readJson(file);
  if (target === 'routing') {
    const label = split === 'held-out' ? SPLITS.routing.heldOut : SPLITS.routing.train;
    writeJson(file, content.filter((entry) => entry.split === label));
    return file;
  }
  const keep = new Set(ids(target, split));
  writeJson(file, { ...content, commit: commit ?? content.commit, briefs: content.briefs.filter((brief) => keep.has(brief.id)) });
  return file;
}

function extractArchive(repo, ref, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const archive = git(['archive', '--format=tar', ref], { cwd: repo });
  const unpacked = spawnSync('tar', ['-x', '-C', dest], { input: archive, maxBuffer: MAX_BUFFER });
  if (unpacked.status !== 0) throw new Error(`tar failed: ${String(unpacked.stderr).trim()}`);
}

function clearTree(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function dropLeaks(tree) {
  for (const relative of DROPPED_PATHS) fs.rmSync(path.join(tree, relative), { recursive: true, force: true });
}

function commitAll(dir, message) {
  git(['add', '--all', '--force'], { cwd: dir });
  git([...IDENTITY, 'commit', '--quiet', '--allow-empty', '-m', message], { cwd: dir });
  return gitText(['rev-parse', 'HEAD'], { cwd: dir });
}

export function heldOutItems(tree, target) {
  const { data } = spec(target);
  const content = readJson(path.join(tree, data));
  if (target === 'routing') {
    const entries = content.filter((entry) => entry.split === SPLITS.routing.heldOut);
    return { prompts: entries.map((entry) => entry.prompt), briefs: [] };
  }
  const wanted = new Set(SPLITS.locate.heldOut);
  const briefs = content.briefs.filter((brief) => wanted.has(brief.id));
  return { prompts: briefs.map((brief) => brief.prompt), briefs: briefs.map(({ id, prompt, expected }) => ({ id, prompt, expected })) };
}

function squash(text) {
  return text.replace(/\s+/g, ' ');
}

function containsText(text, squashed, needle) {
  return squashed.includes(squash(needle)) || text.includes(JSON.stringify(needle).slice(1, -1));
}

function containsToken(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

function findInText(name, text, items) {
  if (text.includes('\0')) return [];
  const squashed = squash(text);
  const hits = [];
  for (const prompt of items.prompts) {
    if (containsText(text, squashed, prompt)) hits.push({ file: name, kind: 'prompt', item: prompt.slice(0, 60) });
  }
  for (const brief of items.briefs) {
    const listed = containsToken(text, brief.id) && brief.expected.every((expected) => text.includes(expected));
    if (listed) hits.push({ file: name, kind: 'brief', item: brief.id });
  }
  return hits;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function parseBatch(buffer) {
  const objects = [];
  let at = 0;
  while (at < buffer.length) {
    const end = buffer.indexOf(10, at);
    if (end < 0) break;
    const [sha, type, size] = buffer.toString('utf8', at, end).split(' ');
    if (type === undefined || size === undefined) break;
    const length = Number(size);
    objects.push({ sha, type, text: buffer.toString('utf8', end + 1, end + 1 + length) });
    at = end + 1 + length + 1;
  }
  return objects;
}

function historyObjects(dir) {
  const listed = gitText(['rev-list', '--objects', '--all'], { cwd: dir });
  const names = new Map();
  for (const line of listed.split('\n')) {
    const [sha, ...rest] = line.split(' ');
    if (sha) names.set(sha, rest.join(' '));
  }
  const batch = git(['cat-file', '--batch'], { cwd: dir, input: `${[...names.keys()].join('\n')}\n` });
  return parseBatch(batch)
    .filter((object) => object.type === 'blob' || object.type === 'commit')
    .map((object) => ({ ...object, name: names.get(object.sha) || `commit ${object.sha.slice(0, 8)}` }));
}

export function leakScan(dir, target, { items = heldOutItems(dir, target), history = true } = {}) {
  const hits = [];
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    hits.push(...findInText(path.relative(dir, file), text, items));
  }
  if (history && fs.existsSync(path.join(dir, '.git'))) {
    for (const object of historyObjects(dir)) hits.push(...findInText(`history:${object.name}`, object.text, items));
  }
  const seen = new Set();
  return hits.filter((hit) => {
    const key = `${hit.file}|${hit.kind}|${hit.item}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatHits(hits) {
  return hits.slice(0, 10).map((hit) => `${hit.file} (${hit.kind}: ${hit.item})`).join('; ');
}

function buildFixture(repo, commit, dest) {
  extractArchive(repo, commit, dest);
  dropLeaks(dest);
  git(['init', '--quiet'], { cwd: dest });
  return commitAll(dest, `fixture ${commit}`);
}

export function buildArmCopy({ repo, target, dest }) {
  const items = heldOutItems(repo, target);
  fs.mkdirSync(dest, { recursive: true });
  const fixtureSource = target === 'locate' ? readJson(path.join(repo, SPLITS.locate.data)).commit : null;
  const fixtureCommit = fixtureSource === null ? null : buildFixture(repo, fixtureSource, dest);
  if (fixtureCommit === null) git(['init', '--quiet'], { cwd: dest });
  if (fixtureCommit !== null) clearTree(dest);
  extractArchive(repo, 'HEAD', dest);
  scorerView(dest, target, 'train', fixtureCommit ?? undefined);
  dropLeaks(dest);
  commitAll(dest, 'train view');
  const hits = leakScan(dest, target, { items });
  if (hits.length > 0) throw new Error(`held-out text leaked into the ${target} arm copy: ${formatHits(hits)}`);
  return { dest, fixtureCommit };
}

export function pristineView({ repo, target, split, targetText, dest }) {
  const head = gitText(['rev-parse', 'HEAD'], { cwd: repo });
  git(['clone', '--quiet', '--no-hardlinks', repo, dest]);
  git(['checkout', '--quiet', '--detach', head], { cwd: dest });
  scorerView(dest, target, split);
  fs.writeFileSync(path.join(dest, spec(target).file), targetText);
  return dest;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function routingScore(outJson) {
  const hook = outJson?.results?.['sonnet:low']?.hook ?? {};
  const recalls = Object.values(hook)
    .map((split) => split?.[SPLITS.routing.skill]?.recall)
    .filter((recall) => typeof recall === 'number');
  return mean(recalls);
}

function f1(session) {
  if (session.error || typeof session.precision !== 'number' || typeof session.recall !== 'number') return 0;
  const total = session.recall + session.precision;
  return total === 0 ? 0 : (2 * session.recall * session.precision) / total;
}

export function locateScore(outJson) {
  const byBrief = new Map();
  for (const session of outJson?.sessions ?? []) {
    if (!byBrief.has(session.brief)) byBrief.set(session.brief, []);
    byBrief.get(session.brief).push(f1(session));
  }
  return mean([...byBrief.values()].map(mean));
}

export function scorerSpend(outJson) {
  return (outJson?.sessions ?? []).reduce((sum, session) => sum + (session.cost_usd ?? 0), 0);
}

export function spendRefusal({ spent, projected, cap }) {
  const total = spent + projected;
  if (total <= cap) return null;
  return `spend cap exceeded: $${spent.toFixed(2)} spent + $${projected.toFixed(2)} projected = $${total.toFixed(2)} > $${cap.toFixed(2)}; raise --spend-cap or run fewer arms`;
}

export function gains(scores, baseline, target) {
  const base = baseline?.[target];
  if (!base) throw new Error(`baseline has no '${target}' entry; expected {"${target}":{"train":<n>,"heldOut":<n>}}`);
  const heldOut = Array.isArray(scores.heldOut) ? mean(scores.heldOut) : scores.heldOut;
  return { train: scores.train - base.train, heldOut: heldOut - base.heldOut };
}
