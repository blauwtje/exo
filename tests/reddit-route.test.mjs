import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redditRouteDecision, redditBashDecision } from '../lib/reddit-route.mjs';
import { contextHook } from '../hooks/context-limit.mjs';

const search = (query) => ({ tool_name: 'WebSearch', tool_input: { query } });
const fetchUrl = (url) => ({ tool_name: 'WebFetch', tool_input: { url, prompt: 'x' } });

test('WebFetch of reddit hosts and mirrors is denied', () => {
  for (const url of ['https://old.reddit.com/r/a', 'https://www.reddit.com/r/a', 'https://redd.it/x', 'https://redlib.example.org/r/a', 'https://libreddit.de/r/a']) {
    assert.match(redditRouteDecision(fetchUrl(url)).deny, /--source reddit/);
  }
});

test('WebFetch of other hosts passes', () => {
  assert.equal(redditRouteDecision(fetchUrl('https://example.com/reddit')), null);
  assert.equal(redditRouteDecision(fetchUrl('not a url')), null);
});

test('WebSearch without reddit passes', () => {
  assert.equal(redditRouteDecision(search('best editor')), null);
  assert.equal(redditRouteDecision({ tool_name: 'Read', tool_input: {} }), null);
});

test('the context hook emits the deny', () => {
  const out = contextHook(fetchUrl('https://www.reddit.com/r/a'));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
});

test('the deny names the script, its --run argument and the WebSearch fallback', () => {
  const { deny } = redditRouteDecision(fetchUrl('https://old.reddit.com/r/a'));
  assert.match(deny, /node \/.*\/skills\/spec\/scripts\/search\.mjs --source reddit --query <text> --run <run-dir>/);
  assert.doesNotMatch(deny, /site:reddit\.com/);
});

test('every refusal is one line of at most 320 characters', () => {
  const decisions = [fetchUrl('https://old.reddit.com/r/a')].map(redditRouteDecision);
  for (const { deny } of decisions) {
    assert.ok(deny.length <= 320, String(deny.length));
    assert.doesNotMatch(deny, /\n/);
  }
});

test('the deny carries a Do instead clause within 320 characters', () => {
  const { deny } = redditRouteDecision(fetchUrl('https://old.reddit.com/r/a'));
  assert.match(deny, /Do instead: .*--run <run-dir>/);
  assert.ok(deny.length <= 320);
});

test('a WebSearch naming reddit or r/<sub> passes', () => {
  assert.equal(redditRouteDecision(search('best editor reddit')), null);
  assert.equal(redditRouteDecision(search('r/neovim plugins')), null);
});

test('a WebFetch to reddit.com points to the live search.mjs --url read', () => {
  assert.match(redditRouteDecision(fetchUrl('https://www.reddit.com/r/a/comments/x/y/')).deny, /search\.mjs --url/);
});

test('a Bash curl to reddit.com or arctic-shift is refused with search.mjs named', async () => {
  const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
  for (const command of ['curl -s https://www.reddit.com/r/a.json', 'curl https://arctic-shift.photon-reddit.com/api/posts/search']) {
    const out = await dispatchBash({ tool_name: 'Bash', tool_input: { command }, agent_id: 'a', agent_type: 'research-worker' });
    assert.match(JSON.stringify(out), /search\.mjs/);
  }
});

test('a curl split by a backslash newline is denied', () => {
  assert.match(redditBashDecision('curl -s \\\n https://www.reddit.com/r/x').deny, /--source reddit/);
});

test('a curl through a variable is denied', () => {
  assert.match(redditBashDecision('U=https://www.reddit.com/r/x; curl $U').deny, /--source reddit/);
});

test('the search.mjs route and prose naming fetch and reddit pass', () => {
  assert.equal(redditBashDecision('node skills/spec/scripts/search.mjs --source reddit --query "fetch api" --url https://www.reddit.com/r/node/comments/abc/x/'), null);
  assert.equal(redditBashDecision('git commit -m "fix: fetch from reddit.com via search.mjs"'), null);
});

test('read-only commands that mention fetch( and reddit.com pass', () => {
  assert.equal(redditBashDecision('grep -rn "fetch(" skills | grep reddit.com'), null);
  assert.equal(redditBashDecision('git commit -F - <<EOF\nfix\ncurl against reddit.com\nEOF'), null);
});

test('a read-only word exempts only its own command segment', () => {
  assert.ok(redditBashDecision('echo x; curl https://www.reddit.com/r/a.json'));
  assert.ok(redditBashDecision('echo x && curl https://reddit.com/x'));
  assert.equal(redditBashDecision('grep -n fetch reddit.com.txt'), null);
});

test('node fetch, wrapped curl and absolute-path curl to reddit are denied', () => {
  for (const command of ['node -e "fetch(\'https://www.reddit.com/r/a.json\')"', 'timeout 30 curl https://www.reddit.com/r/a', 'env curl https://redd.it/x', '/usr/bin/curl https://www.reddit.com/r/a', '(curl https://www.reddit.com/r/a)']) {
    assert.ok(redditBashDecision(command), command);
  }
});

test('WebFetch to arctic-shift and a trailing-dot reddit host are denied', () => {
  assert.ok(redditRouteDecision(fetchUrl('https://arctic-shift.photon-reddit.com/api/posts/search')));
  assert.ok(redditRouteDecision(fetchUrl('https://www.reddit.com./r/a')));
});

test('a reddit or arctic-shift fetch behind a wrapper or shell -c is denied', () => {
  const wrapped = [
    'bash -c "curl https://www.reddit.com/r/a.json"',
    "sh -c 'curl -s https://arctic-shift.photon-reddit.com/api/posts/search'",
    'zsh -c "echo x; wget https://redd.it/x"',
    'nice -n 5 curl https://www.reddit.com/r/a',
    'nohup curl https://www.reddit.com/r/a',
    'echo https://www.reddit.com/r/a | xargs curl',
    'command curl https://www.reddit.com/r/a',
    'nohup bash -c "nice curl https://www.reddit.com/r/a"',
  ];
  for (const command of wrapped) assert.ok(redditBashDecision(command), command);
});

test('a search.mjs call whose query text holds fetch( or curl passes', () => {
  assert.equal(redditBashDecision('node skills/spec/scripts/search.mjs --source reddit --query "fetch( reddit.com" --run .exo/r'), null);
  assert.equal(redditBashDecision('node skills/spec/scripts/search.mjs --source reddit --query "a; curl reddit.com" --run .exo/r'), null);
});

test('inline runtime fetch in combined, equals and deno eval forms is denied', () => {
  for (const command of ["node -pe \"fetch('https://www.reddit.com/r/a')\"", "node --eval=\"fetch('https://www.reddit.com/r/a')\"", "deno eval \"fetch('https://www.reddit.com/r/a')\""]) {
    assert.ok(redditBashDecision(command), command);
  }
});

test('wrapper options that take a value do not hide the fetcher', () => {
  for (const command of ['sudo -u root curl https://reddit.com', 'timeout -s KILL 10 curl https://reddit.com', 'env -u HOME curl https://reddit.com', 'echo https://reddit.com | xargs -I URL curl URL']) {
    assert.ok(redditBashDecision(command), command);
  }
});

test('reserved words and grouping do not hide the fetcher', () => {
  for (const command of ['{ curl https://reddit.com; }', '! curl https://reddit.com', 'if true; then curl https://reddit.com; fi', 'for u in https://reddit.com; do curl $u; done']) {
    assert.ok(redditBashDecision(command), command);
  }
});

test('a script fed to a shell over stdin is judged and echo xargs curl passes', () => {
  for (const command of ["echo 'curl https://reddit.com' | bash", "bash <<< 'curl https://reddit.com'", 'bash <<EOF\ncurl https://reddit.com\nEOF']) {
    assert.ok(redditBashDecision(command), command);
  }
  assert.equal(redditBashDecision('echo xargs curl https://reddit.com'), null);
});
