# Skill shape

A new skill starts from this template and removes every section it has nothing real to put in. The enemy is a near-empty section kept so the file looks complete, which spends tokens and teaches nothing. The overcorrection is a body without the opening paragraph or the judgment ladder, which the verifier refuses.

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

An agent uses the same shape with two changes: its frontmatter sets `model`, `tools` and `effort`, picked so discovery and bulk reading run on Sonnet with few tools, and its body closes with the exact report format its caller parses.

## What to leave out

- A war story about one fix, such as "last sprint the build broke because…"; write the rule the story taught, since a reader cannot generalize an anecdote.
- One example repeated in several languages, or a blank template dressed up as an example; give a single complete example in the language that matters most.
- Placeholder names such as `step3`, `helper` or `data` where a word from the domain exists.
- A second shape for the final message; a skill's report step names what the ending under `# Closing` in using-exo carries.

## Judgment

- Dropping a section outranks keeping a thin one.
- One real example outranks the same example ported twice.
- The verifier's rules for the opening and the closing outrank any layout preference.
