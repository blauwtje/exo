# Direction Preview

Put the built directions in front of the person deciding as real comps at full size, one at a time, checked first, and let one click settle it. The enemy is a comparison nobody can judge: near-identical sketches that differ in one colour, a scaled thumbnail, or a broken comp the chooser is the first to see. The overcorrection is a preview so staged that the chooser picks a presentation instead of a direction.

This file owns the screen that asks for a direction; the `visual-direction` reference owns what a direction is.

## Contents

- [Before the picker](#before-the-picker)
- [What the comp owes the screen](#what-the-comp-owes-the-screen)
- [Stack comps](#stack-comps)
- [After the click](#after-the-click)
- [The command](#the-command)
- [What the chooser reads](#what-the-chooser-reads)
- [The signature](#the-signature)
- [Judgment](#judgment)

## Before the picker

- Each comp's builder runs `pick.mjs --check --variant <n>` on its own comp before the picker starts, because the chooser must never be the first to see a broken comp.
- `pick.mjs --check` renders each comp full page at 390 and 1440 wide through the capture and check-ui scripts, and writes the PNGs and a `check-ui.json` under each variant's `checked/`.
- Read every capture at both widths and every `check-ui.json` with the Read tool; a capture nobody viewed checks nothing.
- Fix each fault they show: horizontal overflow, a section cut off or missing, overlapping text, unreadable contrast, an empty band, a broken image or font.
- Rerun `pick.mjs --check` after every fix, and read the new captures, until none of those faults is left.
- The picker refuses to start, exit 2, while a variant lacks a capture at 390 or 1440 newer than its own files, so any edit after a check needs another check.
- Only then write the labels file and start `pick.mjs` in a background `exec_command` session polled with `write_stdin`.
- When `pick.mjs --check` exits 3, no capture engine exists: start the picker with `--unchecked` and tell the user in one line that the comps were not checked.
- `--unchecked` answers that exit 3 alone, never a failing or unread check.
- Write each comp's source directly from its contract: no template, generator, or patch script stands between the two, because a pipeline costs the minutes it was meant to save.
- A comp the chooser still reports broken is repaired after the click, checked again, and the picker reruns once.
- Run the picker only when the user asks to see or choose directions, after the message that names its price as `## Asking` of the `intake` reference says.
- Every other visual choice belongs to the `sketch-tab` reference.

## What the comp owes the screen

Each comp is the real surface in one direction, not a sketch: real content, built the way Build would build it. The picker shows one comp at a time at full width on a dark neutral ground, never scaled, under tabs A, B and C. The open direction's description sits under the strip, and the comp scrolls inside its own frame, so its hover and motion run as the chooser would meet them.

- Directions differ in layout, colour, typeface and shape at once, because directions that share a layout read as one look in another paint.
- A direction comp is the surface's first screen: what a visitor meets before scrolling, every region of it complete.
- When the user asks to see directions whole, a comp holds every section of the real page in the page's order.
- Build each comp with the project's stack as the `stack` reference picks it: its framework, styling mechanism, component layer and font packages.
- A project with no pages yet takes that reference's scaffold before the first comp, because the scaffold fixes no look.
- A project whose pages are plain HTML gets a plain HTML comp: a fragment with its own markup and `<style>`, and no doctype, `<head>`, viewport tag or reset.
- The picker injects a fragment's document parts and nothing else, so the ground, the type, the palette and the one technique stay inside the comp.
- Load every face the direction names from its real font files, never a system fallback or a monospace stand-in, because the face is half the direction.
- Every rule of the `build-pass` reference holds in a comp: the character, the build floor and the slop tropes, plus the motion bar of the `motion` reference.
- A comp has no line budget; it is as long as its screen needs.
- A comp is responsive: it reflows between 390 and 1440 wide, with no horizontal scroll at either width.
- Compose every region across its full width, so no empty band reads as part of the direction.
- A click in a comp shows motion and changes nothing: hover, press, and the transition the contract records are the demo, and JavaScript exists for that motion alone.
- Navigation, a working tab, filter, form, or toggle, or any state that alters what the page shows, is a build, not a comp.
- The exception is the contract's own technique, a canvas or generative motion, which runs because it is the direction.

## Stack comps

- A stack comp runs on the project's own dev server, not as a build under `$RUN`, so the chosen comp is code Build keeps.
- Before the builders start, write a direction entry beside the app's own: a page that mounts the folder `src/directions/<n>/` its `?direction=<n>` names.
- That entry leaves the app's own entry and routes untouched, so the app runs unchanged while the directions are compared.
- In a Vite project the entry is `directions.html` at the project root, loading a `src/directions/main.tsx` that mounts the `import.meta.glob('./*/index.tsx')` match the query names; Vite serves it in dev with no config.
- Start the dev server in a background `exec_command` session polled with `write_stdin`, then pass `pick.mjs` `--url "http://localhost:<port>/directions.html?direction={n}"` and `--source "src/directions/{n}"`.

## After the click

- The chosen comp is Build's first screen: move its folder to where the surface lives and mount it from the app's own entry.
- Then delete the other direction folders and the direction entry, because an unchosen comp is not production code.
- Build adds the rest of the surface, its states and the motion bar around that screen and never rewrites it, because the chooser picked what they saw.
- A plain HTML comp's markup and styles move into the page the same way.

## The command

```
node scripts/pick.mjs --check --comps <dir> --contracts <contracts.json> [--variant <n>]
node scripts/pick.mjs --comps <dir> --contracts <contracts.json> \
  --recommend <n> --recommend-note <one sentence> --labels <labels.json>
```

Both take `--url <template> --source <template>` for stack comps.

- `--comps` is the directory the seats live in: the contracts file decides how many, and `variant-<n>/index.html` plus its own assets fills seat `n`.
- `{n}` in `--url` and `--source` becomes the variant index; the check renders the URL, audits and dates the source folder, and still writes under `--comps`.
- `--variant <n>` checks that one comp alone.
- `--check` exits 2 naming a missing `index.html` or a dev server that does not answer, and prints one JSON line per variant: its captures, whether they are full page, its finding count, and its `check-ui.json` path.
- The picker waits until every seat's file exists or its URL answers, and each has a fresh capture at both widths, then prints the URL on stderr and opens the tab.
- `--check` writes only under each variant's `checked/`, the picker writes nothing, and neither installs a dependency.
- The page shows one tab per seat with its letter, title, signature and any recommended badge, and the open tab's description on one line under the strip.
- The arrow keys or a seat's letter switch tabs, and the one Choose button answers for the open tab.
- `--recommend <n>` seats that variant first and badges it, and `--recommend-note` puts the reason above the tabs in one short everyday sentence.
- Always name this skill's own pick: a row of three with no opinion hands the work back.
- Each comp renders at the full width of the window by default.
- `--frame <width>x<height>` caps that width and centres the comp, ignoring the height, so `--frame 390x844` shows a phone-first surface at phone width.
- `--intrinsic` belongs to a size comparison alone, where each comp's own `meta.json` width sets its frame, because the width is the thing being compared.
- Exit 3 means no browser opened, not every comp landed, or no answer arrived within the 600 seconds; the `--recommend` variant is then the selection, and no question goes to the terminal.
- Exit 2 is a usage error or a comp without a fresh capture, and the message names what to fix.

## What the chooser reads

- Every contract carries a `title` and a plain-language `description`, written in the words of the subject; the title is what a tab says, and the description is its one line under the strip.
- The description says in one short sentence what sets this direction apart. Dealt axis ids stay out of it: `tide-band-strata` names the machinery, and tells someone deciding between three pages nothing they can act on.
- `--labels <labels.json>` is written on every run and carries the screen's own copy in the language the conversation runs in: `title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `tabs`, `typeRole`, `steer`, `done`, `failed`, plus `lang`, the language tag those words are written in.
- `tabs` is the tab strip's accessible name, which a screen reader announces.
- Running the picker without the labels file is a defect: the script's English strings are a last resort for a missing key, and this session is the only side that knows the conversation's language.
- `fallbackTitle` keeps its `{n}`, which stands for the seat's letter (A, B, C).
- All of it is written for someone who has never seen a design tool: short sentences, everyday words, no design or code term, and no sentence that repeats what a button already says.

## The signature

A contract may carry a chooser-only `signature`, so the tab shows its material rather than describing it: the face as an `Aa` sample and each colour as a chip, with the words in the chip's tooltip.

- `typeface` is the CSS font-family that sets the sample, and `fontHref` an https stylesheet when that face needs one.
- `colors` holds up to four `{role, name, value}`, where `role` names the job and `name` names the colour itself, both in the user's language, with `value` shown beside them as the code to copy.
- Both are written in the plainest words a child would use, so `donkerblauw` and `zachtgeel`, never a paint, brand, or design name such as `Terracotta`, `IJsblauw`, or `Inktzwart`.
- The face's name is read from the contract's own `type.display.family`; two places to write a typeface is two places to get it wrong.

## Judgment

- A human selection of a rendered variant outranks the recommendation this skill seated first.
- The chooser's own language outranks the script's English last resort, and plain words outrank exact ones.
- A comp the check shows clean at both widths outranks a more ambitious comp it shows broken: cut ambition before repairing a second time.
