# Skill shape

The template a new skill fills in. Every section is optional except the frontmatter and the opening; drop a section instead of leaving it thin.

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

An agent follows the same budget with two differences: its frontmatter carries `model`, `tools` and `effort`, chosen so discovery and bulk reading run on Sonnet with a narrow tool list, and its body ends with the exact report shape the caller parses.
