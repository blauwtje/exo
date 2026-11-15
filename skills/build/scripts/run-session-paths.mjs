import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orWhenAbsent } from '#absent-path';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIRECTORY = path.dirname(SCRIPTS_DIR);
export const GATE_DIRECTORY = path.join(path.dirname(SKILL_DIRECTORY), 'gate');
export const PLUGIN_ROOT = path.resolve(SCRIPTS_DIR, '..', '..', '..');
export const SCRIPT = {
  landTask: path.join(SCRIPTS_DIR, 'land-task.mjs'),
  runDecision: path.join(PLUGIN_ROOT, 'lib', 'run-decision.mjs'),
  gate: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'verify.mjs'),
  planCheck: path.join(PLUGIN_ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs')
};
export const CLI = path.join(SCRIPTS_DIR, 'exo-cli.mjs');
export const RUN_PLAN = path.join(SCRIPTS_DIR, 'run-plan.mjs');
export const watchCommand = (id) => `node "${CLI}" wait ${id}`;

export const scriptPath = (name) => path.join(SCRIPTS_DIR, name);

export const realpathOr = (file) => orWhenAbsent(() => fs.realpathSync(file), path.resolve(file));

export const spellings = (file) => [...new Set([file, realpathOr(file)])];
