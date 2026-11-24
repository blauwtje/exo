import { readFileSync } from "node:fs";
import { isMain } from "#script-flags";

const collapse = (text) => text.replace(/\s+/g, " ").trim();

const quotesOf = (answer) =>
  answer
    .split("\n")
    .filter((line) => line.startsWith(">"))
    .map((line) => collapse(line.slice(1)))
    .filter(Boolean);

const FLAG = " (quote not found on page)";
const SUMMARY = "(summary; verify)";
const RANKED_FLAG = "--ranked";

const withoutSummaries = (answer) =>
  answer
    .split("\n")
    .filter((line) => !line.includes(SUMMARY))
    .join("\n");

const idsOf = (answer) => [...new Set([...answer.matchAll(/\[(E\d+)\]/g)].map(([, id]) => id))];

const urlsOf = (answer) => (answer.match(/https?:\/\/\S+/g) ?? []).map((url) => url.replace(/[>\]).,;*"':!]+$/, ""));

export function misses(answer, bundles, knownIds) {
  const checked = withoutSummaries(answer);
  const texts = bundles.map(collapse);
  const found = (needle) => texts.some((text) => text.includes(needle));
  const quoteFound = (quote) => texts.some((text) => text.replaceAll(`${quote}${FLAG}`, "").includes(quote));
  return [
    ...quotesOf(checked).filter((quote) => !quoteFound(quote)).map((quote) => `missing quote: ${quote}`),
    ...urlsOf(checked).filter((url) => !found(url)).map((url) => `missing url: ${url}`),
    ...(knownIds ? idsOf(answer).filter((id) => !knownIds.has(id)).map((id) => `unknown evidence id: ${id}`) : []),
  ];
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  const rankedAt = args.indexOf(RANKED_FLAG);
  const files = rankedAt === -1 ? args : args.filter((_, index) => index !== rankedAt && index !== rankedAt + 1);
  let bundles;
  let knownIds;
  try {
    bundles = files.map((file) => readFileSync(file, "utf8"));
    if (rankedAt !== -1) knownIds = new Set(JSON.parse(readFileSync(args[rankedAt + 1], "utf8")).ranked.map(({ id }) => id));
  } catch (error) {
    console.error(`Cannot read bundle: ${error.message}`);
    process.exit(1);
  }
  const found = misses(await readStdin(), bundles, knownIds);
  if (found.length) console.log(found.join("\n"));
  process.exit(found.length ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
