# The sketch tab

Answer one visual question as fast as it is asked: a rough sketch in an already-open tab, one click. The enemy is the sketch polished into a comp, minutes spent on a seconds question. The overcorrection is a sketch so bare it hides the choice: grey boxes cannot answer a color question. The `direction-preview` reference owns the direction question and its comps; this file owns every other visual question.

## The commands

```bash
node scripts/sketch-tab.mjs --serve "$RUN/sketches" --labels "$RUN/sketch-labels.json" 2> "$RUN/sketch-tab.log"
node scripts/sketch-tab.mjs --wait "$RUN/sketches" --sketch <file.html> > "$RUN/sketch-answer.json"
```

- First question → one message: `--serve` start, Write of the sketch, `--wait` start.
- Later question or revision → one Write, one `--wait`.
- Exit 3 (no browser, no tab server, or no answer within 600 seconds) → the recommended option is the choice, stated in one line; ask no question in the terminal.
- Exit 3 says no tab server runs → start `--serve` once more with the next sketch; the server leaves after 30 minutes without a tab.
- `--serve` → once per session, in a background `exec_command` session polled with `write_stdin`; opens the tab at once, pushes every newer sketch into it, reopens it when a sketch lands after the user closed it.
- `--wait` → in a background `exec_command` session polled with `write_stdin` after each sketch is written; its one stdout line is `{"sketch","choice","label","steer"}`.
- Exit 2 → usage error; the flag it names is the fix.

## The labels

- Write `$RUN/sketch-labels.json` before the offer.
- It carries the tab's own copy in the conversation's language: `waiting`, `fallbackQuestion`, `hint`, `steer`, `send`, `received`, `failed`, `lost`, plus `lang`, the language tag of those words.
- Copy → short sentences, everyday words, for someone who has never seen a design tool.

## One question, one file

Sketch = `$RUN/sketches/<nnn>-<topic>.html`, numbered in asking order. A revision takes the next number and never rewrites an answered file; answers match sketches by file name.

- Only the axis in question differs between options; content, size and every other axis stay equal, since a second difference makes the click unreadable.
- Choice shown on the real thing: the surface's own headline, button, numbers.
- Palette → the header and call to action wearing it, not loose swatches alone.
- Fragment: no doctype, no head, no reset.
- Tab shell is structural only; it adds focus ring and keyboard handling.
- At most 60 lines in all, own `<style>`, no script, no build step.
- Type question → may link one https font stylesheet.
- Opens with `<title>`: the question in the user's language and plain words; the tab shows it above the sketch.
- Two to four options, each one element carrying `data-choice="<id>"` and a visible name.
- Id: letters, digits, hyphens.
- Recommended option first; its name says so.
- Each option carries `aria-label` with its short name.
- Options side by side, fit one screen at 1280 pixels wide without scrolling, stack below 700.

## The answer

- Click → never confirmed with a second question.
- Apply the answer's `choice`, state it in one line, move on.
- Report cites `$RUN/sketches/answers.jsonl` (records every answer) for each visual choice the user made.
- Non-empty `steer` → revision request: write the next file with the change, wait again.
- Null `choice` → no option was right; the revision moves away from all of them.
- Answer with a choice and no steer → revising stops.

## Judgment

- A sketch shown now outranks a better sketch shown in a minute.
- One axis per sketch outranks fewer questions; two axes in one sketch answer neither.
