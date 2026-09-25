# Profile and trace forensics

Diagnose a slowdown, memory growth, or a captured profile from a signal, not from reading source. The enemy is naming a bottleneck the trace never showed. The overcorrection is profiling without ever attributing the finding to a file, symbol, and line. The deliverable is a diagnosis; Step 4 turns it into a fix once the cause is proven.

## Capture or load the signal

- **Live process.** Capture a CPU profile for a spinning or slow path, a heap snapshot for growing memory, or a trace from the runtime's own tracing or debugger protocol for a glitch. Use the profiler that matches the language and runtime; a real artifact, not a guess.
- **Already-captured artifact** (a `.cpuprofile`, trace file, spindump, or heap snapshot handed over after the fact). Identify its format and load it with the matching tool instead of re-running the process; the capture is a fixed dataset.

## Narrow to the finding

Load a large artifact into a form you can query (one row per sample, frame, or node) before reading it by eye. Narrow to the hot path — the frames holding the most time — or, for a leak, the retainer chain from the growing object to a root that keeps it alive. Read only the narrowed rows, not the raw artifact.

## Prove the mechanism

- **Live process.** Confirm the hypothesis cheaply before believing it: evaluate an expression against the running process through its live-eval or debugger protocol, or apply a scoped hotfix without a restart.
- **Captured artifact.** Confirm against a paired before/after capture when one exists. Without one, call the finding the best reading this artifact allows, a hypothesis nothing has confirmed.

## Attribute to source

Map the hot frame or retainer to file, symbol, and the line that allocates, blocks, or schedules. A frame the artifact carries no symbols for leaves the diagnosis open; report that gap, never a guessed symbol.

## Hypothesis families for a slowdown

Once the trace names a region, these ground the fix. Try a family only if the trace carries its signal, never as an ordered checklist.

- **Elimination.** Nothing needs the region to run (dead computation, an always-off gate, a redundant sync): remove it.
- **Divide and conquer.** Cost grows with input size: cut the input into smaller parts, or run independent parts concurrently.
- **Caching.** Identical inputs repeat a computation or fetch: keep the first answer and name what makes it stale.
- **Indirection.** A cheaper intermediate could absorb the cost: look up through an index rather than scanning, or queue work off the interactive thread.
- **Batching.** Each of many small calls pays the same fixed cost: combine them to pay it once.
- **Redundancy.** One slow instance dominates a wait while others have headroom: run the attempt twice, keep the first to finish.
- **Lazy evaluation.** The cost goes to a result nothing reads yet: postpone it until the first read.
- **Scheduling.** The work is required, but not while the user interacts: move it out of the user's wait.

## Judgment

- Planning and measuring a fix once the region is named is a separate, already-owned loop; this reference stops at capturing and reading the signal that names the region.
- A finding with no paired before/after capture and no live-instrumentation proof is a hypothesis, not the cause; the Activation gate still requires the mechanism proven before Step 4.
