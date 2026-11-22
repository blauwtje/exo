import { readBest, searchAll } from "./pick.mjs";
const api = "https://hn.algolia.com/api/v1";
const SEARCH_LIMIT = 30;

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hacker News answered ${response.status} for ${url}`);
  return response.json();
}

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function plainText(html) {
  return html
    .replace(/<\/?p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name) => {
      if (name[0] !== "#") return entities[name.toLowerCase()] ?? match;
      return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    })
    .trim();
}

function itemLink(id) {
  return `https://news.ycombinator.com/item?id=${id}`;
}

function day(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function storyHeader(story, id) {
  const parts = [
    `${story.title ?? plainText(story.text ?? "")}\nu/${story.author} | ${story.points ?? 0} points | ${day(story.created_at_i)}\n${itemLink(id)}`,
  ];
  if (story.title && story.text) parts.push(plainText(story.text));
  if (story.url) parts.push(`Link: ${story.url}`);
  return parts.join("\n\n");
}

function flattenComments(children, parent, comments) {
  for (const comment of children) {
    const live = comment.author !== null && comment.text !== null;
    if (live) {
      comments.push({
        id: String(comment.id),
        parent,
        label: `u/${comment.author}`,
        score: null,
        body: plainText(comment.text),
        link: itemLink(comment.id),
      });
    }
    flattenComments(comment.children, live ? String(comment.id) : parent, comments);
  }
  return comments;
}

export async function find(plan) {
  const since = Math.floor(Date.now() / 1000) - plan.days * 86400;
  const terms = plan.subQuestions.flatMap(({ terms }) => terms);
  return searchAll(
    terms.map((term) => {
      const params = new URLSearchParams({ query: term, tags: "story", hitsPerPage: SEARCH_LIMIT, numericFilters: `created_at_i>${since}` });
      const cards = getJson(`${api}/search?${params}`).then(({ hits }) =>
        hits.map((hit) => ({
          url: itemLink(hit.objectID),
          title: hit.title,
          facts: `${hit.points ?? 0} points | ${hit.num_comments ?? 0} comments | ${day(hit.created_at_i)}`,
        })),
      );
      return { label: `"${term}"`, cards };
    }),
  );
}

export async function open(card) {
  const id = new URL(card.url).searchParams.get("id");
  const story = await getJson(`${api}/items/${id}`);
  return { header: storyHeader(story, id), passages: flattenComments(story.children, null, []) };
}

export const collect = (plan, state = null, limit = Infinity) => readBest(plan, { find, open }, undefined, state, limit);
