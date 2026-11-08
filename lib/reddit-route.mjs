const MIRROR_HOST = /(^|\.)(reddit\.com|redd\.it|redlib[\w.-]*|libreddit[\w.-]*|teddit[\w.-]*|redditmirror[\w.-]*)$/i;
const SITE_OPERATOR = /\bsite:(www\.|old\.)?reddit\.com\b/i;
const BARE_REDDIT = /\breddit\b|(^|\s)\/?r\/\w+/i;

function scriptPath() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  return root ? `${root}/skills/spec/scripts/search.mjs` : 'skills/spec/scripts/search.mjs';
}

export function redditRoute() {
  return `Reddit goes through \`node "${scriptPath()}" --source reddit --query <text> --run <run-dir>\`; old.reddit.com and www.reddit.com block Node too, so when the script reports a block, a WebSearch with a site:reddit.com operator is the working fallback; never WebFetch a reddit host or mirror, and after the first blocked-domain error record a gap.`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function redditRouteDecision({ tool_name: tool, tool_input: input } = {}) {
  if (tool === 'WebFetch' && MIRROR_HOST.test(hostOf(input?.url))) return { deny: `exo: WebFetch of a Reddit host or mirror fails. ${redditRoute()}` };
  if (tool !== 'WebSearch') return null;
  const query = String(input?.query ?? '');
  if (SITE_OPERATOR.test(query) || !BARE_REDDIT.test(query)) return null;
  return { deny: `exo: a WebSearch naming reddit or r/<sub> without a site: operator fails. ${redditRoute()}` };
}
