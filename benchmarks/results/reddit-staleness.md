# Reddit live vs archive staleness

Measured 2026-11-09 for thread `r/neovim/comments/1xcu7x5`.

| Route | Comments | Score sum | Newest comment | retrieved_on (newest) |
| --- | --- | --- | --- | --- |
| Arctic Shift archive | 30 | 152 | 2026-10-28T15:32:28Z | 2026-10-29T21:02:47Z |
| Live (shreddit comments endpoint plus one POST more-comments partial) | 35 | 316 | 2026-11-08T03:29:22Z | not applicable |

Live row measured 2026-11-09: the first page (25 comments) plus one POST more-comments partial (10 comments), not the whole tree, so its counts are a floor. The live newest comment is 2026-11-08, 11 days after the archive's newest (2026-10-28), and the archive holds 30 comments against 35 live.

## Live discovery probe (2026-11-09, descriptive exo User-Agent)

- `svc/shreddit/community-more-posts/new/?name=neovim`: HTTP 200, 24 `shreddit-post` elements, newest created 2026-11-09T09:10Z. It is the primary live discovery when a subreddit is given.
- `r/neovim/new.rss`: HTTP 200 with current entries; `search.rss` with `sort` and `t` returned an empty body on one probe, so the Arctic Shift post search (`sort=desc`, `after`, `subreddit`) is the last discovery fallback.
- `svc/shreddit/comments/r/all/t3_<id>`: HTTP 200, so a mirror `/posts/<id>/` id reads live without its subreddit.
- Thread HTML `www.reddit.com/r/neovim/comments/1xcu7x5/`: HTTP 200 for both the browser and the exo User-Agent, but the body is an 8 KB proof-of-work challenge page with no `shreddit-post` element, so post score and comment count are not readable there; the code does not fetch it; it reads comments from the shreddit comments endpoint and takes counts only from listing hits.
- `svc/shreddit/more-comments/...`: GET answers HTTP 200 with 0 comments; POST answers 200 with comments, so the follow uses POST.
