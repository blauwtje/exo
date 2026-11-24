import { fetchOk, plainText, readBest, searchAll } from "./pick.mjs";

const api = "https://api.stackexchange.com/2.3";
const SEARCH_LIMIT = 20;

const day = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);

const getJson = async (path, params, fetcher) => (await fetchOk("Stack Exchange", `${api}${path}?${new URLSearchParams(params)}`, fetcher)).json();

function questionCard(item, site) {
  const date = day(item.creation_date);
  const accepted = item.accepted_answer_id !== undefined;
  const facts = [`score ${item.score}`, `${item.answer_count} answers`, accepted ? "accepted" : "", `${item.view_count} views`, date].filter(Boolean).join(" | ");
  return { url: item.link, title: plainText(item.title), facts, site, signals: { score: item.score, accepted, views: item.view_count, date } };
}

export async function find(plan, fetcher = fetch) {
  const terms = plan.subQuestions.flatMap(({ terms }) => terms);
  const fromdate = Math.floor(Date.parse(plan.since) / 1000);
  return searchAll(
    plan.sites.flatMap((site) =>
      terms.map((term) => {
        const params = { q: term, site, pagesize: SEARCH_LIMIT, order: "desc", sort: "relevance", fromdate };
        const cards = getJson("/search/advanced", params, fetcher).then(({ items }) => items.map((item) => questionCard(item, site)));
        return { label: `"${term}" on ${site}`, cards };
      }),
    ),
  );
}

export async function open(card, fetcher = fetch) {
  const id = new URL(card.url).pathname.split("/")[2];
  const params = { site: card.site, filter: "withbody" };
  const [questions, answers] = await Promise.all([
    getJson(`/questions/${id}`, params, fetcher),
    getJson(`/questions/${id}/answers`, { ...params, sort: "votes" }, fetcher),
  ]);
  const [question] = questions.items;
  return {
    header: `${card.title}\n${card.facts}\n${card.url}\n\n${plainText(question.body)}`,
    passages: answers.items.map((answer) => ({
      id: String(answer.answer_id),
      parent: null,
      label: `${answer.owner.display_name}${answer.is_accepted ? " (accepted)" : ""}`,
      score: answer.score,
      body: plainText(answer.body),
      link: `${card.url}#${answer.answer_id}`,
    })),
  };
}

export const collect = (plan, state = null, limit = Infinity, deadline = undefined, fetcher = fetch) =>
  readBest(plan, { find: (p) => find(p, fetcher), open: (card) => open(card, fetcher) }, undefined, state, limit);
