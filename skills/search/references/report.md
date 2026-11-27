# The research report

`docs/research/<topic>.md`, in the user's language, with these parts in order:

- **Title:** the question.
- **Earlier:** a line naming the files in `docs/research` or `docs/specs` the report builds on, or `none`.
- **Answer:** the short answer, in a few sentences.
- **Findings,** grouped by theme. Each finding is a claim, its link on its own line, and its quote as a `>` line.
- **Disagreements:** where sources contradict each other.
- **Confidence:** high, medium or low, with the reason.
- **Gaps:** every `Failed:` line, and each open point.
- **Sources:** a table of links.
- **Run:** one closing line with the size, the researcher count and the minutes.

A finding:

```markdown
Only one connection can write to the database at a time.
https://example.com/docs/locking
> only one connection can hold the write lock at any moment
```
