# search

Searches GitHub, Reddit, Hacker News and the web at the same time and returns one answer with links and word-for-word quotes. The Reddit part uses your own Reddit login in a Chrome window, so it needs no Reddit API key and no paid service.

Claude's WebFetch and WebSearch cannot reach reddit.com, and Reddit blocks logged-out and headless requests.

## When it runs

On request: type `/exo:search` with your question. Claude does not start it by itself. Add `--only` with a comma-separated list of `github`, `reddit`, `hn` and `web` to search only some sources, for example `hooks tips --only reddit,github`.

Not for this repo's code, a video url (`exo:watch`) or ideas (`exo:ideas`).

## What you get

- One JSON plan (question, sources, sub-questions with search terms, subreddits, topics, days) runs `skills/search/scripts/search.mjs`. When the question asks for a number of sources, the plan carries `reads`: each call reads a part, saves the run and ends with a `Continue:` command that runs `search.mjs --continue <run file>` until `reads` sources are read or the candidates run out.
- The script searches every chosen source at the same time, lets a small model choose which hits to read, reads them and prints one evidence bundle of original text. Each call saves its bundle to a file, which the bundle names on its `Bundle:` line after a `Report:` block of every miss, dropped search and timeout.
- The session answers from the bundle, reruns once for any sub-question the bundle lists as `Uncovered`, and runs `verify.mjs` on its answer so each quote and link must appear in a saved bundle.
- The first Reddit search installs `playwright-core` (about 14 MB, no browser download) into `~/.search-reddit`. If you are not logged in, Claude opens a Chrome window: log in to Reddit there and close that tab. After that, every Reddit call runs Chrome in the background, off screen and without taking focus, and quits it when done.

## Requirements

Node.js 22 or newer, Google Chrome, a Reddit account and the GitHub CLI `gh`, logged in (`gh auth login`).

## Commands

Ask Claude, for example: "search for how people use Claude Code hooks, only hn and github". The first Reddit search asks you to log in to Reddit in a Chrome window; log in there and close that tab.

## Environment variables

- `SEARCH_REDDIT_HOME`: keeps the Reddit login and `playwright-core` somewhere other than `~/.search-reddit`.
- `CHROME_PATH`: the Chrome binary, when it is not in its default place.
- `SEARCH_REDDIT_PORT`: the Chrome debugging port, when 9333 is taken. The port after it holds the lock that lets runs take turns on Chrome, so it must be free too.
- `EXO_SEARCH_DEADLINE_MS`: the time one call may run, 240000 by default and at most 290000.
- `EXO_SEARCH_FETCH_MS`: the time one fetch may take, 15000 by default.
- `EXO_SEARCH_LOCK_MS`: the time a run waits for the Chrome lock, 60000 by default.
- `EXO_SEARCH_CHROME_START_MS`: the time Chrome gets to answer after it starts, 10000 by default.
- `EXO_SEARCH_REDDIT_GAP_MS`: the pause between Reddit requests, 2000 by default.

## Warning

Reddit's User Agreement does not allow automated access without Reddit's permission. Reddit can suspend the account you use with this tool. Use it at your own risk and at a slow, personal pace.

`~/.search-reddit/profile` holds your Reddit login. Anyone who gets that folder can use your account, so never share it or commit it.

## Source

`skills/search/SKILL.md` and `scripts/search.mjs`.
