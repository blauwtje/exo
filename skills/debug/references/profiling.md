# Profile and trace forensics

Diagnose a slowdown, memory growth, or a captured profile from a signal, not from reading source. The enemy is naming a bottleneck the trace never showed. The overcorrection is profiling without ever attributing the finding to a file, symbol, and line. The deliverable is a diagnosis; Step 4 turns it into a fix once the cause is proven.

## Capture or load the signal

- **Live process.** Capture a CPU profile for a spinning or slow path, a heap snapshot for growing memory, or a trace from the runtime's own tracing or debugger protocol for a glitch. Use the profiler that matches the language and runtime; a real artifact, not a guess.
- **Already-captured artifact** (a `.cpuprofile`, trace file, spindump, or heap snapshot handed over after the fact). Identify its format and load it with the matching tool instead of re-running the process; the capture is a fixed dataset.

## Narrow to the finding

Load a large artifact into a form you can query (one row per sample, frame, or node) before reading it by eye. Narrow to the hot path — the frames holding the most time — or, for a leak, the retainer chain from the growing object to a root that keeps it alive. Read only the narrowed rows, not the raw artifact.

## Prove the mechanism

- **Live process.** Confirm the hypothesis cheaply before believing it: evaluate an expression against the running process through its live-eval or debugger protocol, or apply a scoped hotfix without a restart.
- **Captured artifact.** Confirm against a paired before/after capture when one exists. Without one, report the finding as the strongest hypothesis the artifact supports, not a confirmed cause.

## Attribute to source

Map the hot frame or retainer to file, symbol, and the line that allocates, blocks, or schedules. A frame with no source mapping is not yet a diagnosis; say so rather than guessing the symbol.

## Hypothesis families for a slowdown

Once the trace names a region, use these to ground the fix; a family earns an attempt only when the trace shows the signal it names, not as a checklist run in order.

- **Elimination.** The region need not run at all: dead computation, an always-off gate, a redundant sync.
- **Divide and conquer.** Cost scales with input size; split the work so each piece touches less, or run independent pieces in parallel.
- **Caching.** The same computation or fetch repeats on identical inputs; store and reuse the result, and name what invalidates it.
- **Indirection.** A cheaper intermediate could absorb the cost: an index instead of a scan, a queue off the interactive thread.
- **Batching.** Many small operations each pay a fixed overhead; coalesce them to pay it once.
- **Redundancy.** One slow instance dominates a wait with headroom elsewhere; duplicate the attempt and take the fastest result.
- **Lazy evaluation.** The cost lands on a result nobody uses yet; defer it to first use.
- **Scheduling.** The work must happen, but not during the interactive moment; move it off the path the user waits on.

## Judgment

- Planning and measuring a fix once the region is named is a separate, already-owned loop; this reference stops at capturing and reading the signal that names the region.
- A finding with no paired before/after capture and no live-instrumentation proof is a hypothesis, not the cause; the Activation gate still requires the mechanism proven before Step 4.
