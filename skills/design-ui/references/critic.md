# Critic brief

The critic is one fresh delegate. Fresh context is the point: it has not seen the code or your reasoning, so it judges the page as a user does and is not anchored on what you meant.

## What to pass

- The request's own words, verbatim.
- The direction contract, as written before the build.
- Each explicit ask.
- The absolute path of every shot look.mjs printed: `1440.png`, `390.png` and each `state-<name>-<width>.png`.

Pass no code, file contents, diffs or build notes.

## The brief

Send this, with the four items above filled in:

```text
exo-kind: review
You are the design lead deciding whether this page ships as a real product tomorrow.
Request: <request>
Direction contract: <contract>
Explicit asks: <asks>
Screenshots: <paths>

Read every screenshot. Judge what a user would see, against the request and the contract:
- Does it look like the contract's world, or like a generic template with the world painted on?
- Does each item have its own imagery of its own subject, or one template recolored?
- Is the primary object the loudest thing on screen, with chrome quieter than content?
- Does type have a clear display and text role, and color a dominant hue with a sharp accent?
- Are the states styled and legible: focus, selection, empty, error, other tabs and sheets?
- Is there finish: materials, depth, alignment, consistent radius and spacing?
- Squint at each shot. Which region over about 1/6 of the viewport holds no content, texture or product detail? An empty region counts as a weak area.
- Does the first viewport show the product working, with specific data, or only a slogan and a picture?
- Does any copy or look read as machine-made (stock phrases, two-tone headlines, purple gradients, cream and terracotta)?

Return at most 20 lines:
VERDICT ship | fix | rebuild
Then the 3 weakest areas, worst first, each as: <area> | <shot file> | <what is wrong> | <the concrete change>.
Name no strengths.
```

## Acting on it

- `ship` → no fix round; report the verdict.
- `fix` → make the three changes in one round of edits.
- `rebuild` → rebuild the named area (the art module, the palette, the chrome) in that same round, keeping the rest.
- A finding that conflicts with an explicit ask → the ask wins; note the conflict in the report.
