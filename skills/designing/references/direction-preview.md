# Direction Preview

Put the built directions in front of the person deciding, whole and live, at a size where the type, the colour and the spacing can be read, and let one click settle it. The enemy is a comparison nobody can see: cards that fill in one by one, or taste polled in words the comps already answer. The overcorrection is a preview so staged that the chooser picks a presentation instead of a direction.

`visual-direction.md` owns what a direction is. This file owns the screen that asks for one.

## The command

```
node scripts/pick.mjs --comps <dir> --contracts <contracts.json> \
  --recommend <n> --recommend-note <one sentence> --labels <labels.json> --frame <w>x<h>
```

- `--comps` is the directory the seats live in: the contracts file decides how many, and `variant-<n>/index.html` plus its own assets fills seat `n`. The script waits until every seat's file exists, then prints `every comp landed after <s>s` and the URL on stderr and opens the tab. Nothing is written and no dependency is installed.
- `--recommend <n>` seats that variant first and badges it, and `--recommend-note` puts the reason above the cards in one short everyday sentence. This skill always names its own pick; a row of three with no opinion hands the work back.
- `--frame <width>x<height>` is the frame every comp renders in and was composed for: `390x844` for a phone-first surface, the default `1280x800` otherwise, so a phone comp is not a phone centred in a desktop tile.
- `--intrinsic` belongs to a size comparison alone, where each comp carries its own `meta.json` and the frame size is the thing being compared.
- Exit 3 means no browser opened, not every comp landed, or no answer arrived within the 600 seconds; the `--recommend` variant is then the selection, and no question goes to the terminal. Exit 2 is a usage error, and the flag it names is the flag to fix.

## Before the picker

The picker runs only when the user asks to see directions whole, after the message that names its price as the skill's `## Asking` section says; every other visual choice belongs to `sketch-tab.md`. The picker starts in the message that writes the comps, and the labels file is written just before it.

- One message holds a Write per comp and the `pick.mjs` start under the Bash tool's `run_in_background`. The order inside the message does not matter, because the picker opens the tab only once the last comp exists.
- No `capture.mjs`, `inspect-render.mjs`, screenshot, or image read of a comp before the picker: the picker is the comps' first render and the chooser's eyes are the critique. A headless capture engine is not the chooser's browser either, so a repair made against it fixes a defect the chooser might never have seen.
- Write each `index.html` directly from its contract. No template, generator, build script, or patch script stands between the two; a pipeline costs the minutes it was meant to save.
- A comp the chooser reports broken is repaired after the click and the picker reruns once; a comp nobody reports broken was not broken.

## What the chooser reads

- Every contract carries a `title` and a plain-language `description`, written in the words of the subject; those two are what a card says, each on one line. Dealt axis ids stay out of it: `tide-band-strata` names the machinery, and tells someone deciding between three pictures nothing they can act on.
- `--labels <labels.json>` is written on every run and carries the screen's own copy in the language the conversation runs in: `title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `zoom`, `close`, `typeRole`, `steer`, `done`, `failed`, plus `lang`, the language tag those words are written in. Running the picker without it is a defect: the script's English strings are a last resort for a missing key, and this session is the only side that knows what language the conversation runs in.
- `fallbackTitle` keeps its `{n}`, which stands for the seat's letter (A, B, C).
- All of it is written for someone who has never seen a design tool: short sentences, everyday words, no design or code term, and no sentence that repeats what a button already says.

## The signature

A contract may carry a chooser-only `signature`, so the card shows its material rather than describing it: the face as an `Aa` sample and each colour as a chip, with the words in the chip's tooltip.

- `typeface` is the CSS font-family that sets the sample, and `fontHref` an https stylesheet when that face needs one.
- `colors` holds up to four `{role, name, value}`, where `role` names the job and `name` names the colour itself, both in the user's language, with `value` shown beside them as the code to copy.
- Both are written in the plainest words a child would use, so `donkerblauw` and `zachtgeel`, never a paint, brand, or design name such as `Terracotta`, `IJsblauw`, or `Inktzwart`.
- The face's name is read from the contract's own `type.display.family`; two places to write a typeface is two places to get it wrong.

## What the comp owes the screen

Each comp is a sketch of one direction, not a build: one screenful of the real surface, with real content, in one self-contained HTML file and no build step. Fidelity scales to what the click decides, the way a wireframe answers a layout question and polish answers a polish question: sketch fidelity carries the composition, and material fidelity goes only where the direction's difference lives, its ground, its type, its palette, its one technique. The picker shows every comp whole and live at one shared scale, so hover and motion run in the grid, and enlarging one fills the viewport with that comp alone.

- A comp is a fragment, not a document: its own markup and its own `<style>`, with no doctype, no `<head>`, no viewport tag and no reset. The picker injects those and injects nothing else, so the ground, the type, the palette and the one technique stay where they belong, inside the comp. A file that does open with `<!doctype` or `<html>` is served untouched, which is the escape hatch for a direction whose technique needs the document itself.
- The budget is 180 lines of HTML and CSS per comp, the content the frame shows and nothing past it, the rest state alone, and the one frame size `--frame` names. Past the budget, cut regions, never the direction.
- A comp fills its frame and stops at its edge: nothing below the fold and no region that scrolls, because the picker shows the frame and nothing past it. Composed inside the whole frame, a comp leaves no empty band for the chooser to read as part of the direction.
- A click in a comp shows motion and changes nothing: hover, press, and the transition the contract records are the demo, and JavaScript exists for that motion alone. Navigation, a working tab, filter, form, or toggle, or any state that alters what the page shows is a build, not a comp. The exception is the contract's own technique, a canvas or generative motion, which runs because it is the direction.

## Judgment

- A human selection of a rendered variant outranks the recommendation this skill seated first.
- The chooser's own language outranks the script's English last resort, and plain words outrank exact ones.
- A comp that renders outranks a more ambitious comp that does not; that is a reason to build plainly, not to render before the picker.
- A direction shown early outranks a comp polished before anyone asked for polish.
- Every card complete at once outranks the first card sooner: a chooser who watches seats fill waits twice.
- Real content outranks placeholder material: a direction judged on lorem is a direction nobody judged.
- The picker decides nothing and writes nothing; `direction.mjs --select` freezes the answer.
