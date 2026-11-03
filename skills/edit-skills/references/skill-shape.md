# Skill shape

Start a new skill from this template and remove every section that has nothing real to put in it, because an empty section costs tokens on every load.

```markdown
---
name: <kebab-case>
description: <The moments it fires, then "Not for ..." naming the cases it leaves alone.>
---

# <Title>

<The principle in one sentence. Produce <the output this skill yields>. Avoid <concrete list of the mistakes this prevents>.>

Add "The overcorrection is <the mistake this must not create>." only when a recorded run shows over-application. An existing enemy/overcorrection opening migrates to this shape when that skill is next edited.

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

## What to leave out

- Leave out a war story about one fix ("last sprint the build broke because..."). Write the rule it taught, because a reader cannot generalize an anecdote.
- Give one complete example in the language that matters most, not one example in several languages or a blank template posing as an example.
- Use a domain word where one exists instead of a placeholder name (`step3`, `helper`, `data`).
- Keep a single final-message shape. The report step names what `${CLAUDE_PLUGIN_ROOT}/skills/route-skills/references/closing.md` carries.

## Judgment

- Verifier rules for opening and closing outrank any layout preference.
