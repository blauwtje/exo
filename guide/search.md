# search

Runs deep research: sized parallel workers read the open web, plus GitHub, Reddit, Hacker News, Wikipedia, arXiv and Stack Exchange, and write one cited report with links and word-for-word quotes. The Reddit part uses your own Reddit login in a Chrome window, so it needs no Reddit API key and no paid service.

Claude's WebFetch and WebSearch cannot reach reddit.com, and Reddit blocks logged-out and headless requests.

## When it runs

On request: type `/exo:search` with your question. Claude does not start it by itself. Name a source in the question to use only that one, for example `hooks tips, only reddit and github`.

Not for this repo's code, a video url (`exo:watch`) or ideas (`exo:ideas`).

## What you get

- The skill sizes the run to the question: quick (1 worker), standard (3 to 5) or deep (8 to 15). Each worker takes one sub-question, searches, fetches the best pages with `skills/search/scripts/fetch.mjs` and writes word-for-word evidence; the API sources run through `search.mjs`.
- `rank.mjs` merges the evidence by relevance, quality and diversity and lists each `Uncovered` sub-question, which gets one more worker.
- The report goes to `docs/research/`, with an evidence id, a link and a quote per claim. `verify.mjs` checks that each quote and link is in a saved page, and a fresh reviewer checks that each quote supports its claim.
- The first Reddit search installs `playwright-core` (about 14 MB, no browser download) into `~/.search-reddit`. If you are not logged in, Claude opens a Chrome window: log in to Reddit there and close that tab. After that, every Reddit call runs Chrome in the background, off screen and without taking focus, and quits it when done.

## Requirements

Node.js 22 or newer, Google Chrome, a Reddit account and the GitHub CLI `gh`, logged in (`gh auth login`).

## Commands

Ask Claude, for example: "research how people use Claude Code hooks, only hn and github". The first Reddit search asks you to log in to Reddit in a Chrome window; log in there and close that tab.

## Environment variables

- `SEARCH_REDDIT_HOME`: keeps the Reddit login and `playwright-core` somewhere other than `~/.search-reddit`.
- `CHROME_PATH`: the Chrome binary, when it is not in its default place.
- `SEARCH_REDDIT_PORT`: the Chrome debugging port, when 9333 is taken. The port after it holds the lock that lets runs take turns on Chrome, so it must be free too.
- `EXO_SEARCH_DEADLINE_MS`: the time one call may run, 240000 by default and at most 290000.
- `EXO_SEARCH_FETCH_MS`: the time one fetch may take, 15000 by default.
- `EXO_SEARCH_URL_BUDGET_MS`: the total time one url may take across its routes and retries, 45000 by default.
- `EXO_SEARCH_LOCK_MS`: the time a run waits for the Chrome lock, 60000 by default.
- `EXO_SEARCH_CHROME_START_MS`: the time Chrome gets to answer after it starts, 10000 by default.
- `EXO_SEARCH_REDDIT_GAP_MS`: the pause between Reddit requests, 2000 by default.

## Warning

Reddit's User Agreement does not allow automated access without Reddit's permission. Reddit can suspend the account you use with this tool. Use it at your own risk and at a slow, personal pace.

`~/.search-reddit/profile` holds your Reddit login. Anyone who gets that folder can use your account, so never share it or commit it.

## Source

`skills/search/SKILL.md` and `scripts/search.mjs`.
