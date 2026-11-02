---
name: watch
description: Use when a YouTube URL or video id must be answered from, summarised or mined. Not for other video sites, web pages, or a video's pictures alone.
argument-hint: "<youtube url> [more urls] [question]"
---

# Watch a video

Read a video through its captions on disk, not through the context window. Produce an answer, summary or extraction with `[mm:ss]` stamps from a transcript the model never pasted whole. Avoid fetching video or audio, printing a transcript into the session, and installing anything.

## When to use

- A YouTube link or id comes with a question, a summary request or an extraction request.
- Several videos to compare or merge.
- Not for a page or non-YouTube site: the web tools own it.

## The loop

1. **Run** `node "${CLAUDE_SKILL_DIR}/scripts/transcript.mjs" --url <url> [--url <url> ...]`, one `--url` per video; add `--lang <code>` only when the user names a language; it picks a listed track, never a machine translation. It prints one line per video and writes the transcript under `.exo/watch/<id>/`.
2. Exit 1 with `no transcript` → tell the user that video has no transcript and why, as the line says; offer no other route for it.
   - Exit 1 with `available:` → ask which language, rerun with `--lang`.
3. Line shows `tokens` under 10000 and one video → read `transcript` yourself and answer.
4. Else give each video, or each file under its `chunks=` folder, to one `general-purpose` delegate whose prompt opens with `exo-kind: lookup`.
   - Start them all in one message, at most 8 per message; more files → the next message after the first returns.
   - Brief after the label: the user's question, the file path, and "return at most 15 lines of notes, each opening with its `[mm:ss]` stamp, plus a one-line gist".
   - Merge the notes yourself; read no raw transcript.
5. Cite the stamps in the answer, as `[mm:ss]` or `[h:mm:ss]` with the video id.

## Judgment

- Say when the source was `auto`: names and numbers may be misheard.
- What is on screen (slides, code, diagrams) is not in a transcript: say so, answer from the words.
