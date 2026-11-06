import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pagePath, readSources } from './ledger.mjs';

export const SOURCE_KINDS = ['web', 'paper', 'code', 'forum', 'social', 'video', 'podcast'];
export const TIME_CLASSES = ['volatile', 'semi-stable', 'evergreen'];
const REQUIRED_FIELDS = ['id', 'sentence', 'ref', 'quote', 'kind', 'time_class'];

export function foldText(text) {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function claimsPath(runDir) {
  return path.join(runDir, 'claims.jsonl');
}

export function readClaims(runDir) {
  const file = claimsPath(runDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function claimProblem(runDir, claim) {
  const missing = REQUIRED_FIELDS.find((field) => typeof claim[field] !== 'string' || claim[field].trim() === '');
  if (missing) return `missing field ${missing}`;
  if (!SOURCE_KINDS.includes(claim.kind)) return `unknown source kind ${claim.kind}`;
  if (!TIME_CLASSES.includes(claim.time_class)) return `unknown time class ${claim.time_class}`;
  if (!readSources(runDir).some((row) => row.ref === claim.ref)) return `unknown ref ${claim.ref}`;
  const file = pagePath(runDir, claim.ref);
  if (!fs.existsSync(file)) return `page ${claim.ref} is not fetched`;
  const page = foldText(fs.readFileSync(file, 'utf8'));
  if (!page.includes(foldText(claim.quote))) return `quote not on page ${claim.ref}`;
  return null;
}

export function addClaim(runDir, claim) {
  const problem = claimProblem(runDir, claim);
  if (problem) throw new Error(problem);
  const row = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, claim[field].trim()]));
  fs.mkdirSync(runDir, { recursive: true });
  fs.appendFileSync(claimsPath(runDir), `${JSON.stringify(row)}\n`);
  return row;
}

function main(argv) {
  const [command, runDir, json] = argv;
  if (command !== 'add' || !runDir || !json) {
    process.stderr.write('usage: claims.mjs add <run-dir> <claim-json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const row = addClaim(runDir, JSON.parse(json));
    process.stdout.write(`${row.id}\t${row.ref}\tadded\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) main(process.argv.slice(2));
