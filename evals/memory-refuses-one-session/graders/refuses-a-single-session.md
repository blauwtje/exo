---
type: llm
criteria: 'The correction is booked as a candidate and nothing is written into the project memory, because this is the first session to attest it. The answer says the claim now stands at one session of the two it needs, and that a second session has to attest it before it can be written. It does not claim the memory file now holds the billing-team review fact, it does not edit `memory.md` or `memory.json` by hand, and it does not write the fact into `AGENTS.md` or `CLAUDE.md` instead. Saying that the user can approve it once a second session attests it does not fail this.'
---

Passes when one session books and writes nothing.
