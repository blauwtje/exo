import { environmentMs } from "#script-flags";
import { fetchOk, plainText, readBest, searchAll } from "./pick.mjs";

const api = "https://export.arxiv.org/api/query";
const SEARCH_LIMIT = 20;

const pause = () => new Promise((resolve) => setTimeout(resolve, environmentMs("EXO_SEARCH_ARXIV_GAP_MS", 3000)));

let tail = Promise.resolve();

function inTurn(task) {
  const result = tail.then(task);
  tail = result.then(pause, pause);
  return result;
}

const tagText = (entry, tag) => plainText(entry.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").replace(/\s+/g, " ");

function parseEntries(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(([, name]) => plainText(name)).join(", ");
    const date = tagText(entry, "published").slice(0, 10);
    return {
      url: tagText(entry, "id").replace(/^http:/, "https:"),
      title: tagText(entry, "title"),
      facts: `${authors} | ${date}`,
      abstract: tagText(entry, "summary"),
      signals: { date },
    };
  });
}

const query = (term) => term.split(/\s+/).map((word) => `all:${word}`).join(" AND ");

export async function find(plan, fetcher = fetch) {
  const terms = plan.subQuestions.flatMap(({ terms }) => terms);
  return searchAll(
    terms.map((term) => {
      const params = new URLSearchParams({ search_query: query(term), max_results: SEARCH_LIMIT, sortBy: "relevance" });
      const cards = inTurn(async () => parseEntries(await (await fetchOk("arXiv", `${api}?${params}`, fetcher)).text()));
      return { label: `"${term}"`, cards };
    }),
  );
}

export async function open(card) {
  const body = { id: "s1", parent: null, label: "Abstract", score: null, body: card.abstract, link: card.url };
  return { header: `${card.title}\n${card.facts}\n${card.url}`, passages: [body] };
}

export const collect = (plan, state = null, limit = Infinity, deadline = undefined, fetcher = fetch) =>
  readBest(plan, { find: (p) => find(p, fetcher), open }, undefined, state, limit);
