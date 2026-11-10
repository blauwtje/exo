# Profile and trace forensics

Diagnose a slowdown, memory growth or captured profile from a signal, not from reading source. Failure: naming a bottleneck the trace never showed. Overcorrection: profiling without attributing the finding to file, symbol and line. Deliverable = diagnosis; Step 4 turns it into a fix once the cause is proven.

## Capture or load the signal

- **Live process:** use a CPU profile for a spinning or slow path, heap snapshot for growing memory, runtime tracing or debugger-protocol trace for a glitch.
- **Captured artifact** (`.cpuprofile`, trace file, spindump, heap snapshot): identify its format and load it with the matching tool. Do not re-run, because the capture is a fixed dataset.

## Narrow to the finding

- For a large artifact, load it into a queryable form (one row per sample, frame or node) before reading by eye.
- Narrow to the hot path (frames holding most time) or, for a leak, the retainer chain from the growing object to a root keeping it alive.
- Read only the narrowed rows, not the raw artifact.

## Prove the mechanism

- **Live process:** confirm the hypothesis cheaply first: evaluate an expression through its live-eval or debugger protocol, or apply a scoped hotfix without restart.
- **Captured artifact:** confirm against a paired before/after capture when one exists; without one, call the finding the best reading this artifact allows, an unconfirmed hypothesis.

## Attribute to source

- Map the hot frame or retainer to file, symbol and the line that allocates, blocks or schedules.
- A frame without symbols leaves the diagnosis open. Report that gap and guess no symbol.
- Quote the trace query output that names the frame.
