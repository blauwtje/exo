import { BlockedRoute, getJson } from './http.mjs';

const REPO_PATH = /^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

export function readmeRoute(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'github.com') return null;
  const match = REPO_PATH.exec(parsed.pathname);
  if (!match) return null;
  const api = `https://api.github.com/repos/${match[1]}/${match[2]}/readme`;
  return { name: 'github-readme', fetchText: (target, context) => readme(api, context) };
}

async function readme(api, context) {
  const body = await getJson(api, context);
  if (body.encoding !== 'base64' || typeof body.content !== 'string') throw new BlockedRoute('answer had no README');
  return Buffer.from(body.content, 'base64').toString('utf8');
}
