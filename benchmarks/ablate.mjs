#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const PART_SOURCES = [
  { kind: 'hook', dir: 'hooks', pattern: /\.mjs$/ },
  { kind: 'rule', dir: 'hooks', pattern: /-rules\.md$|-routing\.md$/ },
  { kind: 'reference', dir: 'skills', pattern: /\.md$/, nested: 'references' }
];

function filesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().map((name) => path.join(dir, name));
}

function sourceFiles(root, source) {
  const base = path.join(root, source.dir);
  if (!source.nested) return filesIn(base);
  return filesIn(base).flatMap((skill) => filesIn(path.join(skill, source.nested)));
}

function countLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split('\n').filter((line, index, all) => index < all.length - 1 || line !== '').length;
}

function variantsOf(root, source) {
  return sourceFiles(root, source)
    .map((file) => path.relative(root, file))
    .filter((relative) => source.pattern.test(relative))
    .map((relative) => ({
      id: `ablate-${source.kind}-${relative.replaceAll(path.sep, '-')}`,
      kind: source.kind,
      remove: [relative],
      linesRemoved: countLines(path.join(root, relative))
    }));
}

export function buildVariants(root = ROOT) {
  return PART_SOURCES.flatMap((source) => variantsOf(root, source));
}

export function pickForRound(variants, round) {
  if (variants.length === 0) return null;
  return variants[((round % variants.length) + variants.length) % variants.length];
}

export function applyVariant(copyRoot, variant) {
  for (const relative of variant.remove) {
    fs.rmSync(path.join(copyRoot, relative));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const variant of buildVariants()) {
    process.stdout.write(`${variant.id}\t${variant.kind}\t${variant.linesRemoved}\n`);
  }
}
