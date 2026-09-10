---
name: research
description: Confirm the current, version-specific behavior of an external library, framework, API, or service from its documentation before writing code against it. Use when a decision hinges on docs, a changelog, an upgrade or migration guide, or provider behavior, and a wrong recalled answer would still compile or type-check yet fail at runtime, deployment, or the provider boundary. Not for questions the repository's own code already answers, a named dependency-version bump alone, or concept explanations.
---

# Research

Confirm behavior against the current source instead of recalling it. The enemy is the version-specific API detail recalled with total confidence and no grounding — a training-data snapshot presented as current fact, wrong in exactly the way that compiles, type-checks, and fails at runtime or in review. The overcorrection is treating every library call as unknown: if the repo's own code already calls this API three other places, that is stronger evidence than a fresh doc fetch, and re-researching it wastes a turn proving what is already demonstrated.

## Size gate

An implementation decision depends on current, version-specific external behavior, and an incorrect answer could compile or type-check while failing at runtime, deployment, or the provider boundary → this skill runs. The repo already answers it, the repo's own code already demonstrates the usage, or the question is a general concept ("what is a race condition") with no version dependency → skip it.

## The loop

1. **Find the installed version.** Read the lockfile or manifest (`package.json`/lockfile, `requirements.txt`/`poetry.lock`, `go.mod`, `Cargo.toml`, project config) before anything else — the question is never "how does this library work" in the abstract, it is "how does *this pinned version* behave," and those answers diverge constantly across major and even minor versions.
2. **Fetch that version's first-party documentation.** Official docs, changelog, or migration guide for the exact installed version — not the latest version's docs applied to an older install, and not a blog post or forum answer standing in for the source. If exact-version docs are unavailable, use the highest documented version not newer than the install; when none exists, use the lowest documented newer version. State both versions. Fetch the section that answers the question, never a whole site, and quote at most ten lines from it, because a page read once is re-read on every later turn.
3. **Cite what you found.** Every claim that shaped a code decision gets the URL it came from. A claim with no citation is a recollection, not research, and should be flagged as one.
4. **State plainly what could not be confirmed.** If the docs do not settle the question — undocumented behavior, conflicting sources, a version gap — say so explicitly rather than filling the gap with a plausible guess. "Could not confirm X; proceeding on the assumption that Y" is a valid research outcome.

## Where this runs

Delegate the documentation read to `docs-researcher` with the pinned version, the exact question, and a stop condition, so that bulk reading does not fill the main thread with pages that only three sentences of the final answer needed; `document-scout` owns a document on disk and `codebase-scout` owns the repository. Read here only when no separate context exists, and then one page at a time. Hand back only the confirmed facts, their citations, and what remained unconfirmed; not the raw pages read to get there.

## Output

Keep findings in the current message. Write `docs/research/<library>.md` only when the user requests a file, or when a named later session or different executor needs the same findings and the result required at least two first-party sources; otherwise create no artifact.

## Judgment

- For what the deployed code does today, the repo's own working code outranks fetched docs — a doc describing intended behavior and code demonstrating actual behavior are not the same thing. For code being written or upgraded now, first-party documentation and the migration guide for the pinned or target version outrank an existing repository pattern that the source marks deprecated, replaced, unsafe, or version-specific. Modernize no unrelated existing code the task does not require.
- Never end a turn on a research pass alone. It exists to unblock a `shaping`, `planning`, `implementing-batch`, or `debug` step already in progress — hand the confirmed facts back to that step rather than treating the research itself as the deliverable, unless the user asked a standalone question with no code to follow.
- For a standalone question, an explicitly named version outranks the lockfile. For code against the current repository, the lockfile outranks a named version unless the request also asks to update or migrate to that version. State the mismatch and continue; do not block on a version question.
- After a compaction notice, restate the confirmed facts from the delegated report or `docs/research/<library>.md`; when neither survives, repeat the delegated read rather than recalling, since a recollection is not research.
