import { readFile } from "node:fs/promises";
import { environmentMs } from "#script-flags";
import { ask, canonicalUrl } from "./pick.mjs";

const MAX_TURNS = 20;
const ENTITIES = {
  lt: "<", gt: ">", quot: "\"", nbsp: " ", amp: "&",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
};
const OTHER_SOURCE_HOSTS = {
  reddit: "reddit.com",
  hn: "news.ycombinator.com",
  github: "github.com",
};

const SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          site: { type: "string" },
          date: { type: "string" },
          why: { type: "string" },
          quote: { type: "string" },
          subs: { type: "array", items: { type: "integer" } },
        },
        required: ["title", "url", "site", "date", "why", "quote", "subs"],
      },
    },
  },
  required: ["rows"],
};

const onHost = (url, host) => {
  const { hostname } = new URL(url);
  return hostname === host || hostname.endsWith(`.${host}`);
};

export function toEvidence(rows, sources, skip = new Set()) {
  const dropped = Object.entries(OTHER_SOURCE_HOSTS)
    .filter(([source]) => sources.includes(source))
    .map(([, host]) => host);
  const skipped = new Set([...skip].map(canonicalUrl));
  const result = { read: [], failed: [] };
  for (const row of rows) {
    if (!URL.canParse(row.url)) {
      result.failed.push(`dropped web row with invalid url: ${row.url}`);
      continue;
    }
    if (dropped.some((host) => onHost(row.url, host)) || skipped.has(canonicalUrl(row.url))) continue;
    result.read.push({
      url: row.url,
      text: `- [${row.title}](${row.url}) | ${row.site} | ${row.date}\nwhy: ${row.why}\n> ${row.quote}`,
      subs: row.subs,
      quote: row.quote,
    });
  }
  return result;
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();

const decodeEntity = (entity, decimal, hex, name) => {
  if (name) return ENTITIES[name] ?? entity;
  return String.fromCodePoint(decimal ? Number(decimal) : parseInt(hex, 16));
};

const pageText = (html) => collapse(html.replace(/<[^>]*>/g, " ").replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, decodeEntity));

async function checkQuote(item, quote, fetchPage) {
  const page = await fetchPage(item.url, { signal: AbortSignal.timeout(environmentMs("EXO_SEARCH_FETCH_MS", 15000)) })
    .then((response) => (response.ok ? response.text() : null))
    .catch(() => null);
  if (page === null) return { ...item, text: `${item.text}\n(page not fetched)` };
  if (pageText(page).includes(collapse(quote))) return item;
  return { ...item, text: `${item.text}\n(quote not found on page)`, subs: [] };
}

function webInput(plan) {
  const asks = plan.subQuestions.map(({ ask: question, terms }, index) => `Q${index + 1} ${question} | terms: ${terms.join(", ")}`);
  const others = plan.sources.filter((source) => source !== "web");
  return [
    `Question: ${plan.question}`,
    ...asks,
    `Since: ${plan.since}`,
    `Other chosen sources: ${others.join(", ") || "none"}`,
    `Skip urls: ${[...plan.skip].join(", ") || "none"}`,
  ].join("\n");
}

export async function collect(plan, state = null, limit = Infinity, fetchPage = fetch) {
  const system = await readFile(new URL("../references/web.md", import.meta.url), "utf8");
  const before = state?.read ?? [];
  const skip = new Set([...plan.skip, ...before]);
  const { rows } = await ask({ model: "sonnet", system, tools: "WebSearch,WebFetch", schema: SCHEMA, maxTurns: MAX_TURNS }, webInput({ ...plan, skip }));
  const evidence = toEvidence(rows, plan.sources, skip);
  const read = await Promise.all(evidence.read.slice(0, limit).map(({ quote, ...item }) => checkQuote(item, quote, fetchPage)));
  return {
    read,
    found: rows.length,
    failed: evidence.failed,
    state: { read: [...before, ...read.map((item) => item.url)] },
    done: read.length === 0,
  };
}
