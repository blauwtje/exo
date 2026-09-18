# The sketch tab

Answer one visual question in the time it takes to ask it: a rough sketch in a tab that is already open, and one click. The enemy is the sketch polished into a comp, which spends minutes on a question that needed seconds. The overcorrection is a sketch so bare it hides the choice: grey boxes cannot answer a color question.

`direction-preview.md` owns full comps. This file owns every other visual question.

## The commands

```bash
node scripts/sketch-tab.mjs --serve "$RUN/sketches" --labels "$RUN/sketch-labels.json" 2> "$RUN/sketch-tab.log"
node scripts/sketch-tab.mjs --wait "$RUN/sketches" --sketch <file.html> > "$RUN/sketch-answer.json"
```

- `--serve` runs once per session under the Bash tool's `run_in_background`. It opens the tab at once, pushes every newer sketch into it, and opens it again when a sketch lands after the user closed it.
- `--wait` runs under `run_in_background` after each sketch is written. Its one stdout line is `{"sketch","choice","label","steer"}`.
- The first question is one message: the `--serve` start, the Write of the sketch, and the `--wait` start. Every later question or revision is one Write and one `--wait`.
- Exit 3 means no browser, no tab server, or no answer within 600 seconds. The recommended option is then the choice, stated in one line, with no question to the terminal.
- When exit 3 says no tab server runs, start `--serve` once more with the next sketch, because the server leaves after 30 minutes without a tab.
- Exit 2 is a usage error, and the flag it names is the fix.

## The labels

`$RUN/sketch-labels.json` carries the tab's own copy in the language the conversation runs in, written before the offer: `waiting`, `fallbackQuestion`, `hint`, `steer`, `send`, `received`, `failed`, `lost`, plus `lang`, the language tag of those words. Short sentences and everyday words, for someone who has never seen a design tool.

## One question, one file

A sketch is `$RUN/sketches/<nnn>-<topic>.html`, numbered in the order asked. A revision takes the next number and never rewrites an answered file, because an answer is matched to its sketch by file name.

- It opens with `<title>`, the question in the user's language and plain words; the tab shows it above the sketch.
- It holds two to four options, each one element carrying `data-choice="<id>"` and a visible name. An id is letters, digits and hyphens, because the tab matches a click to the file by that text. The recommended option comes first and its name says so.
- Each option carries `aria-label` with its short name, because the tab and the answer repeat it and otherwise guess it from the option's text.
- For the direction question, the id is the contract's dealt index.
- Only the axis in question differs between options. Content, size and every other axis stay equal, because a second difference makes the click unreadable.
- The choice is shown on the real thing: the surface's own headline, its button, its numbers. A palette is the header and the call to action wearing it, never loose swatches alone.
- At most 60 lines in all, with its own `<style>`, no script and no build step. A type question may link one https font stylesheet.
- It is a fragment: no doctype, no head, no reset. The tab's shell is structural only, and it adds the focus ring and the keyboard handling.
- The options sit side by side, fit one screen at 1280 pixels wide without scrolling, and stack below 700.

## The answer

- `choice` names the option. Apply it, state it in one line, and move on; a click is never confirmed with a second question.
- A non-empty `steer` is a revision request: write the next file with the change and wait again.
- A null `choice` means no option was right, so the revision moves away from all of them.
- Revising stops when an answer carries a choice and no steer.
- `$RUN/sketches/answers.jsonl` records every answer, and the report cites it for each visual choice the user made.

## Judgment

- A click outranks the recommendation seated first.
- A sketch shown now outranks a better sketch shown in a minute.
- One axis per sketch outranks fewer questions, because two axes in one sketch answer neither.
- The user's words in `steer` outrank this session's reading of the click.
