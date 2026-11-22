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

const urlsOf = (answer) => (answer.match(/https?:\/\/\S+/g) ?? []).map((url) => url.replace(/[>\]).,;*"':!]+$/, ""));

export function misses(answer, bundles) {
  const texts = bundles.map(collapse);
  const found = (needle) => texts.some((text) => text.includes(needle));
  const quoteFound = (quote) => texts.some((text) => text.replaceAll(`${quote}${FLAG}`, "").includes(quote));
  return [
    ...quotesOf(answer).filter((quote) => !quoteFound(quote)).map((quote) => `missing quote: ${quote}`),
    ...urlsOf(answer).filter((url) => !found(url)).map((url) => `missing url: ${url}`),
  ];
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  let bundles;
  try {
    bundles = process.argv.slice(2).map((file) => readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Cannot read bundle: ${error.message}`);
    process.exit(1);
  }
  const found = misses(await readStdin(), bundles);
  if (found.length) console.log(found.join("\n"));
  process.exit(found.length ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
