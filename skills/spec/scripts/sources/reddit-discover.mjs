export function splitSubreddit(query, subreddit) {
  const inline = query.match(/(?:^|\s)r\/(\w+)/);
  if (!inline) return { subreddit, text: query };
  const text = query.replace(inline[0], ' ').replace(/\s+/g, ' ').trim();
  return { subreddit: subreddit || inline[1], text };
}
