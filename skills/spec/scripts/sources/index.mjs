import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isCommandFailure } from '#basics';
import { BlockedRoute, getJson, getText, isoDate, resultList } from './http.mjs';
import { search as reddit } from './reddit.mjs';

const run = promisify(execFile);

const ARXIV_ENTRY = /<entry>([\s\S]*?)<\/entry>/g;

function xmlTag(block, name) {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

async function arxiv({ query, limit }, context) {
  const url = `https://export.arxiv.org/api/query?max_results=${limit}&search_query=all:${encodeURIComponent(query)}`;
  const feed = await getText(url, context);
  return [...feed.matchAll(ARXIV_ENTRY)].map(([, block]) => ({
    title: xmlTag(block, 'title'),
    url: xmlTag(block, 'id').replace('http://', 'https://').replace(/v\d+$/, ''),
    date: xmlTag(block, 'published').slice(0, 10),
    signals: {},
  }));
}

async function ghIsLoggedIn(exec) {
  try {
    await exec('gh', ['auth', 'status']);
    return true;
  } catch (error) {
    if (isCommandFailure(error)) return false;
    throw error;
  }
}

function fromRepo(repo) {
  return {
    title: repo.fullName ?? repo.full_name,
    url: repo.url ?? repo.html_url,
    date: (repo.updatedAt ?? repo.updated_at ?? '').slice(0, 10),
    signals: { stars: repo.stargazersCount ?? repo.stargazers_count },
    description: repo.description,
  };
}

async function githubViaCli({ query, limit }, exec) {
  const fields = 'fullName,url,updatedAt,stargazersCount,description';
  const { stdout } = await exec('gh', ['search', 'repos', query, '--limit', String(limit), '--json', fields]);
  return JSON.parse(stdout).map(fromRepo);
}

async function githubViaRest({ query, limit }, context) {
  const url = `https://api.github.com/search/repositories?per_page=${limit}&q=${encodeURIComponent(query)}`;
  const body = await getJson(url, context);
  if (!Array.isArray(body.items)) throw new BlockedRoute(`GitHub rate limit on search "${query}": retry later or run gh auth login`);
  return body.items.map(fromRepo);
}

async function github(request, context) {
  const exec = context.exec ?? run;
  if (await ghIsLoggedIn(exec)) return githubViaCli(request, exec);
  return githubViaRest(request, context);
}

async function hn({ query, limit }, context) {
  const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${limit}`;
  const body = await getJson(url, context);
  return resultList(body.hits, url).map((hit) => ({
    title: hit.title,
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    date: hit.created_at.slice(0, 10),
    signals: { points: hit.points, comments: hit.num_comments },
  }));
}

async function podcast({ query, limit }, context) {
  const url = `https://itunes.apple.com/search?media=podcast&limit=${limit}&term=${encodeURIComponent(query)}`;
  const body = await getJson(url, context);
  return resultList(body.results, url).map((show) => ({
    title: show.collectionName,
    url: show.collectionViewUrl,
    date: (show.releaseDate ?? '').slice(0, 10),
    signals: { episodes: show.trackCount },
  }));
}

async function stackoverflow({ query, limit }, context) {
  const params = `order=desc&sort=relevance&site=stackoverflow&pagesize=${limit}&q=${encodeURIComponent(query)}`;
  const url = `https://api.stackexchange.com/2.3/search/advanced?${params}`;
  const body = await getJson(url, context);
  return resultList(body.items, url).map((item) => ({
    title: item.title,
    url: item.link,
    date: isoDate(item.creation_date),
    signals: { score: item.score, answers: item.answer_count, accepted: Boolean(item.accepted_answer_id) },
  }));
}

async function wikipedia({ query, limit }, context) {
  const params = `action=query&list=search&format=json&srlimit=${limit}&srsearch=${encodeURIComponent(query)}`;
  const url = `https://en.wikipedia.org/w/api.php?${params}`;
  const body = await getJson(url, context);
  return resultList(body.query?.search, url).map((hit) => ({
    title: hit.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(' ', '_'))}`,
    date: hit.timestamp.slice(0, 10),
    signals: { words: hit.wordcount },
  }));
}

export const SOURCES = { arxiv, github, hn, podcast, reddit, stackoverflow, wikipedia };
