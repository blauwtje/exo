# Direction Preview

Put the built directions in front of the person deciding, at a size where the type, the colour and the spacing can be read, and let one click settle it. The enemy is a comparison nobody can see: three page-sized pictures shrunk into a row, or taste polled in words the comps already answer. The overcorrection is a preview so staged that the chooser picks a presentation instead of a direction.

`visual-direction.md` owns what a direction is. This file owns the screen that asks for one.

## The command

```
node scripts/pick.mjs --comps <dir> --contracts <contracts.json> \
  --recommend <n> --recommend-note <one sentence> --labels <labels.json> --frame <w>x<h>
```

- `--comps` holds one `variant-<n>/index.html` per variant with its own assets, index-aligned with the contracts file. Nothing is written and no dependency is installed.
- `--recommend <n>` seats that variant first and badges it, and `--recommend-note` puts the reason inside that card in one short everyday sentence. This skill always names its own pick; a row of three with no opinion hands the work back.
- `--frame <width>x<height>` is the tile every comp renders in and the frame each comp was composed for: `390x844` for a phone-first surface, the default `1280x800` otherwise, so a phone comp is not a phone centred in a desktop tile.
- `--intrinsic` belongs to a size comparison alone, where each comp carries its own `meta.json`. It turns off the shared content window, because the frame size is then the thing being compared.
- Exit 3 means no browser opened or no answer arrived within the 600 seconds; the `--recommend` variant is then the selection, and no question goes to the terminal. Exit 2 is a usage error, and the flag it names is the flag to fix.

## Before the picker

The picker opens in the turn after the chooser accepts the offer the skill's `## Asking` section defines, and the only tool calls between that answer and the picker are reading this file, writing each comp, writing the labels file, and running the picker. Everything a comp might still need waits for the click, because a chooser waiting twenty minutes for a preview stops choosing.

- No `capture.mjs`, `inspect-render.mjs`, screenshot, or image read of a comp before the picker: the picker is the comps' first render and the chooser's eyes are the critique. A headless capture engine is not the chooser's browser either, so a repair made against it fixes a defect the chooser might never have seen.
- Write each `index.html` directly from its contract. No template, generator, build script, or patch script stands between the two; a pipeline costs the minutes it was meant to save.
- Run `pick.mjs` with the Bash tool's timeout raised to 600 seconds, the picker's own default, so the call blocks until the click instead of being moved to the background.
- A comp the chooser reports broken is repaired after the click and the picker reruns once; a comp nobody reports broken was not broken.

## What the chooser reads

- Every contract carries a `title` and a plain-language `description`, written in the words of the subject; those two are what a tile says. Dealt axis ids stay out of it: `tide-band-strata` names the machinery, and tells someone deciding between three pictures nothing they can act on.
- `--labels <labels.json>` carries the screen's own copy in the language the conversation runs in, never left to the built-in table: `title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `zoom`, `close`, `typeRole`, `steer`, `done`, `failed`. Whatever it omits falls back to `--lang`.
- `fallbackTitle` keeps its `{n}`, which stands for the seat's letter (A, B, C).
- All of it is written for someone who has never seen a design tool: short sentences, everyday words, no design or code term, and no sentence that repeats what a button already says.

## The signature

A contract may carry a chooser-only `signature`, so the tile shows its material rather than describing it.

- `typeface` is the CSS font-family that sets the sample, and `fontHref` an https stylesheet when that face needs one.
- `colors` holds up to four `{role, name, value}`, where `role` names the job and `name` names the colour itself, both in the user's language, with `value` shown beside them as the code to copy.
- Both are written in the plainest words a child would use, so `donkerblauw` and `zachtgeel`, never a paint, brand, or design name such as `Terracotta`, `IJsblauw`, or `Inktzwart`.
- The face's name is read from the contract's own `type.display.family`; two places to write a typeface is two places to get it wrong.

## What the comp owes the screen

Each comp is a sketch of one direction, not a build: one screenful of the real surface, with real content, in one self-contained HTML file and no build step. Fidelity scales to what the click decides, the way a wireframe answers a layout question and polish answers a polish question: sketch fidelity carries the composition, and material fidelity goes only where the direction's difference lives, its ground, its type, its palette, its one technique. The picker crops every tile to a single window around where the comps put their text, media and controls, so the part being judged fills the tile instead of a page shrunk past reading.

- The budget is 200 lines of HTML and CSS per comp, the content the window shows and nothing past it, the rest state alone, and the one frame size `--frame` names. Past the budget, cut regions, never the direction.
- A comp fills its frame and stops at its edge: nothing below the fold and no region that scrolls, because the enlarged view shows the whole comp at once and a taller comp is shown smaller, not scrolled.
- A click in a comp shows motion and changes nothing: hover, press, and the transition the contract records are the demo, and JavaScript exists for that motion alone. Navigation, a working tab, filter, form, or toggle, or any state that alters what the page shows is a build, not a comp. The exception is the contract's own technique, a canvas or generative motion, which runs because it is the direction.
- The window is one window for all of them, never one each, and never smaller than half the frame: a comparison survives only while the three are cropped alike.
- It follows content, not backgrounds. A comp whose ground fills the frame still gets a window around what it says.
- A comp that scatters a word into each corner is a comp with nothing to crop to, and it renders whole. Compose inside the frame and the window finds it.

## Judgment

- A human selection of a rendered variant outranks the recommendation this skill seated first.
- The chooser's own language outranks the built-in fallback wording, and plain words outrank exact ones.
- A comp that renders outranks a more ambitious comp that does not; that is a reason to build plainly, not to render before the picker.
- A direction shown early outranks a comp polished before anyone asked for polish.
- Real content outranks placeholder material: a direction judged on lorem is a direction nobody judged.
- The picker decides nothing and writes nothing; `direction.mjs --select` freezes the answer.
