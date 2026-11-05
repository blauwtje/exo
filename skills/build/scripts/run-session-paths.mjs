import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(SCRIPTS_DIR, '..', '..', '..');
export const SCRIPT = {
  landTask: path.join(SCRIPTS_DIR, 'land-task.mjs'),
  runDecision: path.join(PLUGIN_ROOT, 'lib', 'run-decision.mjs'),
  gate: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'gate.mjs'),
  runProbes: path.join(PLUGIN_ROOT, 'skills', 'gate', 'scripts', 'run-probes.mjs'),
  planCheck: path.join(PLUGIN_ROOT, 'skills', 'spec', 'scripts', 'plan-check.mjs')
};

export const realpathOr = (file) => {
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};

export const spellings = (file) => [...new Set([file, realpathOr(file)])];
