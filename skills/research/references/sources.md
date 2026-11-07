# Source routes

All keyless. Each search prints one JSON line per hit, or `status: blocked <source> <reason>`; a blocked route becomes a coverage gap.

| Need | Route |
|---|---|
| Web pages | web search, then `node "${CLAUDE_SKILL_DIR}/scripts/fetch.mjs" <run-dir> <url>...` |
| Hacker News, Stack Overflow, Wikipedia, arXiv, podcasts | `node "${CLAUDE_SKILL_DIR}/scripts/search.mjs" --source hn\|stackoverflow\|wikipedia\|arxiv\|podcast --query <text> --run <run-dir> [--limit <n>]` |
| GitHub | `--source github`: uses `gh search` when `gh auth status` passes, else the unauthenticated REST search; a rate limit is a gap |
| Reddit | `--source reddit`; when blocked, web search limited to `site:reddit.com` |
| YouTube topic search | `node "${CLAUDE_SKILL_DIR}/../watch/scripts/search.mjs" --query <text>` |
| Video or short transcripts (YouTube, TikTok, Instagram, X) | find the URL by site-limited web search, then the `watch` skill's `transcript.mjs`; save the transcript text with `fetch.mjs --save <run-dir> <url>` (text on stdin) so the quote check sees it |

## Rules

- Start with short, broad queries, then narrow. Send independent searches in one turn.
- An arXiv hit is cited from its abstract page. PDF and script-rendered pages are not parsed; an empty fetch is `blocked` and a gap.
- Forum, social and video sources are leads. A video yields at most 5 claims, each rewritten as a self-contained query before evidence search.
- Tag each claim `volatile`, `semi-stable` or `evergreen` against today's date.
- Source kinds for `claims.mjs`: web, paper, code, forum, social, video, podcast.
- A fetch that prints `status: blocked <reason>` (challenge, age-gate, not-public, empty) left no page: the research output names that page per URL and asks the user to open it in their own browser and paste or save the text with `fetch.mjs --save`. Do not retry it, and do not fetch pages behind a login.
