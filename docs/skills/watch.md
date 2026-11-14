# watch

Reads videos from YouTube, TikTok, Instagram, Facebook, X and other sites yt-dlp supports through their captions or a local transcript, so a 1-2 hour video costs a fraction of its length and the transcript never fills your session.

## When it runs

On request: share a video link or YouTube id with a question, a summary request or an extraction request. The model starts it in your current session.

Not for web pages, or questions about pictures alone.

## What you get

- YouTube needs nothing installed: the script asks YouTube's player endpoint for the caption tracks and reads the chosen one with Node's own `fetch`. Title and duration come from the same answer, chapters from the watch page. A manual track wins over an automatic one, whatever its language; within a kind, the video's default audio language wins unless you name another.
- The raw captions and a clean transcript land in `.exo/watch/<id>/`: no timing tags, no rolling duplicate lines, a `[mm:ss]` stamp about every 45 seconds and a heading per chapter.
- A video longer than an hour also gets `chunks/NN.txt` files of about 30 minutes (`--chunk-minutes`), cut at chapter edges when the video has chapters; each file names the chapters it holds.
- On YouTube and Vimeo each `[mm:ss]` stamp in the transcript and the chunk files is a link that opens the video at that second (`https://www.youtube.com/watch?v=<id>&t=<s>s`), and every claim in an answer cites one. A site with no time link keeps the plain stamp.
- Speaker names appear, marked `(guessed)`, only when the captions already carry speaker turns (WebVTT `<v Name>` tags or `[SPEAKER_00]:` prefixes). Otherwise you get none; a diarization model is a separate download that the skill suggests but never fetches unasked.
- A batch of two or more videos also writes `transcripts.txt` in the output folder, one `# <id>` header per video without chunks, and ends with a `merged transcripts` line; short videos are read from that one file.
- The session sees one line per video: id, title, duration, caption source, words and a token estimate, never the transcript.
- A short video is read directly. A long video, or several, goes to one subagent per video or chunk file in parallel, at most 8 per message; each returns short stamped notes and the session merges them.
- Any other site goes to `yt-dlp`, with ids like `tiktok-<id>`. A video with no captions, YouTube included, is transcribed locally: `yt-dlp` fetches the audio, `ffmpeg` converts it, and `whisper-cli` (with `--model` naming a ggml file) or `whisper` writes the text, marked `speech:<engine>` and possibly mishearing names and numbers. `EXO_WATCH_TRANSCRIBE_MS` sets that wait (default 30 min). The script installs nothing: a missing tool gives a `missing tool` line with its install command, and the skill asks you first.
- YouTube refusing the request with no way to read it → one `no transcript` line with the reason and exit 1. A language you named with no track → it lists the languages that exist instead.
- When YouTube refuses the request (a bot check, a proof-of-origin token, an empty file, rate limiting) and `yt-dlp` is already on your PATH, the script reads the captions through it. Without `yt-dlp` it asks for nothing and installs nothing. `EXO_WATCH_FETCH_MS` sets the wait per request (default 30 s), `EXO_WATCH_YTDLP_MS` the wait per `yt-dlp` call (default 120 s).
- `--lang` picks a caption track YouTube lists for the video; it offers no machine-translated captions, so a language with no track gets the list of languages that exist.
- What is on screen (slides, code, diagrams) is not read; the answer comes from the spoken words.

## Source

`skills/watch/SKILL.md` and `scripts/transcript.mjs`.
