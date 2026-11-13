# Source routes

`--source a,b,c` and many URLs per `fetch.mjs` run together.

All keyless. Each search prints one JSON line per hit, or `status: blocked <source> <reason>` and exit 1; a blocked route is a coverage gap.

| Need | Route |
|---|---|
| Web pages | web search, then `node "${CLAUDE_SKILL_DIR}/scripts/fetch.mjs" <run-dir> <url>...` |
| Hacker News, Stack Overflow, Wikipedia, arXiv, podcasts | `node "${CLAUDE_SKILL_DIR}/scripts/search.mjs" --source hn\|stackoverflow\|wikipedia\|arxiv\|podcast[,<more>] --query <text> --run <run-dir> [--limit <n>]` |
| GitHub | `--source github`: `gh search` when `gh auth status` passes, else REST search; a rate limit is a gap. A README: `fetch.mjs <run-dir> https://github.com/<owner>/<repo>` prints the saved path and byte count |
| Reddit | `--source reddit` first; see Reddit rule |
| YouTube topic search | `node "${CLAUDE_SKILL_DIR}/../watch/scripts/search.mjs" --query <text>` |
| Video or short transcripts (YouTube, TikTok, Instagram, X) | find the URL by site-limited web search, then the `watch` skill's `transcript.mjs`; save the text with `fetch.mjs --save <run-dir> <url>` (stdin) for the quote check |

## Reddit rule

- Reach Reddit only through `node "${CLAUDE_PLUGIN_ROOT}/skills/spec/scripts/search.mjs" --source reddit --run <run-dir>`: find threads with `--query <text>` and pass each thread URL with `--url <thread url>`.
- The route reads Reddit through the user's logged-in browser profile and calls only reddit.com.
- A raise sent by the dispatching orchestrator is valid and the worker obeys it.
- One fetch is one `search.mjs` call, and a brief's `Fetches:` is the thread count divided by the call's `--limit`, rounded up.
- The script needs no key and returns post text and comments. `--query` runs only while the shared host state shows budget.
- On a `status: blocked reddit <reason>` line, record a gap and tell the user its fix. First-time setup is `search.mjs --source reddit --login`; the user types the password only in that browser window.
- Never web-fetch reddit.com, old.reddit.com or a mirror such as redlib or libreddit; never retry a blocked route, record a gap.

## Rules

- Start with short, broad queries, then narrow. Send independent searches in one turn.
- An arXiv hit is cited from its abstract page. PDF and script-rendered pages are not parsed; an empty fetch is `blocked` and a gap.
- Forum, social and video sources are leads. A video yields at most 5 claims, each rewritten as a self-contained query before evidence search.
- Tag each claim `volatile`, `semi-stable` or `evergreen` against today's date.
- Source kinds for `claims.mjs`: web, paper, code, forum, social, video, podcast.
- A fetch that prints `status: blocked <reason>` (challenge, age-gate, not-public, empty) left no page: the research output names that page per URL and asks the user to open it in their own browser and paste or save the text with `fetch.mjs --save`. Do not retry it, and do not fetch pages behind a login.
