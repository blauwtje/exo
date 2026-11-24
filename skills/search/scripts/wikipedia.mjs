import { fetchOk, readBest, searchAll } from "./pick.mjs";

const api = "https://en.wikipedia.org/w/api.php";
const headers = { "User-Agent": "exo-search/1 (research reader)" };
const SEARCH_LIMIT = 20;
const MAX_CONCURRENT = 3;

let active = 0;
const waiting = [];

async function inSlot(task) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

const getJson = (params, fetcher) =>
  inSlot(async () => (await fetchOk("Wikipedia", `${api}?${new URLSearchParams({ format: "json", ...params })}`, fetcher, headers)).json());

const pageUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;

export async function find(plan, fetcher = fetch) {
  const terms = plan.subQuestions.flatMap(({ terms }) => terms);
  return searchAll(
    terms.map((term) => {
      const cards = getJson({ action: "query", list: "search", srsearch: term, srlimit: SEARCH_LIMIT }, fetcher).then(({ query }) =>
        query.search.map((hit) => {
          const date = hit.timestamp.slice(0, 10);
          return { url: pageUrl(hit.title), title: hit.title, facts: `${hit.wordcount} words | updated ${date}`, signals: { date } };
        }),
      );
      return { label: `"${term}"`, cards };
    }),
  );
}

function sections(extract, url) {
  const parts = [{ label: "Overview", link: url, lines: [] }];
  for (const line of extract.split("\n")) {
    const heading = line.match(/^=+\s*(.+?)\s*=+$/);
    if (heading) parts.push({ label: heading[1], link: `${url}#${heading[1].replaceAll(" ", "_")}`, lines: [] });
    else parts.at(-1).lines.push(line);
  }
  return parts
    .map(({ label, link, lines }) => ({ label, link, body: lines.join("\n").trim() }))
    .filter(({ body }) => body)
    .map((part, index) => ({ id: `s${index + 1}`, parent: null, score: null, ...part }));
}

export async function open(card, fetcher = fetch) {
  const { query } = await getJson({ action: "query", prop: "extracts", explaintext: 1, titles: card.title }, fetcher);
  const { extract } = Object.values(query.pages)[0];
  return { header: `${card.title}\n${card.facts}\n${card.url}`, passages: sections(extract, card.url) };
}

export const collect = (plan, state = null, limit = Infinity, deadline = undefined, fetcher = fetch) =>
  readBest(plan, { find: (p) => find(p, fetcher), open: (card) => open(card, fetcher) }, undefined, state, limit);
