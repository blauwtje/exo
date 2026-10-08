# Direction Preview

Show the built directions to the person deciding as real comps at full size, one at a time, checked first; one click settles it. The enemy is a comparison nobody can judge: near-identical sketches differing in one colour, a scaled thumbnail, or a broken comp the chooser sees first. The overcorrection is a preview so staged that the chooser picks a presentation instead of a direction.

Owns the screen that asks for a direction; the `visual-direction` reference owns what a direction is.

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

- Each comp's builder runs `pick.mjs --check --variant <n>` on its own comp before the picker starts; the chooser is never first to see a broken comp.
- `pick.mjs --check` renders each comp full page at 390 and 1440 wide through the capture and check-ui scripts; writes PNGs and a `check-ui.json` under each variant's `checked/`.
- Read every capture at both widths and every `check-ui.json` with the Read tool; an unviewed capture checks nothing.
- Fix each fault shown: horizontal overflow, section cut off or missing, overlapping text, unreadable contrast, empty band, broken image or font.
- After every fix → rerun `pick.mjs --check`, read the new captures, until none of those faults is left.
- Picker refuses to start (exit 2) while a variant lacks a capture at 390 or 1440 newer than its files; any edit after a check needs another check.
- Only then → write the labels file, start `pick.mjs` under the Bash tool's `run_in_background`.
- `pick.mjs --check` exits 3 = no capture engine: start the picker with `--unchecked`, tell the user in one line the comps were not checked.
- `--unchecked` → that exit 3 only, never a failing or unread check.
- Comp source → write directly from its contract, no template, generator or patch script between; a pipeline costs the minutes it was meant to save.
- Comp the chooser still reports broken → repair after the click, check again, rerun the picker once.
- Run the picker only when the user asks to see or choose directions, after the message naming its price per `## Asking` of the `intake` reference.
- Every other visual choice → `sketch-tab` reference.

## What the comp owes the screen

Each comp = the real surface in one direction, not a sketch: real content, built as Build would. Picker shows one comp at a time at full width on a dark neutral ground, never scaled, under tabs A, B and C. Open direction's description sits under the strip; the comp scrolls inside its own frame, so hover and motion run as the chooser would meet them.

- Directions differ in layout, colour, typeface and shape at once; directions sharing a layout read as one look in another paint.
- Direction comp = the surface's first screen: what a visitor meets before scrolling, every region complete.
- User asks to see directions whole → comp holds every section of the real page in page order.
- Build each comp with the project's stack as the `stack` reference picks it: framework, styling mechanism, component layer, font packages.
- Project with no pages yet → that reference's scaffold before the first comp; the scaffold fixes no look.
- Plain HTML project → plain HTML comp: a fragment with its own markup and `<style>`, no doctype, `<head>`, viewport tag or reset.
- Picker injects a fragment's document parts and nothing else, so ground, type, palette and the one technique stay inside the comp.
- Every face the direction names → load from its real font files, never a system fallback or monospace stand-in; the face is half the direction.
- Every `build-pass` rule holds in a comp (character, build floor, slop tropes), plus the motion bar of the `motion` reference.
- Comp has no line budget; as long as its screen needs.
- Comp is responsive: reflows between 390 and 1440 wide, no horizontal scroll at either width.
- Compose every region across its full width; no empty band reads as part of the direction.
- Click in a comp shows motion, changes nothing: hover, press and the transition the contract records are the demo; JavaScript exists for that motion alone.
- Navigation, a working tab, filter, form or toggle, or any state altering what the page shows = a build, not a comp.
- Exception: the contract's own technique, a canvas or generative motion, runs because it is the direction.

## Stack comps

- Stack comp → runs on the project's own dev server, not as a build under `$RUN`, so the chosen comp is code Build keeps.
- Before builders start → write a direction entry beside the app's own: a page mounting the folder `src/directions/<n>/` its `?direction=<n>` names.
- That entry leaves the app's own entry and routes untouched; app runs unchanged during comparison.
- Vite project → entry is `directions.html` at the project root, loading a `src/directions/main.tsx` that mounts the `import.meta.glob('./*/index.tsx')` match the query names; Vite serves it in dev with no config.
- Start the dev server under the Bash tool's `run_in_background`; pass `pick.mjs` `--url "http://localhost:<port>/directions.html?direction={n}"` and `--source "src/directions/{n}"`.

## After the click

- Chosen comp = Build's first screen: move its folder to where the surface lives, mount it from the app's own entry.
- Then delete the other direction folders and the direction entry; an unchosen comp is not production code.
- Build adds the rest of the surface, its states and the motion bar around that screen, never rewrites it; the chooser picked what they saw.
- Plain HTML comp → markup and styles move into the page the same way.

## The command

```
node scripts/pick.mjs --check --comps <dir> --contracts <contracts.json> [--variant <n>]
node scripts/pick.mjs --comps <dir> --contracts <contracts.json> \
  --recommend <n> --recommend-note <one sentence> --labels <labels.json>
```

Both take `--url <template> --source <template>` for stack comps.

- `--comps` = directory the seats live in: contracts file decides how many; `variant-<n>/index.html` plus its assets fills seat `n`.
- `{n}` in `--url` and `--source` → variant index; check renders the URL, audits and dates the source folder, still writes under `--comps`.
- `--variant <n>` → checks that one comp alone.
- `--check` exits 2 naming a missing `index.html` or an unanswering dev server; prints one JSON line per variant: captures, whether full page, finding count, `check-ui.json` path.
- Picker waits until every seat's file exists or URL answers and each has a fresh capture at both widths, then prints the URL on stderr and opens the tab.
- Arrow keys or a seat's letter switch tabs; the one Choose button answers for the open tab.
- `--recommend <n>` seats that variant first and badges it; `--recommend-note` puts the reason above the tabs in one short everyday sentence.
- Always name this skill's own pick; a row of three with no opinion hands the work back.
- `--frame <width>x<height>` caps that width and centres the comp, ignoring the height, so `--frame 390x844` shows a phone-first surface at phone width.
- `--intrinsic` → size comparison only, where each comp's own `meta.json` width sets its frame.
- Exit 3 = no browser opened, not every comp landed, or no answer within 600 seconds; the `--recommend` variant is then the selection, no question to the terminal.
- Exit 2 = usage error or a comp without a fresh capture; the message names what to fix.

## What the chooser reads

- Every contract carries a `title` and a plain-language `description` in the subject's words; title = tab text, description = its one line under the strip.
- Description → one short sentence on what sets this direction apart. Dealt axis ids stay out: `tide-band-strata` names machinery, tells the chooser nothing actionable.
- `--labels <labels.json>` is written on every run and carries the screen's own copy in the language the conversation runs in: `title`, `hint`, `recommended`, `fallbackTitle`, `choose`, `tabs`, `typeRole`, `steer`, `done`, `failed`, plus `lang`, the language tag those words are written in.
- `tabs` = tab strip's accessible name, announced by a screen reader.
- Picker without the labels file = defect: script's English strings are a last resort for a missing key; only this session knows the conversation's language.
- `fallbackTitle` keeps its `{n}`, the seat's letter (A, B, C).
- All of it → for someone who has never seen a design tool: short sentences, everyday words, no design or code term, no sentence repeating what a button says.

## The signature

A contract may carry a chooser-only `signature`, so the tab shows its material instead of describing it: face as an `Aa` sample, each colour as a chip, words in the chip's tooltip.

- `typeface` = CSS font-family setting the sample; `fontHref` = https stylesheet when that face needs one.
- `colors` holds up to four `{role, name, value}`: `role` names the job, `name` the colour itself, both in the user's language; `value` shows beside them as the code to copy.
- Both → plainest words a child would use, so `donkerblauw` and `zachtgeel`, never a paint, brand or design name such as `Terracotta`, `IJsblauw` or `Inktzwart`.
- Face name → read from the contract's own `type.display.family`, not written twice.

## Judgment

- A human selection of a rendered variant outranks the recommendation this skill seated first.
- The chooser's own language outranks the script's English last resort, and plain words outrank exact ones.
- Comp the check shows clean at both widths outranks a more ambitious comp it shows broken: cut ambition before repairing a second time.
