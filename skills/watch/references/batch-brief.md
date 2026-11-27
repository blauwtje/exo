# Batch brief

Write the `transcript.mjs` lines to a file and run the pack command in that step. It prints one batch per researcher with its `Reads:` lines.

1. Give one fresh `exo:researcher` each batch, all researchers in a single message. Launch at most `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (20 by default) at once.
2. Check each result for an `error` field and launch the refused ones after the first group ends.
3. Put these on their own lines in the brief: the question, the batch's `Reads:` lines and `Worktree: <abs path>`.
4. End the brief with: "write the notes to a file in the temp folder, one note per line: the stamp copied whole, then a few words quoted from the lines at that stamp in double quotes, then the point, and return `Result: <path>`".
5. Run the check command on every notes file (`--notes <file>` once per file), leave out the notes on its `drop: <file>:<line>` lines, tell the user how many were left out, merge the rest yourself from its `keep:` lines (the kept notes with their stamp links, copied whole) instead of from the raw notes files, keep each note's point under that note's own stamp and join no two notes under one stamp, and read no raw transcript.
