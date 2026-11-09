const MIRROR_HOST = /(^|\.)(reddit\.com|redd\.it|redlib[\w.-]*|libreddit[\w.-]*|teddit[\w.-]*|redditmirror[\w.-]*)$/i;
const SITE_OPERATOR = /\bsite:(www\.|old\.)?reddit\.com\b/i;
const THREAD_SEEKING = /(^|\s)\/?r\/\w+|\bon reddit\b|(?<!\b(is|about|of|the)\s+)\breddit\s*$|\breddit\s+(threads?|posts?|comments?|discussions?|opinions?|reviews?)\b/i;

export function redditRoute() {
  return 'exo: Reddit blocks this call. Do instead: run search.mjs --source reddit --query <text> --run <run-dir> from exo, or a site:reddit.com WebSearch';
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function redditRouteDecision({ tool_name: tool, tool_input: input } = {}) {
  if (tool === 'WebFetch' && MIRROR_HOST.test(hostOf(input?.url))) return { deny: redditRoute() };
  if (tool !== 'WebSearch') return null;
  const query = String(input?.query ?? '');
  if (SITE_OPERATOR.test(query) || !THREAD_SEEKING.test(query)) return null;
  return { deny: redditRoute() };
}
