# Step rules and report shape

## Step 3, ask rules

This page holds the recommendation and `Land:` rules of step 3 in `spec`, so each question carries a recommendation and the mode is asked only when open.

   - Recommend a loaded skill's pattern over one it rules out; when two loaded skills disagree, take the one the request names.
   - Plan approval approves only the `Land:` mode, so ask about it only when `ship` is `ask`.
   - With no git repo or no `origin`, write `Land: local` and ask nothing.

## Step 4, locate and fetch

This page holds the dispatch rules of step 4 in `spec`, so ranges the map omits and outside facts are found in one background round.

   - In one background message dispatch up to four `exo:research-worker` agents (`Sources: repo`) for ranges the map omits and one `exo:research-worker` round (`Sources: docs`) for outside facts. Read none of their output, fill no gap; use results on each completion, no polling or sleep.
   - Search the map with `grep -n`; never read it.

## Step 1, modes

Open the mode file, then follow it in place of steps 2 to 5.

| Mode | Read it when |
|---|---|
| Mode `research` | Request asks for a researched, cited answer from many sources (mode `research`). |
| Mode `ideate` | Request is a design question wanting grounded, novelty-checked ideas (mode `ideate`). |

## Mode research, report shape

Save the report as answer.md in the run folder:

1. **Answer**: 3-8 sentences, each carrying `[^id]` footnotes that match stored claim ids.
2. **Key claims**: one line each with the label (supported, unsupported, contradicted), the source count, and engagement in its own column when a social or video source is cited.
3. **Coverage gaps**: blocked routes, rate limits, empty fetches, unanswered sub-questions.
4. Footnote lines `[^id]: <url>` last.

Write a long report only when the user asks. Date a claim in its sentence when its time class is volatile.
