# Stack

Build a page with no framework on a maintained component stack, so it ships tested components rather than hand-written look-alikes. The enemy is the empty folder filled with one hand-written HTML file: home-made buttons, a hand-drawn SVG chart, a thousand lines of bespoke CSS. The overcorrection is forcing this stack onto a project that already has one.

## Which stack

- Existing pages keep their stack, plain HTML included, and every rule below yields to it, because a second framework splits the codebase.
- A project with no pages and no UI framework in its manifest, an empty folder included, gets Vite, React, TypeScript, Tailwind CSS, shadcn/ui and lucide-react.
- In that project every package this file names counts as a dependency the manifest lists, so neither the reuse rules of route-skills' lean-code reference nor a build-on-the-platform rule holds one back.
- The plan names the package for each job its screens carry, because the build installs only what the plan names.

## Scaffold

- In that project, run `npx shadcn@latest init -t vite -b radix -p nova -n app -y`, then move the files of `app/`, its `.git` excepted, into the folder and remove `app/`, because the CLI refuses an existing destination.
- That one call writes Vite, React, TypeScript, Tailwind v4, the `@/` alias and lucide-react; set none of them up by hand.
- Fetch every component with `npx shadcn@latest add <name>...`, never hand-writing one the CLI ships, because a hand-written copy loses the Radix keyboard and focus behavior.
- Never add a block such as `dashboard-01` as the base, because a block brings its stock layout and the page reads as the template.
- Compose the layout from single components such as `sidebar`, `card`, `table` and `chart`.
- Load each font the plan names with `npm install @fontsource-variable/<family>`, or `@fontsource/<family>` when no variable build exists, imported in `src/index.css`.
- Never load a font from the Google Fonts CDN, because it adds a third-party request the page waits on.
- Point `--font-sans` and `--font-heading` in the `@theme inline` block at the plan's faces, replacing the preset's Geist import.

## Theme

A shadcn component in its fetched form reads as the template whatever the accent, so theme each from the plan's direction by editing the fetched file in place.

- The plan names the radius, the control height and every variant it adds, because the build themes only what the plan names.
- Set `--radius` from the direction, never the preset's value, and derive the field, control and surface radii from it.
- Replace every color token in `:root`, `--card` and `--popover` included, with the plan's tinted roles, because a preset value left in place reads as stock.
- Set control heights, padding and gaps in each fetched component from the plan's spacing scale, so density follows the direction, not the preset.
- Recut the `cva` base and variants in each fetched file: surface, edge, elevation, weight and press from the direction.
- Add a `cva` variant in the component's file per role the plan names, such as a status badge, not a `className` override per call site.
- Set heading, card title and table header type inside the fetched component from the plan's faces, weights and tracking.
- Theme every fetched component the screens show, because one stock component among themed ones still reads as the template.

## Which package for which job

Each job takes its package, because a hand-written one misses the focus, gesture and screen-reader work the package ships:

- **Charts:** `add chart`, Recharts inside `ChartContainer`, colored from `--chart-1` to `--chart-5` through `ChartConfig`; never a hand-drawn SVG or canvas chart.
- **Sparklines:** a Recharts `LineChart` or `AreaChart` with no axes, inside `ChartContainer`.
- **Tables:** the shadcn data table, `add table checkbox` plus `npm install @tanstack/react-table`, with column sorting, a filter input and a row-selection checkbox column.
- **Toasts:** `add sonner`, with one `<Toaster />` at the root.
- **Search and commands:** `add command`, which wraps cmdk.
- **Drawers on mobile:** `add drawer`, which wraps vaul.
- **Counters and key figures:** `npm install @number-flow/react`, rendering `<NumberFlow value={n} />`.
- **Layout, exit and spring animation:** `npm install motion`, imported from `motion/react`: `layout` and `layoutId`, `AnimatePresence` for exits, `type: "spring"` transitions.
- **Reduced motion:** wrap the app in `<MotionConfig reducedMotion="user">`, so every Motion animation honors the system setting.
- **Magic UI effects:** `add @magicui/<name>` only on a landing or marketing page, never on an app screen, because an effect there competes with the task.

## Preview

- Once the scaffold exists, this session starts `npm run dev > "$RUN/dev.log" 2>&1` in a background `exec_command` session polled with `write_stdin`, never a builder, because a TSX page does not open from a `file://` url.
- Wait for the url with a bounded loop, then read it from the log:

```bash
n=0; until grep -q 'http://localhost:' "$RUN/dev.log"; do n=$((n+1)); [ "$n" -gt 30 ] && { echo "dev server: no url"; exit 1; }; sleep 1; done
grep -o 'http://localhost:[0-9]*/' "$RUN/dev.log" | head -1
```

- Pass that url as `--url` to capture, check-ui and checkpoint, and as `URL` to every builder, because Vite takes the next free port when 5173 is busy.
- Stop the background task by killing its process before the report, because a server left running holds its port into the next run.

## Judgment

- The repository's stack outranks this file.
- A package or a single-file deliverable the user names outranks this file.
