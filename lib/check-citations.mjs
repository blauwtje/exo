import fs from 'node:fs';
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const citations = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const checked = await checkCitations(citations);
  for (const { url, status } of checked) console.log(`${status} ${url}`);
  process.exitCode = checked.every((entry) => entry.status === 'verified') ? 0 : 1;
}
