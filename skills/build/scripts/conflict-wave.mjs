import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { planIdOf } from '#plan-landed';
import { resolvePlanPath } from '#checkout';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';
import { conflictMarkers, squashBlock, unmergedPaths } from '#merge-state';
import { loadRunConfig } from './run-config.mjs';
import { runLandGate } from './land-gate.mjs';
import { LandingError } from './land-errors.mjs';
import { scriptPath } from './next-task-paths.mjs';

const git = (directory, args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();

export const branchOf = (number) => `exo-conflict-${number}`;

export const folderOf = (root, number) => path.join(root, '.exo', `conflict-${number}`);

export function resolverOn(env = process.env) {
  if (env.EXO_WAVE_RESOLVER !== undefined) return env.EXO_WAVE_RESOLVER === '1';
  return loadRunConfig({ home: os.homedir() }).defaults.waveResolver === true;
}

function landedSince(root, base, planId) {
  const messages = git(root, ['log', `${base}..HEAD`, '--format=%B']);
  const pattern = new RegExp(`^Plan-task: ${planId}/(\\d+)$`, 'gm');
  return [...messages.matchAll(pattern)].map((match) => match[1]);
}

function copyBriefs(root, folder, numbers) {
  for (const number of numbers) {
    const brief = path.join(root, '.exo', 'briefs', `task-${number}.md`);
    if (fs.existsSync(brief)) fs.copyFileSync(brief, path.join(folder, `brief-task-${number}.md`));
  }
}

function resolverLines({ planPath, root, number, folder, tree, files }) {
  const land = `node "${scriptPath('conflict-wave.mjs')}" --plan "${planPath}" --task ${number} --root "${root}"`;
  return [
    `Conflict branch: ${branchOf(number)}`,
    `Conflict tree: ${tree}`,
    `Conflict files: ${files.join(', ')}`,
    'Dispatch: exo:build-task',
    'Prompt:',
    `Resolve the conflict markers in ${files.join(', ')} in ${tree} so both sides' intent survives. Read the briefs and diffs in ${folder} and skills/build/references/conflict-wave.md. Edit only the conflicted files, commit nothing, run no merge or rebase.`,
    `Report to: ${path.join(folder, 'resolver.md')}`,
    'Return: one line',
    `Then: ${land}`
  ];
}

export function keepConflict({ planPath, root, number, sha, base }) {
  const folder = folderOf(root, number);
  const tree = path.join(folder, 'tree');
  fs.mkdirSync(folder, { recursive: true });
  git(root, ['worktree', 'add', '-q', '-b', branchOf(number), tree, 'HEAD']);
  spawnSync('git', ['-C', tree, 'cherry-pick', sha], { encoding: 'utf8' });
  const files = unmergedPaths(tree);
  git(tree, ['add', '-A']);
  git(tree, ['commit', '-q', '-n', '-m', `wip: conflicted pick of ${sha}`]);
  fs.writeFileSync(path.join(folder, 'pick.json'), JSON.stringify({ sha, base, files }));
  fs.writeFileSync(path.join(folder, 'ours.diff'), git(root, ['diff', base, 'HEAD']));
  fs.writeFileSync(path.join(folder, 'theirs.diff'), git(root, ['diff', base, sha]));
  copyBriefs(root, folder, [number, ...landedSince(root, base, planIdOf(planPath))]);
  return resolverLines({ planPath, root, number, folder, tree, files });
}

const stop = (number, reason) => `CONFLICT ${number}: ${reason}\nStart: none\n`;

export function landResolved({ planPath, root, number }) {
  const folder = folderOf(root, number);
  const tree = path.join(folder, 'tree');
  const branch = branchOf(number);
  if (!fs.existsSync(path.join(folder, 'pick.json'))) return stop(number, `no kept conflict in ${folder}`);
  const { sha, files } = JSON.parse(fs.readFileSync(path.join(folder, 'pick.json'), 'utf8'));
  const markers = conflictMarkers(tree, files);
  if (markers.length > 0) return stop(number, `branch ${branch} still has conflict markers in ${markers.join(', ')}`);
  git(tree, ['add', '-A']);
  if (git(tree, ['status', '--porcelain']) !== '') git(tree, ['commit', '-q', '-n', '-m', `fix: resolve conflict of ${sha}`]);
  const frame = frameOf(parsePlan(fs.readFileSync(planPath, 'utf8')).frame);
  try {
    runLandGate(frame.landGate, tree);
  } catch (error) {
    if (!(error instanceof LandingError)) throw error;
    return stop(number, `Land gate failed on branch ${branch}, nothing landed\n${error.message}`);
  }
  const block = squashBlock(root, branch);
  if (block !== null) return stop(number, `branch ${branch}: ${block.problem}; ${block.fix}`);
  git(root, ['merge', '--squash', branch]);
  git(root, ['commit', '-q', '-n', '--allow-empty', '-C', sha]);
  git(root, ['worktree', 'remove', '--force', tree]);
  git(root, ['branch', '-D', branch]);
  return `LANDED ${number} ${git(root, ['rev-parse', 'HEAD'])}\nResolved branch ${branch} landed and removed; the slot folder of task ${number} is still kept.\n`;
}

const USAGE = [
  'usage: conflict-wave.mjs --plan <plan> --task <n> --root <dir>',
  'Lands a resolved conflict branch exo-conflict-<n> onto the run checkout once it has no markers and the Land gate passes; prints LANDED or CONFLICT.'
].join('\n');

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value' }, { usage: USAGE });
  for (const name of ['plan', 'root']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required`);
  }
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  process.stdout.write(landResolved({ planPath, root: flags.root, number: Number(flags.task) }));
}

function guarded(argv) {
  try {
    main(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`conflict-wave: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) guarded(process.argv.slice(2));
