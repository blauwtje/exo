// Applies lib/model-kinds.json to the files it names. `findKindDrift` lists
// every place a file disagrees with its kind as { file, field, expected,
// actual } records, empty when all match; `writeKinds` rewrites those places.
//
//   node verify/model-kinds.mjs            list drift and exit 1 when any
//   node verify/model-kinds.mjs --write    write the table into the files
//
// An agent entry may hold a `description`; the writer sets the file's
// description to it, which is how a generated twin says when it is used
// instead of its source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { EFFORTS, INHERIT, readKindTable } from '../lib/model-kinds.mjs';
import { isMain } from '../lib/script-flags.mjs';

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

function readField(text, field) {
  const [, block] = FRONTMATTER.exec(text);
  const line = block.split('\n').find((row) => row.startsWith(`${field}:`));
  return line === undefined ? null : line.slice(field.length + 1).trim();
}

// A null value removes the line. A missing line is inserted after `model:`
// (so `effort:` follows it), or at the end of the frontmatter without one.
function writeField(text, field, value) {
  const opening = FRONTMATTER.exec(text);
  const lines = opening[1].split('\n');
  const index = lines.findIndex((row) => row.startsWith(`${field}:`));
  if (index >= 0 && value === null) {
    lines.splice(index, 1);
  } else if (index >= 0) {
    lines[index] = `${field}: ${value}`;
  } else if (value !== null) {
    const afterModel = lines.findIndex((row) => row.startsWith('model:')) + 1;
    lines.splice(afterModel || lines.length, 0, `${field}: ${value}`);
  }
  return `---\n${lines.join('\n')}\n---\n${text.slice(opening[0].length)}`;
}

function bodyOf(text) {
  return text.slice(FRONTMATTER.exec(text)[0].length);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A dispatch on `inherit` omits the Agent `model`, so its line reads this
// clause where a dispatch on a model reads "on `<model>`".
const INHERIT_CLAUSE = 'with `model` omitted';
const EFFORT_CLAUSE = new RegExp(` at \`(?:${EFFORTS.join('|')})\` effort`);

// A dispatch line may hold any model a provider block lists or a tier maps, or
// `inherit`, so a table that switches provider or kind still finds and
// rewrites it. The slot is the clause "on `<model>`" or INHERIT_CLAUSE when the
// match holds one, else the bare model word, which cannot say `inherit`.
// `render` turns the kind's model into the slot's text. A clause slot may be
// followed by "at `<effort>` effort", which states the dispatch's effort; the
// match may hold it or not, and the writer sets it to the kind's effort.
function dispatchSlot(file, match, table) {
  const listed = Object.values(table.providers).flatMap((provider) => [...(provider.models ?? []), ...Object.values(provider.tiers)]);
  const alternatives = [...new Set([...listed, INHERIT])].map(escapeRegExp).join('|');
  const clause = new RegExp(`\\bon \`(?:${alternatives})\`|${escapeRegExp(INHERIT_CLAUSE)}`);
  const bare = new RegExp(`\\b(?:${alternatives})\\b`);
  const slot = clause.test(match) ? clause : bare;
  const found = slot.exec(match);
  if (found === null) {
    throw new Error(`${file}: "${match}" holds no model word`);
  }
  const before = escapeRegExp(match.slice(0, found.index));
  let rest = match.slice(found.index + found[0].length);
  const withEffort = slot === clause;
  if (withEffort) rest = rest.replace(EFFORT_CLAUSE, '');
  const after = escapeRegExp(rest);
  const effortGroup = withEffort ? `(?<effort>${EFFORT_CLAUSE.source})?` : '';
  const pattern = new RegExp(`${before}(?<model>${slot.source})${effortGroup}${after}`, 'd');
  function renderEffort(effort) {
    return withEffort && effort !== null ? ` at \`${effort}\` effort` : '';
  }
  function render(model) {
    if (slot === clause) return model === INHERIT ? INHERIT_CLAUSE : `on \`${model}\``;
    if (model === INHERIT) {
      throw new Error(`${file}: "${match}" cannot omit \`model\`; phrase its model as on \`<model>\``);
    }
    return model;
  }
  return { pattern, render, renderEffort, withEffort };
}

function opensWithKind(match, kind) {
  return new RegExp(`exo-kind: ${escapeRegExp(kind)}(?![\\w-])`).test(match);
}

function slotModel(text) {
  return text === INHERIT_CLAUSE ? INHERIT : text.replace(/^on `|`$/g, '');
}

function planKindWrites(root, table) {
  const plans = new Map();

  function open(file) {
    if (!plans.has(file)) {
      const location = path.join(root, file);
      const before = fs.existsSync(location) ? fs.readFileSync(location, 'utf8') : null;
      plans.set(file, { before, after: before, drift: [] });
    }
    return plans.get(file);
  }

  function setField(file, plan, field, expected) {
    const actual = plan.before === null ? null : readField(plan.before, field);
    if (field === 'model' || field === 'effort') {
      if (actual !== null && actual !== expected) plan.drift.push({ file, field, expected, actual });
      if (readField(plan.after, field) !== null) plan.after = writeField(plan.after, field, expected);
      return;
    }
    if (actual !== expected) plan.drift.push({ file, field, expected, actual });
    plan.after = writeField(plan.after, field, expected);
  }

  for (const [file, entry] of Object.entries(table.agents)) {
    const kind = table.kinds[entry.kind];
    const plan = open(file);
    const fields = { model: kind.model, effort: kind.effort };
    if (entry.generatedFrom !== undefined) {
      plan.after = open(entry.generatedFrom).after;
      fields.name = path.basename(file, '.md');
    }
    if (entry.description !== undefined) fields.description = JSON.stringify(entry.description);
    const sourceText = plan.after;
    for (const field of ['name', 'description', 'model', 'effort']) {
      if (field in fields) setField(file, plan, field, fields[field]);
    }
    if (entry.generatedFrom !== undefined && plan.before !== null) {
      if (bodyOf(plan.before) !== bodyOf(sourceText)) {
        plan.drift.push({ file, field: 'body', expected: `the body of ${entry.generatedFrom}`, actual: 'a different body' });
      }
    }
  }

  for (const [file, entry] of Object.entries(table.skills ?? {})) {
    const plan = open(file);
    for (const field of entry.fields) {
      setField(file, plan, field, table.kinds[entry.kind][field]);
    }
  }

  for (const { file, match, kind } of table.dispatches) {
    const plan = open(file);
    if (opensWithKind(match, kind)) {
      const hits = plan.after.split('\n').filter((line) => line.includes(match));
      if (hits.length !== 1) {
        throw new Error(`${file}: "${match}" matches ${hits.length} lines`);
      }
      continue;
    }
    const { pattern, render, renderEffort, withEffort } = dispatchSlot(file, match, table);
    const lines = plan.after.split('\n');
    const hits = lines.flatMap((line, index) => (pattern.test(line) ? [index] : []));
    if (hits.length !== 1) {
      throw new Error(`${file}: "${match}" matches ${hits.length} lines`);
    }
    const found = pattern.exec(lines[hits[0]]);
    const start = found.indices.groups.model[0];
    const end = (found.indices.groups.effort ?? found.indices.groups.model)[1];
    const expected = table.kinds[kind].model;
    const actual = slotModel(found.groups.model);
    if (actual !== expected) plan.drift.push({ file, field: 'model', expected, actual });
    if (withEffort) {
      const expectedEffort = table.kinds[kind].effort;
      const actualEffort = found.groups.effort?.replace(/^ at `|` effort$/g, '') ?? null;
      if (actualEffort !== expectedEffort) plan.drift.push({ file, field: 'effort', expected: expectedEffort, actual: actualEffort });
    }
    lines[hits[0]] = lines[hits[0]].slice(0, start) + render(expected) + renderEffort(table.kinds[kind].effort) + lines[hits[0]].slice(end);
    plan.after = lines.join('\n');
  }

  return plans;
}

const INHERITANCE_NOTE = 'the session effort would reach the subagent';

function markdownFiles(root, folder) {
  const base = path.join(root, folder);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { recursive: true })
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(folder, name).split(path.sep).join('/'));
}

export function findInheritanceGaps(root, table) {
  const gaps = [];
  for (const [file, entry] of Object.entries(table.agents)) {
    if (table.kinds[entry.kind].effort === null) gaps.push(`${file}: kind ${entry.kind} has no effort, ${INHERITANCE_NOTE}`);
  }
  const covered = new Map();
  for (const { file, match, kind } of table.dispatches) {
    if (opensWithKind(match, kind)) {
      covered.set(file, [...(covered.get(file) ?? []), new RegExp(escapeRegExp(match))]);
      continue;
    }
    const { pattern, withEffort } = dispatchSlot(file, match, table);
    if (!withEffort) gaps.push(`${file}: dispatches entry "${match}" names a bare model, not "on \`<model>\`" or "${INHERIT_CLAUSE}" with an effort clause, ${INHERITANCE_NOTE}`);
    if (table.kinds[kind].effort === null) gaps.push(`${file}: dispatches entry "${match}" has kind ${kind} with no effort, ${INHERITANCE_NOTE}`);
    covered.set(file, [...(covered.get(file) ?? []), pattern]);
  }
  for (const file of [...markdownFiles(root, 'skills'), ...markdownFiles(root, 'agents')]) {
    fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, index) => {
      const where = `${file}:${index + 1}`;
      if (line.includes('general-purpose') && !(covered.get(file) ?? []).some((pattern) => pattern.test(line))) {
        gaps.push(`${where}: names general-purpose with no dispatches entry in lib/model-kinds.json`);
      }
      if (line.includes("session's model")) gaps.push(`${where}: names "the session's model"; pin a kind with model and effort`);
      if (/\bfork\b/i.test(line) && /dispatch|spawn|delegate|subagent/i.test(line)) {
        gaps.push(`${where}: dispatches a fork, which takes the session's effort`);
      }
    });
  }
  return gaps;
}

function tableOf(root, table) {
  return table ?? readKindTable(path.join(root, 'lib', 'model-kinds.json'));
}

export function findKindDrift(root, table) {
  return [...planKindWrites(root, tableOf(root, table)).values()].flatMap((plan) => plan.drift);
}

export function writeKinds(root, table) {
  const plans = planKindWrites(root, tableOf(root, table));
  for (const [file, plan] of plans) {
    if (plan.after !== plan.before) fs.writeFileSync(path.join(root, file), plan.after);
  }
  return [...plans.values()].flatMap((plan) => plan.drift);
}

function main() {
  const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } });
  const root = fileURLToPath(new URL('..', import.meta.url));
  const drift = values.write ? writeKinds(root) : findKindDrift(root);
  for (const record of drift) {
    console.log(`${record.file}: ${record.field} is ${record.actual}, the table says ${record.expected}`);
  }
  if (!values.write && drift.length > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
