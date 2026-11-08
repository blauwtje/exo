#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, relative, basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: node regions.mjs --root <dir> --region "<name>"... (numbered in the order given)';
const SOURCE = new Set(['.tsx', '.jsx', '.vue', '.svelte', '.astro', '.html', '.js', '.ts', '.css']);
const SKIPPED = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.exo', '.worktrees']);

function squash(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.has(extname(entry.name)) ? [path] : [];
  });
}

export function mapRegions(root, names) {
  const files = sourceFiles(root).map((path) => ({ path, key: squash(basename(path, extname(path))) }));
  return names.map((name, index) => {
    const wanted = squash(name);
    const hits = files.filter((file) => file.key === wanted).map((file) => relative(root, file.path)).sort();
    return { number: index + 1, name, files: hits };
  });
}

export function describe(region) {
  const head = `${region.number} ${region.name}`;
  if (region.files.length === 0) return `MISSING ${head}`;
  if (region.files.length > 1) return `AMBIGUOUS ${head} ${region.files.join(' ')}`;
  return `REGION ${head} ${region.files[0]}`;
}

function main(argv) {
  if (argv.includes('--help')) return console.log(USAGE);
  let root = null;
  const names = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') root = resolve(argv[++index] ?? '');
    else if (argv[index] === '--region') names.push(argv[++index] ?? '');
    else return fail(`unknown argument ${argv[index]}\n${USAGE}`);
  }
  if (!root || names.length === 0) return fail(USAGE);
  const regions = mapRegions(root, names);
  for (const region of regions) console.log(describe(region));
  const unmapped = regions.filter((region) => region.files.length !== 1).length;
  console.log(`REGIONS mapped=${regions.length - unmapped} unmapped=${unmapped}`);
  process.exitCode = unmapped === 0 ? 0 : 1;
}

function fail(message) {
  console.error(message);
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
