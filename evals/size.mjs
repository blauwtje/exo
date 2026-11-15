#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isMain } from '../lib/script-flags.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCOPE = ['skills', 'agents', 'hooks', 'lib', 'verify', 'harnesses', 'output-styles'];
const SKILLS = ['build', 'configure', 'author', 'diagnose', 'gate', 'save', 'ship', 'spec', 'watch', 'document'];
const AGENTS = ['builder', 'orchestrator', 'researcher', 'reviewer'];

export const BASELINE = [
  ...SKILLS.map((name) => `skills/${name}/SKILL.md`),
  ...AGENTS.map((name) => `agents/${name}.md`),
  'output-styles/adhd.md',
];

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

export function scoreBytes(root) {
  const missing = BASELINE.some((file) => !fs.existsSync(path.join(root, file)));
  if (missing) return null;
  const files = SCOPE.flatMap((directory) => filesUnder(path.join(root, directory)));
  return files.reduce((total, file) => total + fs.statSync(file).size, 0);
}

if (isMain(import.meta.url)) {
  const bytes = scoreBytes(ROOT);
  if (bytes === null) {
    process.stderr.write('a baseline skill, agent or output style is missing\n');
    process.exit(1);
  }
  process.stdout.write(`SCORE ${bytes}\n`);
}
