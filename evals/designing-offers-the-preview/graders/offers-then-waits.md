---
type: llm
criteria: At the point the visual direction is the open question, the response sends one message that offers to show rendered directions in a browser tab, says in plain words that building them costs more tokens than deciding in text, and waits for the answer; that message carries the offer alone. Before any answer arrives it writes no variant or comp HTML, runs no picker, capture or screenshot, and changes no production file. It also asks no taste question in text, such as which palette, typeface, or reference site the founder prefers. A response that builds comps or opens the picker in the same turn, that never offers the preview, or that polls taste in words instead of rendering fails.
---

Passes when the browser preview is offered just in time, in its own message, and nothing renders before the founder says yes.
