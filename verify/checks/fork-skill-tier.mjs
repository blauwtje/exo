import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INHERIT, readKindTable } from '../../lib/model-kinds.mjs';
import { findUnknownKindLabels } from '../model-kinds.mjs';

const WRITE_COMMAND = 'node verify/checks/fork-skill-tier.mjs --write';
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const TIER_FIELDS = ['model', 'effort'];

function readRawTable(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'lib', 'model-kinds.json'), 'utf8'));
}

function forkSkillFiles(root) {
  const base = path.join(root, 'skills');
  return fs.readdirSync(base)
    .map((name) => `skills/${name}/SKILL.md`)
    .filter((file) => fs.existsSync(path.join(root, file)))
    .filter((file) => /^context: fork$/m.test(FRONTMATTER.exec(fs.readFileSync(path.join(root, file), 'utf8'))?.[1] ?? ''));
}

function expectedLines(root, kind) {
  const raw = readRawTable(root);
  const provider = raw.providers[raw.provider];
  const resolved = readKindTable(path.join(root, 'lib', 'model-kinds.json'), { deep: provider.tiers.deep }).kinds[kind];
  const tier = raw.kinds[kind].on.tier;
  if (tier === 'deep' || tier === INHERIT) return { tier };
  return { model: resolved.model, effort: resolved.effort };
}

function frontmatterLines(text) {
  return FRONTMATTER.exec(text)[1].split('\n');
}

function currentValue(lines, field) {
  const line = lines.find((row) => row.startsWith(`${field}:`));
  return line === undefined ? null : line.slice(field.length + 1).trim();
}

function findInheritKinds(root) {
  const raw = readRawTable(root);
  return Object.entries(raw.kinds)
    .filter(([, kind]) => Object.values(kind).some((cell) => cell.tier === INHERIT))
    .map(([name]) => `kind ${name} sits on tier ${INHERIT} for the default provider ${raw.provider}; give it a tier of the provider`);
}

export function findForkSkillTierFailures(root) {
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'));
  const failures = findInheritKinds(root);
  for (const file of forkSkillFiles(root)) {
    const kind = table.skills?.[file];
    if (kind === undefined) {
      failures.push(`${file}: context: fork with no skills entry in lib/model-kinds.json; add one, then run ${WRITE_COMMAND}`);
      continue;
    }
    const expected = expectedLines(root, kind);
    if (expected.tier !== undefined) {
      failures.push(`${file}: kind ${kind} sits on tier ${expected.tier}, which frontmatter cannot follow; pick another kind`);
      continue;
    }
    const lines = frontmatterLines(fs.readFileSync(path.join(root, file), 'utf8'));
    const differs = TIER_FIELDS.some((field) => currentValue(lines, field) !== expected[field]);
    if (differs) failures.push(`${file}: model and effort differ from kind ${kind} (${expected.model}, ${expected.effort}); run ${WRITE_COMMAND}`);
  }
  return [...failures, ...findUnknownKindLabels(root, table).map((line) => `${line}; use a kind of lib/model-kinds.json`)];
}

export function writeForkSkillTiers(root) {
  const table = readKindTable(path.join(root, 'lib', 'model-kinds.json'));
  for (const file of forkSkillFiles(root)) {
    const kind = table.skills?.[file];
    if (kind === undefined) continue;
    const expected = expectedLines(root, kind);
    if (expected.tier !== undefined) continue;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const kept = frontmatterLines(text).filter((row) => !TIER_FIELDS.some((field) => row.startsWith(`${field}:`)));
    const written = [...kept, `model: ${expected.model}`, `effort: ${expected.effort}`].join('\n');
    fs.writeFileSync(path.join(root, file), text.replace(FRONTMATTER, `---\n${written}\n---\n`));
  }
}

export function checkForkSkillTier(report, repository) {
  const failures = findForkSkillTierFailures(repository.root);
  report.assert(
    failures.length === 0,
    'fork skill tier',
    'every fork skill carries the model and effort of its kind, and every exo-kind label names a table kind',
    failures.join('; ')
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  writeForkSkillTiers(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
}
