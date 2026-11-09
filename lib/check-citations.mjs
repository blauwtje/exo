import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function squash(text) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.text();
}

async function checkCitation({ url, quote }, readPage) {
  let page;
  try {
    page = await readPage(url);
  } catch {
    return { url, quote, status: 'unreachable' };
  }
  const status = squash(page).includes(squash(quote)) ? 'verified' : 'missing';
  return { url, quote, status };
}

export function checkCitations(citations, readPage = fetchText) {
  return Promise.all(citations.map((citation) => checkCitation(citation, readPage)));
}

function pageFile(dir, row) {
  const id = row.url_fetched?.match(/\/comments\/([a-z0-9]+)/i)?.[1];
  const candidates = [path.join(dir, 'pages', `${row.ref}.txt`), id && path.join(dir, `t-${id}.txt`)];
  return candidates.find((file) => file && fs.existsSync(file));
}

export function savedPages(dir) {
  const pages = new Map();
  const ledger = path.join(dir, 'sources.jsonl');
  if (!fs.existsSync(ledger)) return pages;
  const rows = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  for (const row of rows) {
    const file = pageFile(dir, row);
    if (!file) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const url of [row.url, row.url_fetched]) if (url) pages.set(url, text);
  }
  return pages;
}

export function pageReader(pages, fetcher = fetchText) {
  return async (url) => pages.get(url) ?? fetcher(url);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const citations = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const checked = await checkCitations(citations, pageReader(savedPages(path.dirname(path.resolve(process.argv[2])))));
  for (const { url, status } of checked) console.log(`${status} ${url}`);
  process.exitCode = checked.every((entry) => entry.status === 'verified') ? 0 : 1;
}
