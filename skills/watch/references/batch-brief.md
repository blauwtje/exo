# Batch brief

Write the `transcript.mjs` lines to a file and run the pack command in that step. It prints one batch per researcher with its `Reads:` lines.

1. Give one fresh `exo:researcher` each batch, all researchers in a single message. Launch at most `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (20 by default) at once.
2. Check each result for an `error` field and launch the refused ones after the first group ends.
3. Put these on their own lines in the brief: the question, the batch's `Reads:` lines and `Worktree: <abs path>`.
4. End the brief with: "write the notes to a file in the temp folder, each note opening with its `[mm:ss]` stamp, plus a one-line gist, and return `Result: <path>`".
5. Merge the notes files yourself and read no raw transcript.
