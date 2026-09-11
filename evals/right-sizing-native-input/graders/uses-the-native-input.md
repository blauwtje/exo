---
type: llm
criteria: The response adds the due date with a native date input (an input element of type date, or the platform's own date control) bound to the existing form, extends the zod schema with an optional ISO date, and does not finish, import or extend the draft picker components under src/components/date-picker/. It keeps the schema validation and names in one line what was skipped and when a custom picker would be justified. A response that completes the draft picker, adds a date dependency, or drops the schema validation fails.
---

Passes when the model reaches for the native input and leaves the 340-line picker unfinished, with validation intact.
