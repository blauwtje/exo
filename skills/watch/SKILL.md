---
name: watch
description: Use when a video url (YouTube, TikTok, Instagram, Facebook, X or another site yt-dlp reads) or a YouTube id must be answered from, summarised or mined. Not for web pages or a video's pictures alone.
argument-hint: "<video url> [more urls] [question]"
---

# Watch a video

Read a video through its captions, or a local transcript of its audio, on disk, not through the context window. Produce an answer, summary or extraction with `[mm:ss]` stamps from a transcript the model never pasted whole. Avoid fetching audio unless a video has no captions, printing a transcript into the session, and installing anything.

## When to use

- A video link or YouTube id comes with a question, a summary request or an extraction request.
- Several videos to compare or merge.
- Not for a web page: the web tools own it.

## The loop

1. **Run** `node "${CLAUDE_SKILL_DIR}/scripts/transcript.mjs" --url <url> [--url <url> ...]`, one `--url` per video. It prints one line per video and writes the transcript under `.exo/watch/<id>/`.
   - Add `--lang <code>` only when the user names a language, because it picks a listed track, not a machine translation, and names the spoken language on the speech route.
   - Add `--model <ggml file>` for whisper.cpp on a video with no captions.
2. When exit 1 says `missing tool` and gives an install command, relay the command and ask the user before installing anything.
3. When exit 1 says `no transcript`, tell the user that video has no transcript and why, as the line says; offer no other route for it.
   - When exit 1 lists `available:`, ask which language and rerun with `--lang`.
4. When the line shows `tokens` under 10000 and one video, read `transcript` yourself and answer.
5. Else give each video, or each file under its `chunks=` folder, to one `general-purpose` delegate whose prompt opens with `exo-kind: lookup`.
   - Start them all in one message, at most 8 per message; more files → the next message after the first returns.
   - Brief after the label: the user's question, `Reads: <file path>` and `Worktree: <abs path>` on lines of their own, and "return at most 15 lines of notes, each opening with its `[mm:ss]` stamp, plus a one-line gist".
   - Merge the notes yourself; read no raw transcript.
6. Cite the stamps in the answer, as `[mm:ss]` or `[h:mm:ss]` with the video id.

## Judgment

- Say when the source was `auto` or `speech:`: names and numbers may be misheard.
- What is on screen (slides, code, diagrams) is not in a transcript: say so, answer from the words.
