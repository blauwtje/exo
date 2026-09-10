# Skill shape

A new skill fills this template and drops every section it cannot fill. The enemy is a thin section kept for symmetry, which costs tokens and teaches nothing. The overcorrection is a body that skips the opening or the judgment ladder, which the verifier rejects.

```markdown
---
name: <kebab-case>
description: <When it fires, then "Not for ..." with the cases it declines. At most 400 characters.>
---

# <Title>

<Principle in one sentence. The enemy is <the failure this stops>. The overcorrection is <the failure this must not cause>.>

## When to use

- <symptom or request shape>
- Not for <case>: <who owns it instead>.

## The loop

1. **<Verb>.** <Rule plus its reason in one sentence.>
2. ...

## Red flags

| Thought | Reality |
|---|---|
| "<rationalization>" | <what is true instead> |

## References

| File | Read it when |
|---|---|
| `references/<name>.md` | <the step and condition> |

## Judgment

- <rule A> outranks <rule B> when <condition>.
```

An agent follows the same shape with two differences: its frontmatter carries `model`, `tools` and `effort`, chosen so discovery and bulk reading run on Sonnet with a narrow tool list, and its body ends with the exact report shape the caller parses.

## Anti-patterns

- A narrative of one fix ("we hit X in May") instead of the rule it taught; the reader cannot generalize a story.
- The same example in two languages, or a fill-in template posing as an example; one complete real example in the most relevant language.
- A generic label (`step3`, `helper`, `data`) anywhere a domain word fits.
- A reference that points at another reference; every reference sits one level below the skill file, and one over 100 lines opens with a table of contents.

## Judgment

- A dropped section outranks a thin one.
- One real example outranks two ports of it.
- The verifier's opening and closing contract outranks any layout preference.
