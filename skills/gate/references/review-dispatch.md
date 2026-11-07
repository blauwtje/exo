# Review dispatch details

This page holds the questions and merge run of step 2 in `gate`, so the review gets its questions and its findings file.

   - Add 3-5 questions from Goal and each task's `Data:`, `Risk:` and Acceptance. When `OVERLAP` is not `none`, add `DISPATCH Overlap`.
   - Run `node "${CLAUDE_SKILL_DIR}/scripts/merge-reviews.mjs" --root <checkout> --base <base> --report <each report path>`, each `CODE-RULES` path included. Its first line is step 3's verdict, `FINDING` lines the `question`, `note` and `report` findings only, `UNREAD-FILE` unread files.
