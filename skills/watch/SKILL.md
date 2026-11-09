---
name: watch
description: Use when a video url (YouTube, TikTok, Instagram, Facebook, X or another site yt-dlp reads) or a YouTube id must be answered from, summarised or mined. Not for web pages or a video's pictures alone.
context: fork
agent: exo:orchestrator
argument-hint: "<video, profile, channel or playlist url> [more urls] [question]"
---

# Watch a video

Read a video through its captions, or a local transcript of its audio, on disk, not through the context window. Produce an answer, summary or extraction with `[mm:ss]` stamps from a transcript the model never pasted whole. Avoid fetching audio unless a video has no captions, printing a transcript into the session, and installing anything by hand.

## When to use

- A video link or YouTube id comes with a question, a summary request or an extraction request.
- Several videos to compare or merge.
- Not for a web page: the web tools own it.

## A profile, channel or playlist url

Given a TikTok, YouTube, Instagram or X profile, a YouTube channel or a playlist url, never refuse it as "no listing mode".

1. **Run** `node "${CLAUDE_SKILL_DIR}/scripts/list.mjs" --url <url> [--limit <n>]`. It prints one line per video (url, title, date, duration, views, each when known) and a summary line, downloads nothing, and lists 20 by default.
2. Pick the videos the question needs from the titles and dates, or the newest few when it names none.
3. Run the loop below once for all picked videos in one batch call: `--from` with the `list.mjs` output saved to a file, or `--from -` on stdin, or many `--url`.
4. On exit 1, `missing tool` follows the loop's `missing tool` rule; any other line says why nothing was listed, so relay it.

## The loop

1. **Run** `node "${CLAUDE_SKILL_DIR}/scripts/transcript.mjs" --url <url> [--url <url> ...]` with every video in this one call, or `--from <file>` or `--from -` for the `list.mjs` output. It prints one line per video and writes the transcript under `.exo/watch/<id>/`.
   - Pass all videos in one batch call, which runs them one by one and skips the finished ones (`--force` redoes them); do not spread watch over parallel agents or parallel Bash calls.
   - For a list too long for one call, run it through `lib/map.mjs` `mapItems` with a spend cap.
   - Add `--lang <code>` only when the user names a language, because it picks a listed track, not a machine translation, and names the spoken language on the speech route.
   - Add `--model <ggml file>` only when the user names a whisper model.
2. The script reads captions itself, runs yt-dlp only when it is already on PATH and does not download it, and transcribes a video with no captions by speech through yt-dlp, fetching whisper.node, a ggml model and a decoder itself. When a line says `missing tool` for yt-dlp, relay its install command and ask the user before installing anything; relay any other failure line as it is.
3. Exit 1 means every video failed; a partly failed batch exits 0 and ends `batch done=N skipped=N failed=N | <failure> (<ids>)`.
   - When a line says `no transcript`, tell the user that video has no transcript and why, as the line says; offer no other route for it.
   - When a line lists `available:`, ask which language and rerun with `--lang`.
   - When the line ends `rate-limited, retry later`, wait a few minutes and rerun only that url; `private/removed` needs no rerun.
4. When the line shows `frames=<dir> (6 files)`, read those images, or pass the folder to the lookup delegates, for what is on screen.
5. When the line shows `tokens` under 10000 and one video, read `transcript` yourself and answer.
   - When you cannot dispatch a delegate, read a longer transcript yourself in ranges to its end; do not return BLOCKED for that.
6. Else give each video, or each file under its `chunks=` folder, to one `general-purpose` delegate whose prompt opens with `exo-kind: lookup`.
   - Start them all in one message, at most 8 per message; more files → the next message after the first returns.
   - Brief after the label: the user's question, `Reads: <file path>` and `Worktree: <abs path>` on lines of their own, and "return at most 15 lines of notes, each opening with its `[mm:ss]` stamp, plus a one-line gist".
   - Merge the notes yourself; read no raw transcript.
7. Cite every claim with its stamp, copied whole from the file: on YouTube and Vimeo a stamp is a link, `[mm:ss](url)`, that opens at that moment, so keep the link and the notes' stamps intact. A stamp with no link (TikTok, X, a local file) stays as `[mm:ss]` or `[h:mm:ss]` with the video id.

## Speakers

- A line `Name (guessed):` appears only when the captions carry speaker turns (WebVTT `<v Name>` tags or `[SPEAKER_00]:` prefixes). Quote it as a guess, not a fact.
- A transcript with no such lines has no speaker data: say so, and infer no speaker from the words.
- Diarization is opt-in. When the user asks who said what, tell them it needs a separate speaker model download (such as `whisperx --diarize`) and run it only after they agree; the skill downloads none by default.

## Judgment

- Say when the source was `auto` or `speech:`: names and numbers may be misheard.
- What is on screen (slides, code, diagrams) comes only from `frames=` images; without them say it is not in the transcript and answer from the words.
