# watch

Reads YouTube videos through their captions, so a 1-2 hour video costs a fraction of its length and the transcript never fills your session.

## When it runs

On request: share a YouTube link or id with a question, a summary request or an extraction request. The model starts it in your current session.

Not for other video sites, web pages, or questions about pictures alone.

## What you get

- Nothing to install: the script asks YouTube's player endpoint for the caption tracks and reads the chosen one with Node's own `fetch`. Title and duration come from the same answer, chapters from the watch page. A manual track wins over an automatic one, whatever its language; within a kind, the video's default audio language wins unless you name another.
- The raw captions and a clean transcript land in `.exo/watch/<id>/`: no timing tags, no rolling duplicate lines, a `[mm:ss]` stamp about every 45 seconds and a heading per chapter.
- A video longer than an hour also gets `chunks/NN.txt` files of about 30 minutes (`--chunk-minutes`), cut at chapter edges when the video has chapters; each file names the chapters it holds.
- The session sees one line per video: id, title, duration, caption source, words and a token estimate, never the transcript.
- A short video is read directly. A long video, or several, goes to one subagent per video or chunk file in parallel, at most 8 per message; each returns short stamped notes and the session merges them.
- No captions, or YouTube refuses the request → one `no transcript` line with the reason and exit 1. A language you named with no track → it lists the languages that exist instead.
- When YouTube refuses the request (a bot check, a proof-of-origin token, an empty file, rate limiting) and `yt-dlp` is already on your PATH, the script reads the captions through it. Without `yt-dlp` it asks for nothing and installs nothing. `EXO_WATCH_FETCH_MS` sets the wait per request (default 30 s), `EXO_WATCH_YTDLP_MS` the wait per `yt-dlp` call (default 120 s).
- `--lang` picks a caption track YouTube lists for the video; it offers no machine-translated captions, so a language with no track gets the list of languages that exist.
- What is on screen (slides, code, diagrams) is not read; the answer comes from the spoken words.

## Source

`skills/watch/SKILL.md` and `scripts/transcript.mjs`.
