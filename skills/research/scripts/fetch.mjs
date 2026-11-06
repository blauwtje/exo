import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gateRequest } from '../../watch/scripts/request-gate.mjs';
import { pageText } from './page-text.mjs';
import { excludeScratchIfGit, pagePath, recordSource } from './ledger.mjs';

const USER_AGENT = 'Mozilla/5.0 (compatible; exo-research)';

export async function fetchPage(url, options) {
  const { runDir, fetchImpl = fetch, gate = {} } = options;
  const row = recordSource(runDir, { url, fields: {} });
  const file = pagePath(runDir, row.ref);
  if (fs.existsSync(file)) return { ...row, file, cached: true };
  await gateRequest(row.url, gate);
  const response = await fetchImpl(row.url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${row.url}`);
  const text = pageText(await response.text(), response.headers.get('content-type'));
  if (text === '') throw new Error(`status: blocked, empty page for ${row.url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`);
  return { ...row, file, cached: false };
}

export async function savePageText(url, text, options) {
  const row = recordSource(options.runDir, { url, fields: {} });
  const file = pagePath(options.runDir, row.ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text.trim()}\n`);
  return { ...row, file, cached: false };
}

async function saveFromStdin(runDir, url) {
  const page = await savePageText(url, fs.readFileSync(0, 'utf8'), { runDir });
  process.stdout.write(`${page.ref}\t${page.url}\tsaved\n`);
}

async function main(argv) {
  excludeScratchIfGit(process.cwd());
  if (argv[0] === '--save' && argv.length === 3) return saveFromStdin(argv[1], argv[2]);
  const [runDir, ...urls] = argv;
  if (!runDir || urls.length === 0) {
    process.stderr.write('usage: fetch.mjs <run-dir> <url>... | fetch.mjs --save <run-dir> <url> < text\n');
    process.exitCode = 2;
    return;
  }
  for (const url of urls) {
    try {
      const page = await fetchPage(url, { runDir });
      process.stdout.write(`${page.ref}\t${page.url}\t${page.cached ? 'cached' : 'fetched'}\n`);
    } catch (error) {
      process.stderr.write(`${url}\t${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) await main(process.argv.slice(2));
