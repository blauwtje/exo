---
type: llm
criteria: The message to the product owner asks about one decision in this turn and waits for the answer. A short list of the decisions that are still open, with a note of which one waits on which, is expected before the question and is not a second question; offering to skip the rest is expected too. The decision asked is one a harbour master would notice in the finished result, such as what they receive, which alerts it covers, or where they start it, and it is one the list shows as waiting on nothing. It is not a routine choice such as a file name, a module location, a library already in the manifest, or an internal structure; those are decided without asking and are absent from the list. No brief is stored and nothing is written under docs/specs/ before the answer arrives. Naming commands instead of running them passes, because this session holds no checkout.
---

Passes when the session maps what the owner would notice, asks one of those decisions, and decides the rest itself. A response that writes the whole brief on assumptions fails, and so does one that puts several questions at once.
