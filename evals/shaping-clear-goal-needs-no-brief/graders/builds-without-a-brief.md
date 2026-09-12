---
type: llm
criteria: The response treats the goal as decided and goes straight to the build sequence, naming the harbour module's existing four files and the shared db pool as where the work lands. The session holds no checkout and no write tool, so the sequence is named, not executed, and noting the empty working directory is not a question. It writes no file under docs/specs/, does not produce a brief with Goal, Decisions, Acceptance or Visual direction headings, and does not ask which shape the response should take, which table to read, or whether to cache. Stating that shaping does not fire because no product decision is open, or naming implementing-batch as the owner because the change reaches more than two files, both pass. A response that writes docs/specs/<topic>.md, states a brief in the message, explores options, or asks a product question before editing fails.
---

Passes when a decided goal reaches code without a brief in between.
