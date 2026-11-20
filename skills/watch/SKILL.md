---
name: watch
description: "Fetches captions (or a speech transcript) of a video and answers from them. Use when a video url (YouTube, TikTok, Instagram, Facebook, X or another site yt-dlp reads) or a YouTube id must be answered from, summarised or mined. Not for web pages."
argument-hint: "video, profile, channel or playlist url [more urls] [question]"
model: sonnet
effort: medium
---

# Watch a video

Answer from a video's transcript on disk, with `[mm:ss]` stamps, without pasting the whole transcript into the context.

## A profile, channel or playlist url

Run `node "${CLAUDE_SKILL_DIR}/scripts/list.mjs" --url <url> [--limit <n>]`. It lists 20 videos by default (url, title, date, duration, views) and downloads nothing. Pick the videos the question needs, or the newest few, and feed them to the loop with `--from <file>` or `--from -`. On exit 1, a `missing tool` line follows step 2; any other line says why nothing was listed, so relay it.

## The loop

1. **Run** `node "${CLAUDE_SKILL_DIR}/scripts/transcript.mjs" --url <url> [--url <url> ...]`, or `--from <file>` for a `list.mjs` output. It prints one line per video and writes the transcript under `<id>/` of the folder `node "${CLAUDE_PLUGIN_ROOT}/lib/scratch-path.mjs" watch` prints.
   - Pass all videos in one call, in the background when there are two or more. It runs them one by one and skips finished ones (`--force` redoes them), so use no parallel agents or Bash calls.
   - Add `--lang <code>` or `--model <whisper model>` only when the user names one.
2. When a line says `missing tool` for yt-dlp, relay its install command and ask before installing anything. Relay any other failure line as printed.
3. Exit 75 means a rate limit (HTTP 429) stopped the batch: report the open videos and the restart command from the last line. Exit 1 means every video failed.
   - `no transcript`: tell the user why, as the line says, and offer no other route.
   - `available:` lists languages: ask which, then rerun with `--lang`.
   - `rate-limited, retry later`: rerun only that url later.
4. Say slides, code and diagrams are not in the transcript.
5. When one video's `tokens` fit your context, read its `transcript` and answer. When you cannot dispatch a helper, read a longer transcript in ranges.
6. Otherwise give each video, or each file under its `chunks=` folder, to one fresh `exo:researcher` in a single message. The brief holds the question, `Reads: <file path>` and `Worktree: <abs path>` on their own lines, and "return at most 15 lines of notes, each opening with its `[mm:ss]` stamp, plus a one-line gist". Merge the notes yourself and read no raw transcript.
7. Cite every claim with its stamp copied whole. On YouTube and Vimeo a stamp is a link, `[mm:ss](url)`, so keep the link. Other sources stay `[mm:ss]` with the video id.

## Judgment

- Say when the source was `auto` or `speech:`, because names and numbers may be misheard.
- A `Name (guessed):` line appears only when the captions carry speaker turns; quote it as a guess. With no such lines, infer no speaker from the words.
