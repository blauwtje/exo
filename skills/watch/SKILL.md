---
name: watch
description: "Answers from a video's captions or speech transcript, citing the moment of each fact. Use when the user gives a video url or YouTube id to summarise, question or mine. Not for web pages."
argument-hint: "video, profile, channel or playlist url [more urls] [question]"
model: sonnet
effort: medium
---

# Watch

**Answer from the transcript, and cite the moment.** The user checks a claim by jumping to that second of the video, so every claim gets the stamp of the line where it is said, one fact per stamp. Read the transcript from disk in parts: pasted whole, it crowds out the answer.

Read `${CLAUDE_PLUGIN_ROOT}/BASE.md` first.

## Get the transcript

Put every url in single quotes, because zsh reads `?` as a glob.

1. **A profile, channel or playlist:** list it with `yt-dlp --flat-playlist --playlist-end 20 --print '%(webpage_url)s\t%(title)s\t%(upload_date)s\t%(duration_string)s\t%(view_count)s' '<url>'`, and pick the videos the question needs, by date when the user wants recent ones.
2. **Captions:** make `<scratch>/watch/<id>/` per video and fetch captions in the user's language, else English: `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs '<code>' --sub-format vtt -o '<folder>/%(id)s' '<url>'`. Prefer manual captions over auto ones. Skip a video already fetched there.
3. **No captions:** transcribe the speech. Run `yt-dlp -x --audio-format wav -o '<folder>/audio.%(ext)s' '<url>'`, then `whisper-cli -m "$EXO_WHISPER_MODEL" -f '<folder>/audio.wav' -ovtt` when `EXO_WHISPER_MODEL` names a ggml model file, else `whisper '<folder>/audio.wav' --output_format vtt`. Use a model the user names instead. When yt-dlp, ffmpeg or whisper is missing, give the install command and ask before installing: an install changes the user's machine.

## Answer

Read each vtt file in parts of about 300 lines, one Read per part, then answer. Cite as `[mm:ss](<url>&t=<seconds>)` on YouTube and Vimeo, else as `[mm:ss]` with the video id.

```markdown
Good: The cache is cleared on every deploy [12:04](https://www.youtube.com/watch?v=abc123&t=724).
Bad: The talk covers caching and deploys.
```

Say what the transcript cannot hold:

- Auto captions and speech transcripts mishear names and numbers, so say which one you used.
- Slides, code and diagrams are not in the transcript.
- Name a speaker only when the captions mark speaker turns, and mark the name as a guess.

## When stuck

| Situation | Do |
|---|---|
| HTTP 429 | Stop fetching at once. Answer from what you have and name the videos left open. Do not sleep, loop or retry. |
| No captions and no speech engine | Say why and stop. Offer no other route. |
| The question needs what is on screen | Say that the transcript cannot show it. |
