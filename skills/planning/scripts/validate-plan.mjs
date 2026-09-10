// Validate a plan artifact against the grammar `references/handoff-spec.md`
// defines. Syntax, structure, and one lexical path rule — a `Touches:` path
// ending in a frontend extension requires `## Visual direction` and a
// `Freedom: DESIGN` checkpoint — plus the same section on any plan carrying a
// `Freedom: DESIGN` checkpoint, frontend path or not, and that section naming
// the frontend-design skill an executor loads. It infers no semantics such as
// whether an edit is an interface change, and reads nothing but the plan file.
//
//   node scripts/validate-plan.mjs <plan.md>
//
// Exit codes: 0 valid, 1 grammar-invalid, 2 invalid CLI arguments, 3 tool/read
// failure. Callers parse the exit code plus the final stdout line and never
// infer beyond those: exit 0 ends with `PLAN_VALID:true`; exit 1 prints one
// `line <n>: <message>` per problem then `PLAN_VALID:false`; exit 2 and 3
// print one `ERROR:args:`/`ERROR:read:` line then `PLAN_VALID:error`.

import fs from 'node:fs/promises';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class ArgsError extends Error {}
export class ReadError extends Error {}

const WALKTHROUGH_LINE = /^Walkthrough:\s*(.*)$/;
const REQUIRED_SECTIONS = ['Goal', 'Plan basis', 'Non-goals', 'Context', 'Steps', 'Final verification', 'Open questions'];
// `Visual direction` is conditional on a frontend path, so it is ordered but never
// required unconditionally; every other entry is required.
const ORDERED_SECTIONS = ['Goal', 'Plan basis', 'Non-goals', 'Context', 'Visual direction', 'Steps', 'Final verification', 'Open questions'];
const ANCHOR_TYPES = new Set(['symbol', 'selector', 'template block', 'config key', 'exact string', 'new-file']);
const FREEDOM_TOKENS = new Set(['LOCKED', 'GUIDED', 'DESIGN', 'OPEN']);
// An id names its task in words — `add-refund-column` — so `Depends on:` and
// `PLAN DRIFT:` references stay readable; opaque sequence codes are invalid.
const DESCRIPTIVE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const SEQUENCE_CODE = /^(?:cp|step|task|phase|t)[-_]?\d+$/i;
const FRONTEND_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.html', '.htm', '.tsx', '.jsx', '.vue', '.svelte', '.astro']);
const BARE_LINE_REFERENCE = /^[\w./-]+:\d+(?:-\d+)?$|^\d+(?:-\d+)?$/;
const DESIGN_SKILL_LABEL = /^Design skill:\s*(.*)$/;
// One skill name, not a phrase: the executor loads this value as written.
const DESIGN_SKILL_NAME = /^[A-Za-z0-9][\w.-]*$/;
const PLACEHOLDER_PATTERNS = [
  [/\bappropriate\b/i, '"appropriate"'],
  [/\bsimilar to\b/i, '"similar to"'],
  [/\bas needed\b/i, '"as needed"'],
  [/\betc\.(?!\w)/i, '"etc."'],
  [/\bTODO\b/i, 'TODO-shaped text'],
  [/\bTBD\b/i, 'TODO-shaped text']
];
const INSTRUCTION_FIELDS = ['target', 'wiring', 'onDrift', 'doneWhen'];
const FIELD_LABELS = [
  ['freedom', /^Freedom:\s*(.*)$/],
  ['dependsOn', /^Depends on:\s*(.*)$/],
  ['touches', /^Touches:\s*(.*)$/],
  ['current', /^Current:\s*(.*)$/],
  ['target', /^Target:\s*(.*)$/],
  ['wiring', /^Wiring:\s*(.*)$/],
  ['edit', /^Edit:\s*(.*)$/],
  ['red', /^RED:\s*(.*)$/],
  ['green', /^GREEN:\s*(.*)$/],
  ['verifySubstep', /^VERIFY:\s*(.*)$/],
  ['verify', /^Verify:\s*(.*)$/],
  ['render', /^Render:\s*(.*)$/],
  ['onDrift', /^On drift:\s*(.*)$/],
  ['doneWhen', /^Done when:\s*(.*)$/]
];
const FIELD_TITLES = {
  dependsOn: 'Depends on:', current: 'Current:', target: 'Target:', wiring: 'Wiring:', edit: 'Edit:',
  verify: 'Verify:', render: 'Render:', onDrift: 'On drift:', doneWhen: 'Done when:'
};
// `Target:` is one sentence naming the observable state; behavior detail belongs in `Edit:` as
// code the executor pastes, so a paragraph here is the plan exporting the edit to the executor.
const TARGET_MAX_CHARS = 300;
const EDIT_ENTRY = /^-\s*`([^`]+)`\s*—\s*(create|replace):\s*$/;
const EDIT_WITH = /^\s*with:\s*$/;
const TOUCHES_ENTRY = /^-\s*`([^`]+)`\s*—\s*anchor:\s*([^(]+?)(?:\s*\((.*)\))?\s*$/;
// `## Final verification` and `## Visual direction` carry their own grammar; these carry a body only.
const BODY_SECTIONS = ['Goal', 'Plan basis', 'Non-goals', 'Context', 'Steps', 'Open questions'];
const NEXT_SENTENCE = 'Executor loads the `implementing` skill on this plan before the first checkpoint.';

/** Blank out fenced ```...``` bodies so headings/labels inside them never parse as real structure. */
/** Fence state after `line`: three or more backticks open a block, and only a fence at least as long as the opener closes it, so a ````md block may hold ```css blocks. */
function nextFence(openFence, line) {
  const fence = line.match(/^\s*(`{3,})/);
  if (!fence) return { openFence, boundary: false };
  const length = fence[1].length;
  if (openFence === 0) return { openFence: length, boundary: true };
  if (length >= openFence) return { openFence: 0, boundary: true };
  return { openFence, boundary: false };
}

function maskFencedBlocks(lines) {
  const masked = lines.slice();
  let openFence = 0;
  for (let index = 0; index < masked.length; index++) {
    const fence = nextFence(openFence, masked[index]);
    openFence = fence.openFence;
    if (fence.boundary || openFence > 0) masked[index] = '';
  }
  return masked;
}

function findH2Headings(lines) {
  const headings = [];
  lines.forEach((line, index) => {
    const match = line.match(/^## (.+)$/);
    if (match) headings.push({ index, text: match[1].trim() });
  });
  return headings;
}

/** Content end for a heading at `index`: the next H2 heading's line, or EOF. */
function sectionEnd(headings, index, documentEnd) {
  const next = headings.find((heading) => heading.index > index);
  return next ? next.index : documentEnd;
}

function checkSectionOrder(headings, documentEnd, problems) {
  const byName = new Map();
  for (const heading of headings) {
    if (!byName.has(heading.text)) {
      byName.set(heading.text, heading.index);
      continue;
    }
    // Only the first occurrence gets bounds, so a repeated required heading hides
    // its own body from every bounded check. Headings outside the grammar may repeat.
    if (ORDERED_SECTIONS.includes(heading.text)) {
      problems.push({ line: heading.index + 1, message: `duplicate section '## ${heading.text}'` });
    }
  }
  let lastIndex = -1;
  let lastName = null;
  const bounds = {};
  for (const name of ORDERED_SECTIONS) {
    if (!byName.has(name)) {
      if (REQUIRED_SECTIONS.includes(name)) {
        problems.push({ line: 1, message: `missing required section '## ${name}'` });
      }
      continue;
    }
    const index = byName.get(name);
    if (index < lastIndex) {
      problems.push({ line: index + 1, message: `section '## ${name}' appears after '## ${lastName}', out of the required relative order` });
    }
    bounds[name] = [index, sectionEnd(headings, index, documentEnd)];
    lastIndex = index;
    lastName = name;
  }
  return bounds;
}

/**
 * Every required section carries a body. `## Plan basis` closes with the sentence that makes a
 * fresh executor load the `implementing-batch` skill, and `## Open questions` lists a clarification marker
 * or the word None, so an empty section never reads as "nothing to say".
 */
function checkSectionBodies(bounds, lines, problems) {
  for (const name of BODY_SECTIONS) {
    if (!bounds[name]) continue;
    const [start, end] = bounds[name];
    const headingLine = start + 1;
    const body = lines.slice(start + 1, end).join('\n').trim();
    if (body.length === 0) {
      problems.push({ line: headingLine, message: `'## ${name}' section is empty` });
      continue;
    }
    if (name === 'Plan basis') {
      // `implementing` greps these two lines to match a plan to a checkout, so their grammar is fixed.
      const [repositoryLine = '', branchLine = ''] = body.split('\n');
      if (!/^Repository: \/.*\S$/.test(repositoryLine)) {
        problems.push({ line: headingLine, message: "'## Plan basis' does not open with a 'Repository: <absolute root>' line" });
      }
      if (!/^Branch: \S+$/.test(branchLine)) {
        problems.push({ line: headingLine, message: "'## Plan basis' second line is not 'Branch: <branch name>'" });
      }
      if (!body.endsWith(NEXT_SENTENCE)) {
        problems.push({ line: headingLine, message: `'## Plan basis' does not close with the literal sentence "${NEXT_SENTENCE}"` });
      }
    }
    // The body is the word None, optionally bulleted or with a period; a sentence starting with it is not.
    if (name === 'Open questions' && !body.includes('[NEEDS CLARIFICATION') && !/^(?:-\s*)?None\.?$/i.test(body)) {
      problems.push({ line: headingLine, message: "'## Open questions' lists neither a '[NEEDS CLARIFICATION' marker nor the word None" });
    }
  }
}

/** Parse `Label: value` fields within [start, end), capturing continuation lines until the next label. */
function parseFields(lines, start, end) {
  const fields = {};
  let active = null;
  let openFence = 0;
  for (let index = start; index < end; index++) {
    const line = lines[index];
    // A line inside an `Edit:` fenced block is code, never a field label.
    openFence = nextFence(openFence, line).openFence;
    const match = openFence > 0 ? undefined : FIELD_LABELS.find(([, pattern]) => pattern.test(line));
    if (match) {
      const [key, pattern] = match;
      active = key;
      fields[key] = { line: index + 1, parts: [line.match(pattern)[1]] };
      continue;
    }
    if (active) fields[active].parts.push(line);
  }
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    values[key] = { line: field.line, text: field.parts.join('\n').trim() };
  }
  return values;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripCodeSpans(text) {
  return text.replace(/`[^`]*`/g, '');
}

function checkPlaceholders(fields, id, problems) {
  for (const key of INSTRUCTION_FIELDS) {
    const field = fields[key];
    if (!field) continue;
    const stripped = stripCodeSpans(field.text);
    for (const [pattern, label] of PLACEHOLDER_PATTERNS) {
      if (pattern.test(stripped)) {
        problems.push({ line: field.line, message: `checkpoint '${id}' ${FIELD_TITLES[key]} contains placeholder text ${label}` });
      }
    }
  }
}

// A bullet whose anchor detail wraps onto the next line is still one entry:
// fold every continuation line (no leading `-`) into the bullet above it.
function foldWrappedBullets(text) {
  const bullets = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('-') || bullets.length === 0) {
      bullets.push(line);
      continue;
    }
    bullets[bullets.length - 1] += ` ${line}`;
  }
  return bullets;
}

/**
 * The `Touches:` field parsed once per checkpoint: absent, the literal `none`, or one entry per
 * bullet. An entry that fails the grammar keeps its problem text; `checkTouches` reports it, and
 * a bullet with no path stays out of every cross-check.
 */
function parseTouches(field) {
  if (!field) return { present: false, none: false, entries: [] };
  const bullets = foldWrappedBullets(field.text);
  if (bullets.length === 1 && bullets[0] === 'none') return { present: true, none: true, entries: [] };
  const entries = bullets.map((bullet) => {
    const match = bullet.match(TOUCHES_ENTRY);
    if (!match) {
      return { path: null, type: null, problem: `Touches entry does not match '- \`<path>\` — anchor: <type> (...)': '${bullet}'` };
    }
    const path = match[1].trim();
    const type = match[2].trim();
    if (BARE_LINE_REFERENCE.test(type)) {
      return { path, type, problem: `Touches anchor is a bare line reference, not a declared anchor type: '${type}'` };
    }
    if (!ANCHOR_TYPES.has(type)) {
      return { path, type, problem: `Touches anchor type is not one of the six declared types: '${type}'` };
    }
    return { path, type, problem: null };
  });
  return { present: true, none: false, entries };
}

function checkTouches(checkpoint, problems) {
  const { id, headingLine, fields, touches } = checkpoint;
  if (!touches.present) {
    problems.push({ line: headingLine, message: `checkpoint '${id}' is missing a 'Touches:' field` });
    return;
  }
  const line = fields.touches.line;
  if (touches.none) {
    const target = fields.target;
    if (!target || !target.text.includes('no repository change')) {
      problems.push({ line, message: `checkpoint '${id}' declares 'Touches: none' but 'Target:' does not contain "no repository change"` });
    }
    return;
  }
  if (touches.entries.length === 0) {
    problems.push({ line, message: `checkpoint '${id}' has an empty 'Touches:' field; use 'Touches: none' for a read-only checkpoint` });
    return;
  }
  for (const entry of touches.entries) {
    if (entry.problem) problems.push({ line, message: `checkpoint '${id}' ${entry.problem}` });
  }
  if (touches.entries.every((entry) => entry.problem)) {
    problems.push({ line, message: `checkpoint '${id}' has no valid Touches entry` });
  }
}

/** Split an `Edit:` field into entries, each carrying its fenced blocks in order. */
function parseEditEntries(edit, id, problems) {
  const entries = [];
  let openFence = 0;
  edit.text.split('\n').forEach((line, offset) => {
    const lineNumber = edit.line + offset;
    const fence = nextFence(openFence, line);
    openFence = fence.openFence;
    if (fence.boundary) {
      if (openFence === 0) return;
      if (entries.length === 0) {
        problems.push({ line: lineNumber, message: `checkpoint '${id}' 'Edit:' opens a fenced block before any '- \`<path>\` — create:|replace:' entry` });
        entries.push({ path: null, mode: 'replace', blocks: [], sawWith: false, line: lineNumber });
      }
      entries[entries.length - 1].blocks.push([]);
      return;
    }
    if (openFence > 0) {
      const current = entries[entries.length - 1];
      current.blocks[current.blocks.length - 1].push(line);
      return;
    }
    const entry = line.match(EDIT_ENTRY);
    if (entry) {
      entries.push({ path: entry[1].trim(), mode: entry[2], blocks: [], sawWith: false, line: lineNumber });
      return;
    }
    if (EDIT_WITH.test(line)) {
      if (entries.length > 0) entries[entries.length - 1].sawWith = true;
      return;
    }
    if (line.trim().length > 0) {
      problems.push({ line: lineNumber, message: `checkpoint '${id}' 'Edit:' carries prose outside a fenced block; the edit is code, not a description: '${line.trim()}'` });
    }
  });
  return entries;
}

/**
 * The edit is the spec: a checkpoint that touches a path carries the literal text the executor
 * pastes there. `create:` holds the whole new file; `replace:` holds the verbatim current text
 * followed by `with:` and the new text. Prose in `Target:` cannot substitute for either.
 */
function checkEdit(checkpoint, problems) {
  const { id, headingLine, fields, touches: parsedTouches } = checkpoint;
  const edit = fields.edit;
  if (parsedTouches.none) {
    if (edit && edit.text.length > 0) {
      problems.push({ line: edit.line, message: `checkpoint '${id}' declares 'Touches: none' but carries an 'Edit:' field` });
    }
    return;
  }
  // A missing, empty, or wholly malformed `Touches:` is reported by checkTouches; nothing to cross-check.
  const touches = parsedTouches.entries.filter((entry) => entry.path !== null);
  if (touches.length === 0) return;
  if (!edit || edit.text.length === 0) {
    problems.push({ line: edit ? edit.line : headingLine, message: `checkpoint '${id}' touches a path but has no 'Edit:' field; write the literal edit per touched path ('- \`<path>\` — create:' or '— replace:' … 'with:' with fenced blocks)` });
    return;
  }
  const entries = parseEditEntries(edit, id, problems);
  const editedPaths = new Set();
  for (const entry of entries) {
    if (entry.path === null) continue;
    editedPaths.add(entry.path);
    const touched = touches.find((candidate) => candidate.path === entry.path);
    if (!touched) {
      problems.push({ line: entry.line, message: `checkpoint '${id}' 'Edit:' names '${entry.path}', which is not a 'Touches:' path` });
      continue;
    }
    const expectedMode = touched.type === 'new-file' ? 'create' : 'replace';
    if (entry.mode !== expectedMode) {
      problems.push({ line: entry.line, message: `checkpoint '${id}' 'Edit:' entry for '${entry.path}' must use '${expectedMode}:' because its Touches anchor is '${touched.type}'` });
      continue;
    }
    const nonEmpty = (block) => block.join('\n').trim().length > 0;
    if (entry.mode === 'create') {
      if (entry.blocks.length !== 1 || !nonEmpty(entry.blocks[0])) {
        problems.push({ line: entry.line, message: `checkpoint '${id}' 'Edit:' create entry for '${entry.path}' needs exactly one non-empty fenced block holding the whole file` });
      }
      continue;
    }
    if (entry.blocks.length !== 2 || !entry.sawWith) {
      problems.push({ line: entry.line, message: `checkpoint '${id}' 'Edit:' replace entry for '${entry.path}' needs a fenced block with the verbatim current text, a 'with:' line, and a fenced block with the new text` });
      continue;
    }
    if (!nonEmpty(entry.blocks[0])) {
      problems.push({ line: entry.line, message: `checkpoint '${id}' 'Edit:' replace entry for '${entry.path}' has an empty current-text block; quote the text the executor must find` });
    }
  }
  for (const touched of touches) {
    if (!editedPaths.has(touched.path)) {
      problems.push({ line: edit.line, message: `checkpoint '${id}' touches '${touched.path}' but 'Edit:' carries no entry for it` });
    }
  }
}

function checkRequiredFields(fields, id, headingLine, problems) {
  const freedom = fields.freedom;
  if (!freedom || !FREEDOM_TOKENS.has(freedom.text)) {
    problems.push({ line: freedom ? freedom.line : headingLine, message: `checkpoint '${id}' 'Freedom:' must be exactly one of LOCKED, GUIDED, OPEN, DESIGN, with nothing else on the line` });
  }
  // An empty `Depends on:` reads as `none` downstream, silently dropping an ordering edge;
  // so does any value that survives the split without naming one id.
  const dependsOn = fields.dependsOn;
  if (!dependsOn || dependsOn.text.length === 0) {
    problems.push({ line: dependsOn ? dependsOn.line : headingLine, message: `checkpoint '${id}' is missing or has an empty '${FIELD_TITLES.dependsOn}' field` });
  } else if (dependsOn.text !== 'none' && dependencyIds(dependsOn).length === 0) {
    problems.push({ line: dependsOn.line, message: `checkpoint '${id}' '${FIELD_TITLES.dependsOn}' names no checkpoint id; write 'none' when the checkpoint has no dependency` });
  }
  // A DESIGN checkpoint closes on `Render:`; every other checkpoint closes on `Verify:`.
  const isDesign = Boolean(freedom) && freedom.text === 'DESIGN';
  const closing = isDesign ? 'render' : 'verify';
  const forbidden = isDesign ? 'verify' : 'render';
  for (const key of ['current', 'target', 'wiring', closing, 'onDrift', 'doneWhen']) {
    const field = fields[key];
    if (!field || field.text.length === 0) {
      problems.push({ line: field ? field.line : headingLine, message: `checkpoint '${id}' is missing or has an empty '${FIELD_TITLES[key]}' field` });
    }
  }
  const target = fields.target;
  if (target && target.text.length > TARGET_MAX_CHARS) {
    problems.push({ line: target.line, message: `checkpoint '${id}' '${FIELD_TITLES.target}' runs ${target.text.length} characters; keep it to one sentence and move the behavior detail into '${FIELD_TITLES.edit}' as code` });
  }
  // The spec closes every checkpoint on a drift line naming its own recovery marker. The
  // lookahead keeps a longer id — `add-index-rollback` against `add-index` — from passing as this one.
  const onDrift = fields.onDrift;
  const marker = new RegExp(`PLAN DRIFT: ${escapeRegExp(id)}(?![\\w-])`);
  if (onDrift && onDrift.text.length > 0 && !marker.test(onDrift.text)) {
    problems.push({ line: onDrift.line, message: `checkpoint '${id}' 'On drift:' does not name its own recovery marker 'PLAN DRIFT: ${id}'` });
  }
  if (fields[forbidden]) {
    const message = isDesign
      ? `checkpoint '${id}' carries 'Freedom: DESIGN', which closes with 'Render:', not 'Verify:'`
      : `checkpoint '${id}' carries a 'Render:' line, which only a 'Freedom: DESIGN' checkpoint may`;
    problems.push({ line: fields[forbidden].line, message });
  }
}

function dependencyIds(dependsOn) {
  if (!dependsOn || dependsOn.text === 'none') return [];
  return dependsOn.text.split(',').map((token) => token.trim()).filter(Boolean);
}

function checkDependencyGraph(checkpoints, problems) {
  const ids = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const edges = new Map();
  for (const checkpoint of checkpoints) {
    const dependsOn = checkpoint.fields.dependsOn;
    const deps = dependencyIds(dependsOn);
    edges.set(checkpoint.id, deps);
    for (const dep of deps) {
      if (dep === checkpoint.id) {
        problems.push({ line: dependsOn.line, message: `checkpoint '${checkpoint.id}' depends on itself` });
      } else if (!ids.has(dep)) {
        problems.push({ line: dependsOn.line, message: `checkpoint '${checkpoint.id}' depends on unknown checkpoint id '${dep}'` });
      }
    }
  }

  const state = new Map(); // 'visiting' | 'done'
  const findCycle = (id, path) => {
    state.set(id, 'visiting');
    for (const dep of edges.get(id) ?? []) {
      if (!edges.has(dep)) continue;
      if (state.get(dep) === 'visiting') return [...path, dep];
      if (state.get(dep) !== 'done') {
        const cycle = findCycle(dep, [...path, dep]);
        if (cycle) return cycle;
      }
    }
    state.set(id, 'done');
    return null;
  };
  for (const checkpoint of checkpoints) {
    if (state.get(checkpoint.id) === 'done') continue;
    const cycle = findCycle(checkpoint.id, [checkpoint.id]);
    if (cycle) {
      problems.push({ line: checkpoint.headingLine, message: `dependency cycle: ${cycle.join(' -> ')}` });
      break;
    }
  }
}

/** Frontend `Touches:` paths of one checkpoint, matched lexically on file extension alone. */
function frontendPaths(touches) {
  const paths = [];
  for (const entry of touches.entries) {
    if (entry.path === null) continue;
    // A `?query` or `#fragment` suffix must not hide the extension from the lookup.
    const lookup = entry.path.split(/[?#]/)[0];
    const dot = lookup.lastIndexOf('.');
    if (dot !== -1 && FRONTEND_EXTENSIONS.has(lookup.slice(dot).toLowerCase())) paths.push(entry.path);
  }
  return paths;
}

/**
 * Frontend paths pull in `## Visual direction` and a DESIGN checkpoint each frontend edit
 * reaches. A `Target:` stating "no visual change" exempts its checkpoint, the same literal
 * declaration pattern `Touches: none` uses with "no repository change".
 */
function checkFrontendRules(checkpoints, bounds, problems) {
  const touching = checkpoints
    .map((checkpoint) => ({ checkpoint, paths: frontendPaths(checkpoint.touches) }))
    .filter((entry) => entry.paths.length > 0)
    .filter((entry) => !(entry.checkpoint.fields.target && entry.checkpoint.fields.target.text.includes('no visual change')));
  if (touching.length === 0) return;

  const first = touching[0];
  const designIds = new Set(checkpoints
    .filter((checkpoint) => checkpoint.fields.freedom && checkpoint.fields.freedom.text === 'DESIGN')
    .map((checkpoint) => checkpoint.id));
  // A DESIGN checkpoint pulls the section in through `checkVisualDirection`; reporting
  // it here as well would name one missing section twice.
  if (!bounds['Visual direction'] && designIds.size === 0) {
    problems.push({ line: first.checkpoint.headingLine, message: `checkpoint '${first.checkpoint.id}' touches frontend path '${first.paths[0]}', so the plan needs a '## Visual direction' section` });
  }
  if (designIds.size === 0) {
    problems.push({ line: first.checkpoint.headingLine, message: `checkpoint '${first.checkpoint.id}' touches frontend path '${first.paths[0]}', so the plan needs at least one 'Freedom: DESIGN' checkpoint` });
    return;
  }

  const edges = new Map(checkpoints.map((checkpoint) => [checkpoint.id, dependencyIds(checkpoint.fields.dependsOn)]));
  const reachesDesign = (id, seen) => {
    if (designIds.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (edges.get(id) ?? []).some((dep) => edges.has(dep) && reachesDesign(dep, seen));
  };
  for (const entry of touching) {
    if (!reachesDesign(entry.checkpoint.id, new Set())) {
      problems.push({ line: entry.checkpoint.headingLine, message: `checkpoint '${entry.checkpoint.id}' touches frontend path '${entry.paths[0]}' but is neither a 'Freedom: DESIGN' checkpoint nor dependent on one` });
    }
  }
}

/**
 * `## Visual direction` is required by any DESIGN checkpoint, is never empty when present,
 * and names the frontend-design skill a DESIGN checkpoint loads — the phrase "the skill the
 * executing session has loaded" resolves to nothing for a zero-context executor.
 */
function checkVisualDirection(checkpoints, bounds, lines, problems) {
  const directionBounds = bounds['Visual direction'];
  if (!directionBounds) {
    const design = checkpoints.find((checkpoint) => checkpoint.fields.freedom && checkpoint.fields.freedom.text === 'DESIGN');
    if (design) {
      problems.push({ line: design.headingLine, message: `checkpoint '${design.id}' carries 'Freedom: DESIGN', so the plan needs a '## Visual direction' section` });
    }
    return;
  }
  const headingLine = directionBounds[0] + 1;
  if (lines.slice(directionBounds[0] + 1, directionBounds[1]).join('\n').trim().length === 0) {
    problems.push({ line: headingLine, message: "'## Visual direction' section is empty" });
    return;
  }

  const designSkillLines = [];
  for (let index = directionBounds[0] + 1; index < directionBounds[1]; index++) {
    const match = lines[index].match(DESIGN_SKILL_LABEL);
    if (match) designSkillLines.push({ line: index + 1, value: match[1].trim() });
  }
  // Two lines can contradict each other — `ui-design` above a deferred `none` — and only
  // the first would be read, so the second is reported rather than silently dropped.
  if (designSkillLines.length > 1) {
    problems.push({ line: designSkillLines[1].line, message: "'## Visual direction' carries more than one 'Design skill:' line" });
  }
  const designSkill = designSkillLines[0];
  if (!designSkill) {
    problems.push({ line: headingLine, message: "'## Visual direction' carries no 'Design skill:' line naming the frontend-design skill a DESIGN checkpoint loads" });
    return;
  }
  // `none` defers the choice, so it stands only against a marker asking which skill to load.
  if (designSkill.value === 'none') {
    const openQuestions = bounds['Open questions'];
    const body = openQuestions ? lines.slice(openQuestions[0] + 1, openQuestions[1]).join('\n') : '';
    if (!body.includes('[NEEDS CLARIFICATION')) {
      problems.push({ line: designSkill.line, message: "'Design skill: none' requires a '[NEEDS CLARIFICATION' marker in '## Open questions' asking which frontend-design skill to load" });
    }
    return;
  }
  if (!DESIGN_SKILL_NAME.test(designSkill.value)) {
    problems.push({ line: designSkill.line, message: `'Design skill:' names no single skill: '${designSkill.value}'` });
  }
}

function checkClarificationMarkers(lines, openQuestionsBounds, problems) {
  lines.forEach((line, index) => {
    if (!line.includes('[NEEDS CLARIFICATION')) return;
    const inOpenQuestions = openQuestionsBounds && index >= openQuestionsBounds[0] && index < openQuestionsBounds[1];
    if (!inOpenQuestions) {
      problems.push({ line: index + 1, message: "'[NEEDS CLARIFICATION' marker appears outside '## Open questions'" });
    }
  });
}

/**
 * `## Final verification` closes with a `Walkthrough:` line naming how a person sees the
 * delivered result; an API-only phase otherwise reads as done while nothing is visible.
 * `Walkthrough: none` stands only with its reason on the same line.
 */
function checkFinalVerification(bounds, lines, problems) {
  if (!bounds) return;
  const [start, end] = bounds;
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (body.length === 0) {
    problems.push({ line: start + 1, message: "'## Final verification' section is empty" });
    return;
  }
  let walkthrough = null;
  for (let index = start + 1; index < end; index++) {
    const match = lines[index].match(WALKTHROUGH_LINE);
    if (match) {
      walkthrough = { line: index + 1, value: match[1].trim() };
      break;
    }
  }
  if (!walkthrough) {
    problems.push({ line: start + 1, message: "'## Final verification' carries no 'Walkthrough:' line naming the command or URL a person uses to see the delivered result" });
    return;
  }
  if (walkthrough.value.length === 0) {
    problems.push({ line: walkthrough.line, message: "'Walkthrough:' line is empty; name the command or URL, or 'none' with the reason on the same line" });
    return;
  }
  if (/^none\b/i.test(walkthrough.value) && walkthrough.value.replace(/^none\b[\s:,—-]*/i, '').length === 0) {
    problems.push({ line: walkthrough.line, message: "'Walkthrough: none' must state on the same line why the change has no user-visible result" });
  }
}

export function validatePlan(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const scanLines = maskFencedBlocks(lines);
  const problems = [];

  const headings = findH2Headings(scanLines);
  const bounds = checkSectionOrder(headings, lines.length, problems);
  checkSectionBodies(bounds, lines, problems);
  checkFinalVerification(bounds['Final verification'], lines, problems);
  checkClarificationMarkers(lines, bounds['Open questions'], problems);

  const stepsBounds = bounds['Steps'];
  const checkpoints = [];
  if (stepsBounds) {
    const [stepsStart, stepsEnd] = stepsBounds;
    const checkpointHeadings = [];
    for (let index = stepsStart; index < stepsEnd; index++) {
      const match = scanLines[index].match(/^### (.+)$/);
      if (match) checkpointHeadings.push({ index, text: match[1].trim() });
    }
    checkpointHeadings.forEach((heading, position) => {
      const end = position + 1 < checkpointHeadings.length ? checkpointHeadings[position + 1].index : stepsEnd;
      const idMatch = heading.text.match(/^(?<id>\S+)\s+—\s+(?<title>.+)$/);
      const id = idMatch ? idMatch.groups.id : heading.text;
      if (!idMatch) {
        problems.push({ line: heading.index + 1, message: `checkpoint heading '${heading.text}' does not match '<id> — <title>'` });
      } else if (!DESCRIPTIVE_ID.test(id) || SEQUENCE_CODE.test(id) || SEQUENCE_CODE.test(id.split('-')[0])) {
        problems.push({ line: heading.index + 1, message: `checkpoint id '${id}' is not a descriptive kebab-case task name; name the task ('add-refund-column'), not a sequence code ('CP1', 'step-2')` });
      }
      if (checkpoints.some((checkpoint) => checkpoint.id === id)) {
        problems.push({ line: heading.index + 1, message: `duplicate checkpoint id '${id}'` });
      }
      const fields = parseFields(lines, heading.index + 1, end);
      checkpoints.push({ id, headingLine: heading.index + 1, fields, touches: parseTouches(fields.touches) });
    });
  }

  for (const checkpoint of checkpoints) {
    checkRequiredFields(checkpoint.fields, checkpoint.id, checkpoint.headingLine, problems);
    checkTouches(checkpoint, problems);
    checkEdit(checkpoint, problems);
    checkPlaceholders(checkpoint.fields, checkpoint.id, problems);
  }
  checkDependencyGraph(checkpoints, problems);
  checkFrontendRules(checkpoints, bounds, problems);
  // Masked lines, so an illustrative `Design skill:` line inside a fenced block
  // never satisfies the rule the way a real one does.
  checkVisualDirection(checkpoints, bounds, scanLines, problems);

  return problems.sort((a, b) => a.line - b.line);
}

function parseArgs(argv) {
  if (argv.length !== 1) {
    throw new ArgsError(`expected exactly one argument <plan.md>, received ${argv.length}`);
  }
  const [planPath] = argv;
  if (planPath.startsWith('-')) {
    throw new ArgsError(`unexpected flag '${planPath}'`);
  }
  return planPath;
}

async function readPlan(planPath) {
  try {
    return await fs.readFile(planPath, 'utf8');
  } catch (error) {
    throw new ReadError(`cannot read '${planPath}': ${error.message}`);
  }
}

async function main(argv) {
  let planPath;
  try {
    planPath = parseArgs(argv);
  } catch (error) {
    process.stdout.write(`ERROR:args: ${error.message}\n`);
    process.stdout.write('PLAN_VALID:error\n');
    process.exitCode = 2;
    return;
  }

  let raw;
  try {
    raw = await readPlan(planPath);
  } catch (error) {
    process.stdout.write(`ERROR:read: ${error.message}\n`);
    process.stdout.write('PLAN_VALID:error\n');
    process.exitCode = 3;
    return;
  }

  const problems = validatePlan(raw);
  if (problems.length === 0) {
    process.stdout.write('PLAN_VALID:true\n');
    process.exitCode = 0;
    return;
  }
  for (const problem of problems) {
    process.stdout.write(`line ${problem.line}: ${problem.message}\n`);
  }
  process.stdout.write('PLAN_VALID:false\n');
  process.exitCode = 1;
}

// Node resolves the main module through symlinks, so `import.meta.url` names
// the real file while `process.argv[1]` may be a symlinked path (for example
// `~/.claude/skills/planning/...`). Comparing URLs there skipped `main()`
// silently with exit 0; compare real paths instead.
function invokedAsMain(argvPath) {
  try {
    return realpathSync(argvPath) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (process.argv[1] && invokedAsMain(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stdout.write(`ERROR:read: unexpected failure: ${error.message}\n`);
    process.stdout.write('PLAN_VALID:error\n');
    process.exitCode = 3;
  });
}
