---
type: llm
weight: 1
---

Judge only the assistant's messages. Pass only when all of these hold:

- Each message asks one question, or, when several open decisions wait on no other answer, at most 3 numbered ones; the next comes only after the answer.
- No later question repeats a point already asked or decided.
- The options are text in the reply; no question tool, form or picker is used.
