import fs from 'node:fs';
import path from 'node:path';
import { codeBlocks } from './plan-regions.mjs';

export function readyTasks(tasks, landed) {
  return tasks.filter((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
}

const WAVE_LIMIT = 4;

const inBlock = (only) => (task) => only === null || only.includes(task.number);

const isSerial = (parallel) => parallel !== null && parallel.length === 0;

export function nextWave(tasks, landed, worktreeSetup, parallel = null, inFlight = [], only = null) {
  if (inFlight.length > 0) return startable(tasks, landed, worktreeSetup, parallel, inFlight, only);
  const ready = readyTasks(tasks, landed).filter(inBlock(only));
  if (ready.length === 0) return [];
  const [current, ...rest] = ready;
  if (worktreeSetup === null || isSerial(parallel) || tasks.length < 2 || current.design || current.files.length === 0) return [current];
  const wave = [current];
  const claimedPaths = current.files.map((file) => file.path);
  for (const task of rest) {
    if (wave.length >= WAVE_LIMIT) break;
    if (task.design) continue;
    const paths = task.files.map((file) => file.path);
    if (paths.length === 0) continue;
    if (paths.some((path) => claimedPaths.includes(path))) continue;
    wave.push(task);
    claimedPaths.push(...paths);
  }
  return wave;
}

function startable(tasks, landed, worktreeSetup, parallel, inFlight, only) {
  const running = tasks.filter((task) => inFlight.includes(task.number));
  if (worktreeSetup === null || isSerial(parallel) || tasks.length < 2 || running.some((task) => task.files.length === 0)) return [];
  const claimedPaths = running.flatMap((task) => task.files.map((file) => file.path));
  const started = [];
  for (const task of readyTasks(tasks, landed).filter(inBlock(only))) {
    if (running.length + started.length >= WAVE_LIMIT) break;
    if (inFlight.includes(task.number) || task.design) continue;
    const paths = task.files.map((file) => file.path);
    if (paths.length === 0 || paths.some((path) => claimedPaths.includes(path))) continue;
    started.push(task);
    claimedPaths.push(...paths);
  }
  return started;
}

export function isolatedCheckout(root, repository) {
  const real = fs.realpathSync(root);
  if (repository !== null && (fs.existsSync(repository) ? fs.realpathSync(repository) : path.resolve(repository)) === real) return false;
  return /[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.test(real);
}

export function waveLine(wave, inFlight = []) {
  if (inFlight.length > 0) {
    return `Start: ${wave.length === 0 ? 'none' : wave.map((task) => `Task ${task.number}`).join(', ')}`;
  }
  if (wave.length === 0) return 'Next: none, every task landed';
  if (wave.length === 1) return `Next: Task ${wave[0].number}`;
  return `Wave: ${wave.map((task) => `Task ${task.number}`).join(', ')}`;
}

export const BLOCK_TASK_LIMIT = 8;

export const INLINE_TASK_LIMIT = 4;

function codePasted(task) {
  if (task.compact || task.commitBlock === null) return false;
  const stepBlocks = codeBlocks(task.section).filter((block) => block !== task.commitBlock && block.trim() !== '');
  return stepBlocks.length >= task.files.length;
}

function inlineRefusal(tasks) {
  if (tasks.length === 0) return 'no tasks';
  if (tasks.length > INLINE_TASK_LIMIT) return `${tasks.length} tasks`;
  const ownerOf = new Map();
  for (const task of tasks) {
    if (task.design) return `Task ${task.number}: a Design: task`;
    if (task.files.length === 0) return `Task ${task.number}: no Files: entries`;
    if (!codePasted(task)) return `Task ${task.number}: no pasted code`;
    for (const file of task.files) {
      const owner = ownerOf.get(file.path);
      if (owner !== undefined && owner !== task.number) return `Task ${owner} and Task ${task.number} share ${file.path}`;
      ownerOf.set(file.path, task.number);
    }
  }
  return null;
}

export function planRoute(tasks) {
  if (inlineRefusal(tasks) === null) return { route: 'inline', reason: `${tasks.length} tasks, code pasted, files disjoint` };
  return { route: 'unit', reason: `${tasks.length} tasks` };
}

export function nextBlock(tasks, landed) {
  const [current] = readyTasks(tasks, landed);
  if (current === undefined) return [];
  if (current.design) return [current];
  const block = [];
  for (const task of tasks.slice(tasks.indexOf(current))) {
    if (landed.includes(task.number)) continue;
    if (block.length >= BLOCK_TASK_LIMIT || task.design) break;
    const blockNumbers = block.map((entry) => entry.number);
    if (!task.dependsOn.every((number) => landed.includes(number) || blockNumbers.includes(number))) break;
    block.push(task);
  }
  return block;
}

export function routeLine({ route, reason }) {
  return `Route: ${route} (${reason})`;
}

export function taskSize(task) {
  const stepBlocks = codeBlocks(task.section).filter((block) => block !== task.commitBlock);
  const lines = stepBlocks.reduce((total, block) => total + (block === '' ? 0 : block.split('\n').length), 0);
  return { lines, files: task.files.length };
}
