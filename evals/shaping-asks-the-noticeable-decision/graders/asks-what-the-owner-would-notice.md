---
type: llm
criteria: The message to the product owner asks about one decision in this turn and waits for the answer; saying that a few more questions may follow, or offering to skip the rest, is expected and is not a second question. That decision is one a harbour master would notice in the finished result, such as what they receive, which alerts it covers, or where they start it. It is not a routine choice such as a file name, a module location, a library already in the manifest, or an internal structure; those are decided without asking. No brief is stored and nothing is written under docs/specs/ before the answer arrives.
---

Passes when the session asks what the owner would notice and decides the rest itself. A response that writes the whole brief on assumptions fails, and so does one that lists several questions at once.
