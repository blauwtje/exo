import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BlockedRoute, getJson } from './http.mjs';

const run = promisify(execFile);

async function ghIsLoggedIn(exec) {
  try {
    await exec('gh', ['auth', 'status']);
    return true;
  } catch {
    return false;
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

async function viaCli({ query, limit }, exec) {
  const fields = 'fullName,url,updatedAt,stargazersCount,description';
  const { stdout } = await exec('gh', ['search', 'repos', query, '--limit', String(limit), '--json', fields]);
  return JSON.parse(stdout).map(fromRepo);
}

async function viaRest({ query, limit }, context) {
  const url = `https://api.github.com/search/repositories?per_page=${limit}&q=${encodeURIComponent(query)}`;
  const body = await getJson(url, context);
  if (!Array.isArray(body.items)) throw new BlockedRoute('GitHub rate limit');
  return body.items.map(fromRepo);
}

export async function search(request, context) {
  const exec = context.exec ?? run;
  if (await ghIsLoggedIn(exec)) return viaCli(request, exec);
  return viaRest(request, context);
}
