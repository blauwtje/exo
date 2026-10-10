# Skill shape

New skill → start from this template; remove every section with nothing real to put in.

```markdown
---
name: <kebab-case>
description: <The moments it fires, then "Not for ..." naming the cases it leaves alone.>
---

# <Title>

<The principle in one sentence. The enemy is <the mistake this prevents>. The overcorrection is <the mistake this must not create>.>

## When to use

- <a symptom or the shape of a request>
- Not for <case>: <the skill or file that owns it>.

## The loop

1. **<Verb>.** <The rule and its reason, in one sentence.>
2. ...

## Red flags

| The excuse | What holds |
|---|---|
| "<the excuse>" | <what holds instead> |

## References

| File | Read it when |
|---|---|
| `references/<name>.md` | <the step and the condition> |

## Judgment

- <rule A> outranks <rule B> when <condition>.
```

An agent takes the same shape with two changes: frontmatter sets `model`, `tools` and `effort` (discovery and bulk reading run on Sonnet with few tools); body closes with the exact report format its caller parses. An agent that writes code to a brief runs on the standard tier; only judges and hard repairs may run on the strong tier.

## What to leave out

- War story about one fix ("last sprint the build broke because…") → write the rule it taught; a reader cannot generalize an anecdote.
- One example in several languages, or a blank template posing as an example → one complete example in the language that matters most.
- Placeholder names (`step3`, `helper`, `data`) where a domain word exists.
- A second final-message shape; the report step names what the `# Closing` ending in route-skills carries.

## Judgment

- Verifier rules for opening and closing outrank any layout preference.
