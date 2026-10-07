// Cut variants of the plugin copy a benchmark arm loads. Each variant is exact-
// text edits, removed paths and whole-file swaps applied to a fresh copy, so
// nothing a user loads changes until a paid run says a cut wins. A target text
// or path the copy lacks stops with an error naming the variant, so a plugin
// edit that moves one is caught here, not in a paid cell.
//
//   node benchmarks/variants.mjs --check
//
// builds every variant in a temp folder, runs the session hook there and
// checks each change landed.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { copyPluginWithoutTasks } from './value.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const SKILL_LINE = 'exo skills, invoked as `exo:<name>`: build, check-docs, configure, design-ui, edit-skills, file-issues, find-cause, refactor, remember, save-session, ship, spec, start, verify, write-docs. Invoke the one whose description matches before the first tool call.';
const SESSION_FILE = 'hooks/session-start.mjs';
const ROUTE_FILE = 'skills/route-skills/SKILL.md';
const DIRECT_LOOP = 'skills/build/references/run-loop-direct.md';

const POINTER_EDIT = {
  file: SESSION_FILE,
  from: '  let additionalContext = `${headText}${body}`;',
  to: `  let additionalContext = ['# Using exo', '', ${JSON.stringify(SKILL_LINE)}].join('\\n');`
};
const FIND_CAUSE_EDIT = { file: ROUTE_FILE, from: ', an unproven failure to `find-cause`', to: '' };
const BUILD_SWAP = { target: DIRECT_LOOP, source: 'benchmarks/arms/build-session.md' };

export const VARIANTS = {
  'session-pointer': { edits: [POINTER_EDIT], remove: [], swap: [] },
  'no-find-cause': { edits: [FIND_CAUSE_EDIT], remove: ['skills/find-cause'], swap: [] },
  'session-build': { edits: [], remove: [], swap: [BUILD_SWAP] }
};

// Applies one variant to the plugin copy at `copy`; `source` is the checkout
// the arm files come from, since a copy holds no benchmarks/ folder.
export function applyVariant(name, copy, source = ROOT) {
  const variant = VARIANTS[name];
  if (variant === undefined) throw new Error(`variant ${name}: unknown, known: ${Object.keys(VARIANTS).join(', ')}`);
  for (const { file, from, to } of variant.edits) {
    const target = path.join(copy, file);
    if (!fs.existsSync(target)) throw new Error(`variant ${name}: ${file} is missing`);
    const parts = fs.readFileSync(target, 'utf8').split(from);
    if (parts.length !== 2) throw new Error(`variant ${name}: ${file} holds the target text ${parts.length - 1} times, not once: ${JSON.stringify(from)}`);
    fs.writeFileSync(target, parts.join(to));
  }
  for (const entry of variant.remove) {
    if (!fs.existsSync(path.join(copy, entry))) throw new Error(`variant ${name}: ${entry} is missing, nothing to remove`);
    fs.rmSync(path.join(copy, entry), { recursive: true });
  }
  for (const { target, source: armFile } of variant.swap) {
    if (!fs.existsSync(path.join(copy, target))) throw new Error(`variant ${name}: ${target} is missing, nothing to swap`);
    fs.copyFileSync(path.join(source, armFile), path.join(copy, target));
  }
  return copy;
}

// The session hook's additionalContext as a copy prints it, or throws.
function sessionContext(copy, scratch) {
  const run = spawnSync(process.execPath, [path.join(copy, SESSION_FILE)], {
    input: JSON.stringify({ source: 'startup', cwd: scratch, session_id: 'variant-check' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(scratch, 'config') }
  });
  if (run.status !== 0) throw new Error(`session hook exits ${run.status}: ${run.stderr.trim()}`);
  return JSON.parse(run.stdout).hookSpecificOutput.additionalContext;
}

// Builds the variant in a fresh temp copy and returns what is wrong with it.
export function checkVariant(name) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-variant-'));
  const problems = [];
  try {
    const copy = copyPluginWithoutTasks(ROOT, path.join(scratch, 'plugin'));
    applyVariant(name, copy);
    const context = sessionContext(copy, scratch);
    if (!context.includes('# Using exo')) problems.push('session text no longer holds `# Using exo`');
    const variant = VARIANTS[name];
    for (const { file } of variant.edits.filter((edit) => edit.file.endsWith('.mjs'))) {
      const check = spawnSync(process.execPath, ['--check', path.join(copy, file)], { encoding: 'utf8' });
      if (check.status !== 0) problems.push(`${file} no longer parses: ${check.stderr.trim()}`);
    }
    for (const entry of variant.remove) if (fs.existsSync(path.join(copy, entry))) problems.push(`${entry} is still there`);
    if (name === 'session-pointer' && context.length > 600) problems.push(`session text is ${context.length} characters, not a pointer`);
    if (name === 'no-find-cause' && fs.readFileSync(path.join(copy, ROUTE_FILE), 'utf8').includes('find-cause')) problems.push('the route still names find-cause');
    if (name.startsWith('session-build')) {
      const swapped = fs.readFileSync(path.join(copy, DIRECT_LOOP), 'utf8') === fs.readFileSync(path.join(ROOT, BUILD_SWAP.source), 'utf8');
      if (!swapped) problems.push('the direct loop is not the session-build arm file');
    }
  } catch (error) {
    problems.push(error.message);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--check')) {
    console.error('usage: node benchmarks/variants.mjs --check');
    process.exit(2);
  }
  let failed = false;
  for (const name of Object.keys(VARIANTS)) {
    const problems = checkVariant(name);
    console.log(problems.length === 0 ? `${name}: ok` : `${name}: FAIL ${problems.join('; ')}`);
    if (problems.length > 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
