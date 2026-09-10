# Skill repository audit — 2026-08-02

Audit of the six-skill corpus, `verify.ps1`, and `evals/` against current official and community skill-authoring practice. Read for this audit: all 6 `SKILL.md` files, all 14 references, `README.md`, `install.ps1`, `verify.ps1` (structure, oracle, contracts), `evals/cases.json`, `evals/run-live.ps1` (header + grading paths), `docs/plans/2026-07-25-density-and-specificity.md`. No skill files were modified.

## 1. Summary

The corpus is in unusually good health: bodies are 4–20× under the official 500-line cap, progressive disclosure goes beyond anything in the official repos (per-reference phase gates, verifier-pinned wording), and the eval suite (19 oracle-checked routing cases plus a sandboxed cross-harness live runner) exceeds Anthropic's own recommended practice. The biggest structural issue is at the routing layer, not the bodies: 4,205 characters of always-loaded description across six skills — with system-critical rules (the "fix this" referent algorithm, the debug→blueprint handoff) sitting in the truncation-prone tails of the two longest descriptions, in a harness that caps the skill listing at ~1% of the context window and shortens least-used descriptions first. The highest-leverage fix is a description diet (trigger keywords first, exclusions compressed, workflow text removed) proven safe by re-running the live evals. Second priority: one confirmed eval defect — `implement-auth` expects a `research` hop that no fact derives, that research's own gate excludes, and that the network-denied sandbox cannot execute.

## 2. Research findings

Every practice below was confirmed against the cited source during this audit (fetched 2026-08-02). Official docs win over community conventions where they conflict; conflicts are noted.

| # | Practice | Source | Verdict |
|---|---|---|---|
| R1 | Frontmatter requires exactly `name` (≤64 chars, lowercase/digits/hyphens, matches directory) + `description` (1–1024 chars, non-empty); `license`/`compatibility`/`metadata` optional | [agentskills.io/specification](https://agentskills.io/specification) | **Follows** — `verify.ps1:128,157-165` enforces a stricter portable subset (exactly two keys, no `<>`) |
| R2 | Description: third person; what + when-to-use; "include specific keywords that help agents identify relevant tasks" / "keywords users would naturally say" | [Best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); [Claude Code skills docs](https://code.claude.com/docs/en/skills) (Troubleshooting) | **Partial** — third person ✓, when/when-not ✓ (exceeds official examples); but predicate jargon displaces natural keywords in shape/blueprint (see per-skill) |
| R3 | "Put the key use case first": each listing entry is truncated at 1,536 chars; the whole listing has a budget of ~1% of the context window; when it overflows, least-used skills lose their descriptions | [Claude Code skills docs](https://code.claude.com/docs/en/skills) (frontmatter reference + "Skill descriptions are cut short") | **Partial** — key use case first ✓; but 4,205 measured chars across six entries consume >half a default budget shared with every other installed skill, and the do-not-use tails are what truncation cuts first |
| R4 | SKILL.md body < 500 lines / < 5k tokens; "the context window is a public good"; assume the model is smart | Best practices; agentskills.io | **Follows** — bodies 21–61 lines; repo budgets (120/90, `verify.ps1:174`) are ~4× stricter than official |
| R5 | Progressive disclosure: SKILL.md as overview, detail in references loaded on demand, references one level deep, TOC for reference files >100 lines | Best practices; agentskills.io; [engineering blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | **Exceeds** — per-reference "Read it when" contracts with load-phase gates, wording pinned by `verify.ps1:375-389`; all references <90 lines so no TOC needed |
| R6 | Skills are self-contained folders; file references are relative to the skill root | agentskills.io ("relative paths from the skill root"); [anthropics/skills](https://github.com/anthropics/skills) layout | **Violates (deliberately)** — `debug` and `blueprint` reach `../implement/references/*.md`; safe only when all six install together (which `verify.ps1:474-524` and `install.ps1` do enforce/produce), broken for anyone copying one skill folder |
| R7 | Workflows as numbered steps; feedback loops (validate → fix → repeat) | Best practices | **Follows** — every skill is a numbered loop with proof/critique gates |
| R8 | Consistent terminology throughout | Best practices | **Follows** — "size facts", "breakers", "mundane" used uniformly; enforced opening/closing structure (`verify.ps1:191-217`) |
| R9 | Avoid time-sensitive content | Best practices | **Exceeds** — banned-text check (`verify.ps1:219-266`) strips all vendor/harness capability names, making bodies immune to harness drift by construction |
| R10 | Evaluation-first: ≥3 evals, baseline **without** the skill, observe navigation, iterate | Best practices ("Establish baseline: Measure Claude's performance without the Skill"); skill-creator; superpowers RED-GREEN-REFACTOR | **Partial** — 19 cases + live runner far exceed the norm, but there is no no-skill baseline arm, and several paths are untested (§4.5) |
| R11 | Never summarize the skill's workflow in the description — "agents may follow the description instead of reading the full content" | [obra/superpowers writing-skills](https://github.com/obra/superpowers) (community; not contradicted by official docs) | **Partial** — `debug:3` and `shape:3` embed procedure in descriptions (see per-skill) |
| R12 | Names: gerund preferred, noun/action forms acceptable; never vague | Best practices | **Follows** — action verbs + concrete nouns; nothing vague |
| R13 | Skill body enters the conversation once and persists; write standing instructions, not one-shot steps | Claude Code skills docs | **Follows** — all bodies are standing loops |
| R14 | Forward slashes in all paths | Best practices | **Follows** — checked by `verify.ps1` Markdown-reference validation |
| R15 | Claude Code extensions exist: `when_to_use`, `context: fork` + `agent`, `allowed-tools`, `paths`, `effort`, `hooks` | Claude Code skills docs (frontmatter reference) | **N/A by choice** — the portable name+description subset is the repo's core constraint; noted in §4.6 as a strategic trade-off, with unknowns flagged |
| R16 | Superpowers convention: descriptions start "Use when…" with concrete symptoms | obra/superpowers | **Partial** — repo puts a capability sentence first, then "Use when"; official docs support capability-first, so no change required (conflict resolved in favor of official) |

Community sources consulted beyond superpowers: [anthropics/skills](https://github.com/anthropics/skills) (template + layout conventions), ecosystem surveys via search (skills-in-repo distribution, TDD-for-skills testing). The latter two informed §4 but produced no verdicts not already covered above.

Measured facts used below: description lengths (chars) — shape 937, debug 702, blueprint 683, ui-design 663, implement 662, research 558, **total 4,205**; body lines — ui-design 61, implement 40, blueprint 38, debug 31, shape 30, research 21.

## 3. Per-skill audit

### shape — verdict: refactor (description only; body is sound)

1. **High — system rule in a truncation-prone tail.** `SKILL.md:3` ends: `A bare "fix this" activates no skill from the phrase alone: resolve its referent from the working-tree diff, latest failing check, then last touched file before applying these rules.` This is the corpus's only *pre-activation* routing rule, so it can only live in a description — but it sits at the end of the longest description (937 chars), exactly where Claude Code's listing truncation cuts (R3), in the skill's least-guaranteed position. It is also duplicated at `shape:34`, `blueprint:19`, and `README:73`. Fix: compress to one clause (~110 chars, e.g. "For a bare 'fix this', resolve the referent from diff, failing check, or last-touched file before routing.") and keep the full algorithm in the bodies.
2. **Medium — trigger vocabulary is internal jargon.** `SKILL.md:3`: `Use when at least one size fact is true—more than one file, a new dependency…`. "Size fact" is defined nowhere the model can see before activation, and the description contains none of the words a user actually types for this skill's cases (feature request, add/build a capability, compare options, trade-offs, approach). Official guidance (R2) is explicit that discovery runs on the user's words. The enumeated facts belong in the body (already at `shape:12`); the description needs the natural keywords.
3. **Low — precedence sentences duplicated corpus-wide** (`shape:46-47` vs `debug:42`, `implement:51`, `blueprint:54-55`, `ui-design:91`, `README:77-79`). Justified at runtime — only one body loads at a time — but no verifier contract pins the copies to each other (§4.3).

### blueprint — verdict: keep; minor description trim

1. **Medium — selection-time-unknowable trigger, thin keywords.** `SKILL.md:3`: `…or initial inspection finds at least two edit dependency edges where B cannot land green before A.` The model cannot know edge counts when it selects a skill; this clause is really a body-side gate (and exists there, `blueprint:12`). Meanwhile the words users type — "plan", "write a plan", "hand off", "for another engineer/session" — are present but buried mid-sentence. Front-load them (R3).
2. **Low — workflow in description** (R11). `SKILL.md:3`: `Distill the request first and never plan on guessed structure.` These are instructions, not triggers; they cost listing budget and already open the body (`blueprint:14-28`).
3. **Low — untestable superlative.** `references/handoff-spec.md:34`: `Author the plan at the highest reasoning tier available to this session; do not lower it to match the executor.` No oracle can observe this, and "reasoning tier" is a harness concept smuggled past the portability ban in neutral clothing. Keep or cut is taste; flagging as the one rule in the corpus with no observable outcome (opinion).

### implement — verdict: keep

1. **Medium — description/body double-statement of the gate.** The description (`SKILL.md:3`) and the Activation gate (`SKILL.md:12-20`) each carry the full exclusion list and size-fact list. The two-stage design is defensible (description selects; body re-verifies after inspection, and facts are only countable post-inspection) — but the description's tail restates the body's conclusion verbatim: `one-file changes whose affected lines and mechanism are already identified and for which none of the listed activation facts is true` (~110 chars). Trim the tail; keep the body gate.
2. **Positive note, no action:** the reference-table wording shared with `debug` is the one duplication the verifier already pins exactly (`verify.ps1:375-389`). This is the pattern §4.3 recommends extending.

### debug — verdict: keep; trim description

1. **Medium — workflow and choreography in the description** (R11, R3). `SKILL.md:3` embeds two instructions: `establish the reproduction as the first step` and the full planning-mode handoff — `While a read-only planning mode owns the turn, hand the symptom to blueprint, which schedules this loop's reproduction as the plan's first phase.` The handoff sentence (~170 chars) duplicates `blueprint:55` and `README:79`; blueprint's own description already claims planning-mode ownership, which is the copy that matters at selection time. Cut both from the description; the body keeps them (`debug:10`, `debug:42`).
2. **Low — missing natural keywords.** The description says "wrong behavior, a failure, or a slowdown" but never "bug", "error", "broken", "crash", or "regression" — the words users type. Add them (R2).
3. **Low — sixth restatement of the size-fact list** at `SKILL.md:24` (§4.3).

### research — verdict: refactor its eval integration; body is sound

1. **High — untested, and its only eval appearance contradicts its own gate.** No case exercises research as a real hop (§4.5, E2). The body itself is well-formed.
2. **Low — keyword gaps.** Description lacks "docs", "documentation", "changelog", "upgrade", "migration guide" — high-frequency user words for this trigger.
3. **Note, no action:** `SKILL.md:23` ("Do this in an isolated context when the harness offers one") is the honest portable phrasing of what Claude Code would spell `context: fork` + an isolated agent. The portability ban makes this the correct wording; §4.6 discusses the trade-off.

### ui-design — verdict: keep (recently refactored per docs/plans/2026-07-25); consolidate the floor numbers

1. **Medium — quality-floor numbers in four unpinned copies.** Contrast/size/line-height floors appear at `SKILL.md:73-75`, `references/anti-slop.md:79-84` (hard floor), `references/color.md:45-49`, and `references/typography.md:8,45`. They currently agree (4.5:1, 3:1, 24px / 18.66px+bold, 1.5 line-height, 14px dense minimum) but nothing enforces agreement, and this corpus's own history (the 2026-07-25 plan fixed exactly such a drift in `color.md`'s "old single-place boldness rule") shows the risk is real. Pin them with a verifier contract like the reference-table wording, or make SKILL.md the single numeric source and have references cite it.
2. **Low — body is the largest (61 lines) and loads whole for every tweak.** Phase 2 card anatomy and Phase 5 fault quotas load even when the size triage (`SKILL.md:11-16`) routes a tweak that skips those phases. At 61 lines this is comfortably inside every budget; only worth splitting if activation telemetry shows tweaks dominate. Nice-to-have.
3. **Opinion — countable-quota style.** Rules like `Find at least three faults … at least one must concern missing content` (`SKILL.md:84`) are unverifiable-by-oracle prescriptions. The design doc justifies them (anti-emptiness), official guidance neither endorses nor forbids them; keep, but the honest enforcement path is a live-eval assertion, not more prose.

## 4. System-level findings

### 4.1 Trigger overlap matrix

Pairwise discriminators exist for every adjacent pair and are stated on **both** sides (verified against the six descriptions plus `Get-OracleFirstSkill`, `verify.ps1:539-583`):

| Pair | Discriminator | Where stated | Tested by |
|---|---|---|---|
| shape × implement | solution chosen? | both descriptions | settings-page vs proven-failure |
| shape × ui-design | new surface's data/settings/behavior named? | identical sentence in both descriptions | shape-ui-overlap, dashboard-nicer |
| shape × debug | existing behavior failing? | both descriptions | unproven-failure |
| debug × implement | cause proven? | both descriptions | unproven- vs proven-failure |
| blueprint × implement | ≥2 dependency edges, or plan requested / planning mode | both descriptions | data-migration-boundary, explicit-handoff |
| blueprint × debug (planning mode) | blueprint owns the turn | both descriptions | untested (needs harness plan mode) |
| research × all | borrowed mid-turn, never ends a turn | research description + body | effectively untested (E2) |

No contradictions found; the handshake sentences are exact duplicates today, but no verifier contract pins the pairs to each other (→ 4.3).

### 4.2 Handoff-chain check

No dead ends found. The specific traps checked: feature complaint (excluded by debug, caught by shape — complementary exclusions, `debug:3` / `shape:3`); visual-only with no active stage (ui-design executes and reports directly, `ui-design:91`); research ending a turn (forbidden, `research:32`); planning turn + unproven failure (blueprint schedules reproduction as phase 1, stated on both sides). One **reachability gap**: `debug/references/performance.md` is loadable only through debug (`debug:34`: `Speed is the only symptom. Load before measurement`), but a *decided* speed change with a proven cause routes to implement (`causeProven` → not debug), where no reference row exposes the measurement discipline — so the median/spread/keep-revert rule never loads for exactly the "optimize this known hot loop" request it was written for.

### 4.3 Duplicated content (drift risk ranked by copy count)

| Content | Copies | Locations |
|---|---|---|
| Size-fact five-tuple | 6 | shape:3, shape:12, implement:3, implement:20, debug:24, README:72 |
| Precedence/handshake sentences | 6 | shape:46-47, debug:42, implement:51, blueprint:54-55, ui-design:91, README:77-79 |
| Referent-resolution order | 4 | shape:3, shape:34, blueprint:19, README:73 |
| Quality-floor numbers | 4 | ui-design SKILL.md:73-75, anti-slop.md:79-84, color.md:45-49, typography.md:8,45 |
| Question-gate conditions | 3 | shape:36-40, blueprint:22, README:73 |

Runtime duplication across bodies is *justified* here (only one body is in context at a time; each skill must be self-sufficient), so the fix is not deduplication — it is **pinning**: extend `verify.ps1` with shared-sentence contracts exactly the way reference-table wording is already pinned (`verify.ps1:375-389`). README copies should be checked against frontmatter too (`README.md:57-64` is a third hand-written trigger table).

### 4.4 Coverage gaps and missing skills

- Request types with no owner, by design and correctly so: docs/README edits, commit-message chores, config toggles — the zero-process list is a feature, and official guidance has no "every request needs a skill" doctrine. **No new skills recommended**: six descriptions already press the listing budget (R3), and each addition taxes every turn's routing.
- Two genuine seams: (a) the proven-cause performance request (§4.2); (b) "add tests for X" touching one test file — zero size facts → direct edit → `test-design.md` (red-before-green, behavior-not-construction) never loads for the one request type that is purely about test quality. Both are one-row fixes in reference tables, not new skills.

### 4.5 Evals and testability

- **E1 (confirmed defect).** `implement-auth` expects route `shape > research > shape > blueprint > implement` (`cases.json:184`, duplicated by hand at `verify.ps1:612`). But: the case's only research-related fact, `"externalVersionDecision": false` (`cases.json:183`), is consumed by nothing (single occurrence in the repo); research's own exclusions arguably bar the hop (the new dependency is vendored at `file:vendor/auth-policy` with no external version-sensitive API to confirm); and the live sandbox denies network to both harnesses (`README.md:53`), making `research:17` ("Fetch that version's first-party documentation") unexecutable — a compliant model must skip or report unconfirmed, and the grader (`run-live.ps1:1034-1037`) will count that against it. Every reference expectation in the suite is fact-derived (`verify.ps1:649-695`); the research hop is the only route element with no deriving predicate.
- **E2 (untested paths).** shape Explore mode (no case asks for options/comparison); ui-design "tweak" and "new piece" sizes (only full designs fire); the question-gate hard stop (no case has an ambiguous referent with two candidates); breakers actually triggering (both breaker cases are "…-if-triggered", never forced); blueprint's planning-mode trigger (the adapter never simulates a harness planning mode); research as above.
- **E3 (no baseline arm).** Official methodology (R10): "Establish baseline: measure Claude's performance without the Skill." The runner has no no-skill control, so the suite proves *conformance*, not *improvement*, and cannot detect a skill that costs more than it adds.
- **E4 (route table oversells "oracle").** Only `firstSkill` is predicate-derived (`Get-OracleFirstSkill`); downstream hops are two hand-written copies checked against each other (`cases.json` vs `verify.ps1:607-627`). Useful as a change detector; just not an oracle. README's "outcome oracles" phrasing (`README.md:42`) is accurate for references/proof, generous for routes.

### 4.6 Portability strategy (the one strategic trade-off to make explicitly)

The banned-vendor-terms rule (`verify.ps1:237-250`) buys freshness-immunity (R9) and dual-harness reuse at the cost of every Claude Code capability in R15: `when_to_use` (purpose-built for exactly the trigger text these descriptions overload), `context: fork` + isolated agents (purpose-built for `research:23`'s isolation request), `paths` (could scope ui-design to frontend globs), `allowed-tools`. Two facts to weigh, one unknown: (1) the extensions are real leverage today; (2) the agentskills.io spec offers `metadata` as the sanctioned extension point; (unknown — could not confirm) whether Codex's parser tolerates unknown top-level frontmatter keys, so any overlay experiment must be tested there first. Recommendation (opinion): keep the portable core exactly as is; if isolation for research proves valuable in practice, trial a Claude-Code-only overlay in one skill behind a verifier exemption rather than relaxing the ban corpus-wide.

### 4.7 Freshness

Bodies are immune by construction (R9) — nothing inside `everything/` names a tool, model, or harness behavior. Remaining freshness surface is infrastructure: `install.ps1` targets the legacy `~/.codex/skills` path; 2026 sources show both `~/.agents/skills` and the legacy path in active use, consistent with `README.md:25`'s documented single-migration plan — acceptable as a tracked risk. `~/.claude/skills` and the harness plan-file assumption in `blueprint:37` match current Claude Code behavior.

## 5. Refactor plan

Sequenced so earlier steps don't invalidate later ones: eval truth first, then text changes, then contracts that pin the final text, then new enforcement, then optional arms.

### Must-fix

| # | File(s) | Change | Rationale | Effort |
|---|---|---|---|---|
| 1 | `evals/cases.json`, `verify.ps1` | Resolve the `implement-auth` research hop: either (a) drop `research` from the route and delete the dead `externalVersionDecision` fact, adding a dedicated research case with an offline first-party-docs fixture (e.g. vendored `vendor/auth-policy/CHANGELOG.md`) and a `researchRequired` fact consumed by route validation; or (b) keep the hop and supply that fixture + fact. Either way, no route element without a deriving predicate. | §4.5 E1 — confirmed contradiction; currently grades compliant models down | M |
| 2 | all six `SKILL.md` descriptions | Description diet: target ≤ ~600 chars each (~3.6k total). Front-load natural trigger keywords (shape: feature request, compare options, trade-offs; debug: bug, error, broken, crash, regression; research: docs, changelog, upgrade); compress exclusion tails to clause form; delete workflow sentences (debug's reproduction-first + handoff choreography, blueprint's "Distill…", implement's tail restatement); compress shape's referent rule to one clause. Bodies keep the full versions — every deleted sentence already exists there. | §3 per-skill 1s, R2/R3/R11; the highest-leverage token fix in the repo | S text, M proof |
| 3 | `evals/` | Re-run `./verify.ps1` and the live suite (`-Live -Effort 'medium,high'`, per-harness as available) to prove routing survives the new descriptions before anything else lands on top | Descriptions are the router; step 2 is unproven without this | M (cost: live runs) |
| 4 | `verify.ps1` | Add shared-sentence contracts pinning: size-fact tuple, referent-resolution order, question-gate conditions, the paired handshake sentences (§4.1), ui-design floor numbers, and README trigger-table ↔ frontmatter agreement — same mechanism as the existing reference-table contracts | §4.3 — six-copy duplication is load-bearing and unpinned; write contracts against the post-step-2 text | M |
| 5 | `verify.ps1` | Add description-budget checks: fail >1,024 chars (currently the only check, `verify.ps1:163`), warn >650 per skill and >4,000 total, citing the listing budget | Makes step 2 permanent; R3 | S |

### Nice-to-have

| # | File(s) | Change | Rationale | Effort |
|---|---|---|---|---|
| 6 | `everything/implement/SKILL.md` (+ `verify.ps1` contract) | Add a reference row exposing `../debug/references/performance.md` for decided speed-only changes — or move performance.md to implement (canonical-single-location rule, `verify.ps1:444-450`, already models this) and repoint debug | §4.2 reachability gap | S |
| 7 | `everything/implement/SKILL.md` | Extend the test-design row's predicate so a one-file add-tests request loads it | §4.4(b) | S |
| 8 | `evals/cases.json`, `verify.ps1` | New cases: shape-explore (options request, no artifact), ui-tweak (single-element change; asserts the full loop does *not* run), ambiguous-referent (two candidates → exactly one question, `maxQuestionsBeforeCode: 1`, no edit before answer), forced-breaker (symptom unfixable in fixture → two-attempt stop with evidence) | §4.5 E2; keeps the 19-case contract in sync (`verify.ps1:599`) | M |
| 9 | `evals/run-live.ps1` | `-Baseline` arm: identical fixtures with an empty skills root, same observation schema, report deltas | §4.5 E3; official eval methodology | M/L |
| 10 | `README.md` | One sentence in Install: copying a single skill folder elsewhere breaks `debug`/`blueprint` (cross-skill references); the set installs together | §R6 — mitigation exists for the owner, not for a copier | S |
| 11 | one skill, behind a verifier exemption | Optional experiment: Claude-Code-only frontmatter overlay (e.g. `context: fork` for an isolated research pass) after confirming Codex tolerates unknown keys | §4.6; blocked on the stated unknown; opinion | L |

### Explicitly not recommended

- New skills (router, review, reporting) — §4.4; the listing budget argues the other way.
- Deduplicating the cross-body rule copies into one place — runtime self-sufficiency requires the copies; pin them instead (step 4).
- Relaxing the portability ban corpus-wide — §4.6.

## Sources

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://code.claude.com/docs/en/skills
- https://agentskills.io/specification
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://github.com/anthropics/skills
- https://github.com/obra/superpowers (incl. `skills/writing-skills/SKILL.md`)
