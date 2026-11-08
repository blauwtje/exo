import fs from 'node:fs';
import path from 'node:path';
import { agentContextTarget } from './context-limits.mjs';
import { fileTokens } from './read-estimate.mjs';

const SKIPPED = new Set(['.git', 'node_modules']);

function rangeBytes(target, { first, last }) {
  const lines = fs.readFileSync(target, 'utf8').split('\n');
  return Buffer.byteLength(lines.slice(first - 1, last).join('\n'));
}

function tokensOf(target, limit, bytesPerToken) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return fileTokens(target, { bytesPerToken, size: stat.size });
  let sum = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (sum > limit) break;
    if (SKIPPED.has(entry.name) || entry.isSymbolicLink()) continue;
    sum += tokensOf(path.join(target, entry.name), limit - sum, bytesPerToken);
  }
  return sum;
}

export function readEntries(paths, cwd, bytesPerToken) {
  const limit = agentContextTarget();
  return paths.map((entry) => {
    const target = path.resolve(cwd, entry.path);
    const resolved = fs.existsSync(target);
    const ranged = resolved && entry.first !== undefined && fs.statSync(target).isFile();
    const tokens = entry.searched ? 0 : ranged ? rangeBytes(target, entry) / bytesPerToken : tokensOf(target, limit, bytesPerToken);
    return { path: entry.path, resolved, tokens: resolved ? tokens : 0 };
  });
}
