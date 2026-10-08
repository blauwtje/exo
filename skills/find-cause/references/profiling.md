# Profile and trace forensics

Diagnose a slowdown, memory growth or captured profile from a signal, not from reading source. Failure: naming a bottleneck the trace never showed. Overcorrection: profiling without attributing the finding to file, symbol and line. Deliverable = diagnosis; Step 4 turns it into a fix once the cause is proven.

## Capture or load the signal

- **Live process** → CPU profile for a spinning or slow path, heap snapshot for growing memory, runtime tracing or debugger-protocol trace for a glitch.
- **Captured artifact** (`.cpuprofile`, trace file, spindump, heap snapshot) → identify its format, load it with the matching tool; no re-run, the capture is a fixed dataset.

## Narrow to the finding

- Large artifact → load into a queryable form (one row per sample, frame or node) before reading by eye.
- Narrow to the hot path (frames holding most time) or, for a leak, the retainer chain from the growing object to a root keeping it alive.
- Read only the narrowed rows, not the raw artifact.

## Prove the mechanism

- **Live process** → confirm the hypothesis cheaply first: evaluate an expression through its live-eval or debugger protocol, or apply a scoped hotfix without restart.
- **Captured artifact** → confirm against a paired before/after capture when one exists; without one, call the finding the best reading this artifact allows, an unconfirmed hypothesis.

## Attribute to source

- Map the hot frame or retainer to file, symbol and the line that allocates, blocks or schedules.
- Frame without symbols → diagnosis stays open; report that gap, never a guessed symbol.

## Hypothesis families for a slowdown

Trace names a region → these ground the fix. Try a family only if the trace carries its signal; not an ordered checklist.

- **Elimination.** Nothing needs the region (dead computation, always-off gate, redundant sync) → remove it.
- **Divide and conquer.** Cost grows with input size → split the input, or run independent parts concurrently.
- **Caching.** Identical inputs repeat a computation or fetch → keep the first answer, name what makes it stale.
- **Indirection.** Cheaper intermediate could absorb the cost → look up through an index instead of scanning, or queue work off the interactive thread.
- **Batching.** Many small calls each pay the same fixed cost → combine to pay once.
- **Redundancy.** One slow instance dominates a wait while others have headroom → run the attempt twice, keep the first to finish.
- **Lazy evaluation.** Cost goes to a result nothing reads yet → postpone to first read.
- **Scheduling.** Work required, but not while the user interacts → move it out of the user's wait.
