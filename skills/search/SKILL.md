---
name: search
description: "Writes a cited research report from pages read in the run. Use when the user says 'search for', 'research X' or 'find sources on' a question. Not for this repo's code or a video url."
argument-hint: "question"
---

# Search

**No claim without a quote from a page you read in this run.** A claim without its source cannot be checked, and your memory of a page is not the page. Your job is to split the question, send researchers out, keep their raw pages out of your context, and write a report in which every claim carries a link and a word-for-word quote.

## Look first

Search `docs/research` and `docs/specs` with `rg` for the topic and read each match. When one answers the whole question and the user did not ask for a fresh run, reply with its answer, path and date, and stop. Otherwise ask only what those files leave open.

## Size the run

| Question | Size | Researchers |
|---|---|---|
| One fact | quick | 1 |
| A comparison of a few named things | standard | 4 to 5 |
| An open question | deep | 8 to 15 |

The user's words override this table. Write one sub-question per researcher, each from a different angle: novice and expert, user and maintainer, critic and fan, past and present.

## Send the researchers

Send one fresh `exo:researcher` per sub-question, all in one message. Give each `Sources: web`, its sub-question, the sources the user named (only those, when the user said only), a budget of 15 tool calls and a result file `<scratch>/search-<topic>-q<n>.md`. It searches with WebSearch, `gh search` or a site's search API (Hacker News Algolia, Stack Exchange, Wikipedia, arXiv), fetches each page it cites, and writes per finding the claim, the link and a word-for-word quote, plus `Failed: <url> <reason>` for each page it could not read.

Read only the result files; the raw pages stay with the researchers. For a sub-question with no usable finding, or the first sub-question when the question asks for a list, send one more researcher by a different route, such as an index or the first-party docs.

## Write the report

Write `docs/research/<topic>.md` in the user's language, in the layout of [references/report.md](references/report.md). A finding with one source, or with only secondary sources, is at most medium confidence, because one page can be wrong or out of date.

## Check the quotes

Send one fresh `exo:researcher` with `Sources: web` and the report path. It fetches each cited link again and lists each quote missing from its page and each claim its quote does not support. Fix or drop each listed claim once.

Reply with the short answer and the report path:

```text
Most teams cache build output per branch; two of five sources warn that a shared cache can leak secrets (high confidence).
Report: docs/research/build-cache.md
```

Next: `exo:spec`, when the answer feeds a change.
