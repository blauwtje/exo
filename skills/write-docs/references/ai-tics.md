# AI writing tics

Each tic below is a pattern that marks text as machine-written, with its id, the fix, and one before/after pair. The enemy is prose a reader dismisses as generated before weighing what it says. The overcorrection is a rewrite that strips a term or number the reader needs because it matched a pattern.

An id is stable: a review cites it, a new tic takes the next free number in its group, and a removed tic retires its number rather than passing it on.

## Contents

- [Content](#content)
- [Word choice](#word-choice)
- [Formatting](#formatting)
- [Chat artifacts](#chat-artifacts)
- [Filler and hedging](#filler-and-hedging)
- [Metaphor and jargon](#metaphor-and-jargon)
- [Plain mechanism](#plain-mechanism)
- [Documentation mode](#documentation-mode)
- [Judgment](#judgment)

## Content

Claims the text cannot back. Fix: state the fact or the number that makes the point, or cut the claim.

| Id | Tic | Before | After |
|---|---|---|---|
| C1 | A trailing "-ing" phrase that asserts a benefit | The cache now evicts by size, ensuring stable memory use. | The cache now evicts by size. Memory stayed under 180 MB in the load test. |
| C2 | A vague source | Users have long asked for byte-based limits. | Issues #388 and #412 ask for a byte limit. |
| C3 | Inflated significance | This marks a pivotal step toward a more resilient platform. | This is the first release that survives a restart of the database. |
| C4 | A quality adjective with no measurement behind it | Retries are now significantly more robust. | A 429 without `Retry-After` no longer crashes the client. |
| C5 | A promise about the future | This lays the groundwork for faster builds. | Cut it, or name the follow-up issue. |

## Word choice

Words chosen for their sound, not their meaning. Fix: the word a developer says out loud, and one name per thing.

| Id | Tic | Before | After |
|---|---|---|---|
| W1 | Stock AI vocabulary: delve, interplay, tapestry, landscape, pivotal, seamless, showcase, foster, streamline, vibrant | This PR delves into the interplay between the cache and memory. | This PR changes how the cache evicts entries. |
| W2 | A fancy verb in place of "is" or "has": serves as, stands as, boasts, features | `config.toml` serves as the home for every setting. | `config.toml` lists every setting. |
| W3 | "Not just X, but Y" and "It's not X, it's Y" | This isn't just a bug fix, it's a rethink of caching. | This fixes #412 by evicting on bytes. |
| W4 | A list of three forced for rhythm | Fast, reliable and scalable image compression. | Compresses JPEG and PNG files in place. |
| W5 | Synonym cycling: one thing under several names | The cache fills up, the store evicts, the LRU layer logs it. | The cache fills up, evicts, and logs the eviction. |
| W6 | A false range with no scale between its ends | Works for everything from hobby scripts to enterprise pipelines. | Works in any project on Node 20 or newer. |
| W7 | A long word where a short one exists: utilize, leverage, facilitate, commence | Leverage `--dry-run` to facilitate a review of changes. | Use `--dry-run` to see the changes first. |
| W8 | An adverb that promises ease or force: simply, easily, just, seamlessly, actually | Simply run the command and it just works. | Run `npx tidyimg ./images`. |
| W9 | A coined term where the code has a name | The eviction ledger tracks the byte budget. | `sizeTotal` holds the bytes in the cache. |

## Formatting

Typography that decorates instead of structuring. Fix: plain punctuation, and structure only where the reader scans.

| Id | Tic | Before | After |
|---|---|---|---|
| F1 | Em dashes as the default joint | The client retries — with jitter — up to five times. | The client retries up to five times, with jitter. |
| F2 | A colon joining two clauses for drama | The fix is simple: count bytes. | The fix counts bytes instead of entries. |
| F3 | Bold spread over ordinary words | The cache is **much smaller** and **faster**. | The cache holds at most 64 MiB. |
| F4 | An inline-header list whose bold label the line repeats | **Performance:** Performance improved under load. | Memory stayed under 180 MB under the replayed load. |
| F5 | Title Case headings | ## Getting Started With Tidyimg | ## Compress a folder |
| F6 | A decorative emoji | 🚀 Faster retries! | Retries start after 200 ms. |
| F7 | Curly quotes in text that holds code | Set “retry.maxAttempts” to 3. | Set `retry.maxAttempts` to 3. |
| F8 | A slash for "and" or "or" | Handles JPEG/PNG files and/or folders. | Handles JPEG and PNG files in a folder. |
| F9 | Headings and bullets on text that is one paragraph | A PR body with six headings for a two-line change. | Two sentences, the proof line, and `Closes #412`. |

A bold lead-in stays when it ends in a period and the sentence after it adds detail, such as a glossary entry.

## Chat artifacts

Traces of a conversation left in a document. Fix: open on the content, end on the content.

| Id | Tic | Before | After |
|---|---|---|---|
| A1 | A line addressed to the requester | Here is a PR description you can paste: | Open on the first line of the body. |
| A2 | A sign-off | I hope this helps! | Cut it. |
| A3 | Praise | Great catch on the eviction bug! | Cut it. |
| A4 | A cheer after a step | That's it! You're all set. | Cut it; the next step or the end of the section says so. |
| A5 | Text that describes itself | This section explains how retries work. | Retries wait 200 ms, then double each time, up to 5 attempts. |

## Filler and hedging

Words that do no work. Fix: cut them, or commit to the claim.

| Id | Tic | Before | After |
|---|---|---|---|
| H1 | A filler phrase: in order to, due to the fact that, it is worth noting that | In order to reduce memory, it is worth noting that entries are now weighed. | To reduce memory, the cache weighs each entry. |
| H2 | Stacked hedges | This could potentially help reduce some spikes. | This removed the spike in the load test. |
| H3 | A generic conclusion | Overall, this makes the codebase better. | Cut it. |
| H4 | A summary that repeats the list above it | In summary, the cache now uses bytes, tests cover it, and docs explain it. | Cut it. |

## Metaphor and jargon

Abstract nouns and figures in place of the mechanism. Fix: the concrete noun and the literal verb.

| Id | Tic | Before | After |
|---|---|---|---|
| J1 | An abstract metaphor noun: substrate, ratchet, north star, backbone, guardrail | The budget acts as a ratchet on skill size. | The verifier fails a skill body over 2,500 tokens. |
| J2 | Personified code or a figurative verb | The client gracefully bows out after five tries. | The client stops after five attempts and throws `RetryError`. |
| J3 | An aphorism | Memory is a budget, not a suggestion. | Cut it; state the limit. |
| J4 | A feeling where a mechanism belongs | Retries now feel smoother. | Each retry waits twice as long as the last, plus up to 100 ms of jitter. |

## Plain mechanism

Sentences that hide who acts or make the reader decode. Fix: actor, verb, object, in full words.

| Id | Tic | Before | After |
|---|---|---|---|
| P1 | A passive verb with no actor | The value is read at startup. | `boot.ts` reads `CACHE_MAX_BYTES` at startup. |
| P2 | A sentence over 25 words, or two thoughts in one | Eviction now counts bytes, which fixes the spike, and the old option is gone, so configs that set it need updating. | Eviction now counts bytes. The `entryCount` option is gone, so remove it from your config. |
| P3 | Over-compression: dropped articles, arrows, tildes, symbol-speak | cache → bytes, ~2 MB/entry, entryCount gone | The cache now counts bytes. Entries were about 2 MB each. `entryCount` is removed. |
| P4 | A pronoun with more than one possible referent | When the cache calls the store, it drops it. | When the cache calls the store, the store drops the entry. |
| P5 | A noun stack | cache eviction byte limit configuration option | the option that sets the cache's byte limit |
| P6 | "Only" or "not" far from the word it limits | You only need `--force` when the folder is locked. | You need `--force` only when the folder is locked. |
| P7 | A semicolon joining two sentences | The cache counts bytes; the old option is gone. | The cache counts bytes. The old option is gone. |

## Documentation mode

A document serves one reader need: learning by doing (tutorial), getting a known task done (how-to), looking a fact up (reference), or understanding why (explanation). Fix: pick one mode per document and move the rest to its own page or section.

| Id | Tic | Before | After |
|---|---|---|---|
| M1 | A welcome or tour inside a how-to or reference | Welcome! Let's compress your first image together. Here is every flag: | A how-to that opens on the command, then a flag table under its own heading. |
| M2 | Explanation inside a step | 3. Run `npm run bump`. Versioning matters because consumers pin ranges. | 3. Run `npm run bump`. The reason goes to the explanation page. |
| M3 | The condition after the instruction | Run `npm run bump` if the version changed. | If the version changed, run `npm run bump`. |
| M4 | The warning after the step it guards | Run `tidyimg ./photos`. Note: this overwrites the originals. | `tidyimg` overwrites the originals, so commit them first. Then run `tidyimg ./photos`. |
| M5 | The rare case before the common one | With a proxy, set `HTTPS_PROXY`. Otherwise run `npm install`. | Run `npm install`. Behind a proxy, set `HTTPS_PROXY` first. |

## Judgment

- A fact, number or term the reader needs outranks every tic fix; a fix that drops it is wrong, whatever tic it clears.
- Documentation mode decides first: move a sentence to the page its mode belongs on before rewording it, because a sentence that moves may need no fix.
- A tic in a quotation, a command or a code sample stays as written, because a changed quotation or command no longer matches its source.
