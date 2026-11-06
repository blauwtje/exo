import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { excludeScratch, ScratchExcludeError } from '../../../lib/scratch-exclude.mjs';

export function excludeScratchIfGit(cwd) {
  try {
    excludeScratch(cwd);
  } catch (error) {
    if (!(error instanceof ScratchExcludeError)) throw error;
  }
}

const TRACKING_PARAM = /^(?:utm_|fbclid$|gclid$|ref$)/i;
const REF_LENGTH = 6;

export function canonicalUrl(raw) {
  const url = new URL(raw);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const href = url.toString();
  return url.pathname === '/' && !url.search ? href.replace(/\/$/, '') : href;
}

export function refOf(canonical) {
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, REF_LENGTH);
}

export function ledgerPath(runDir) {
  return path.join(runDir, 'sources.jsonl');
}

export function pagePath(runDir, ref) {
  return path.join(runDir, 'pages', `${ref}.txt`);
}

export function readSources(runDir) {
  const file = ledgerPath(runDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function recordSource(runDir, entry) {
  const canonical = canonicalUrl(entry.url);
  const existing = readSources(runDir).find((row) => row.url === canonical);
  if (existing) return existing;
  const row = { ref: refOf(canonical), url: canonical, ...entry.fields, url_fetched: entry.url };
  fs.mkdirSync(runDir, { recursive: true });
  fs.appendFileSync(ledgerPath(runDir), `${JSON.stringify(row)}\n`);
  return row;
}
