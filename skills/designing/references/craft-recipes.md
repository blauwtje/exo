# Craft Recipes

Build the selected direction with material the render can show: a ground with light in it, surfaces with edges and depth, type that carries a voice, and one authored moment of motion. The enemy is the assembled page — a flat neutral ground, one grey shadow under every card, a single family at one weight, a fade-up on every section. The overcorrection is stacking every shape below onto one surface until nothing leads.

Each recipe is a shape, not a value: every color, duration, and easing below stands for a token the direction contract fixed, and a shape that no contract field, subject observation, or brief sentence names stays out. Port a shape onto a repository's existing tokens and mixins rather than beside them.

## Ground

**Directional light** — the default for a ground the contract calls solid: one light source, two neighbours of the ground color, under 8° of hue between stops, so it never reads as a gradient background.

~~~css
background: linear-gradient(168deg,
  color-mix(in oklch, var(--ground) 94%, white) 0%,
  var(--ground) 46%,
  color-mix(in oklch, var(--ground) 92%, black) 100%);
~~~

**Mesh field** — when the contract names a gradient field: two or three off-center, low-chroma pools over the ground, none centered, none at full alpha; body text sits on a solid `--surface`, never on a pool.

~~~css
background:
  radial-gradient(60% 50% at 12% 8%, color-mix(in oklch, var(--accent) 35%, transparent), transparent 70%),
  radial-gradient(50% 60% at 88% 22%, color-mix(in oklch, var(--accent-2) 28%, transparent), transparent 72%),
  var(--ground);
~~~

**Grain** — a subject-derived texture (paper, print, film) the contract names; the overlay is a pseudo-element, so the ground stays one declaration and the texture one opacity token, perceptible at 390px and 1440px or removed.

~~~css
.ground::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  opacity: var(--grain-opacity); mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
~~~

## Surfaces

**Layered tinted shadow** — the soft-ambient-light grammar: three ramped layers tinted from the ink hue, offset downward, and no hairline border on the same surface.

~~~css
box-shadow:
  0 1px 2px -1px oklch(from var(--ink) l c h / 0.18),
  0 4px 10px -3px oklch(from var(--ink) l c h / 0.14),
  0 18px 36px -12px oklch(from var(--ink) l c h / 0.12);
~~~

**Top-edge highlight** — the one-pixel light that makes a raised surface read as material: `box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.14), var(--shadow-raised);`

**Glass** — the layered-translucency grammar, only over real changing content beneath it, with an opaque fallback.

~~~css
.glass { background: color-mix(in oklch, var(--surface) 62%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  box-shadow: inset 0 1px 0 oklch(100% 0 0 / 0.18); }
@supports not (backdrop-filter: blur(1px)) { .glass { background: var(--surface); } }
~~~

**Gradient edge** — an accent border that keeps the fill opaque and the radius intact.

~~~css
border: 1px solid transparent;
background:
  linear-gradient(var(--surface), var(--surface)) padding-box,
  linear-gradient(140deg, var(--accent), color-mix(in oklch, var(--accent) 30%, transparent)) border-box;
~~~

**Hard offset** — the neobrutalist grammar: `border: 2px solid var(--ink); box-shadow: var(--offset) var(--offset) 0 var(--ink);`, and the pressed state collapses the offset to zero with a matching `translate`.

## Motion

**Staged focal entrance** — the signature sequence `motion.md` allows: focal first, supporting groups after, content visible at rest so a failed animation hides nothing.

~~~css
.hero > * { animation: rise var(--dur-focal) var(--ease-out) both; }
.hero > :nth-child(2) { animation-delay: var(--stagger); }
.hero > :nth-child(3) { animation-delay: calc(var(--stagger) * 2); }
@keyframes rise { from { opacity: 0.001; transform: translateY(14px); } }
@media (prefers-reduced-motion: reduce) { .hero > * { animation: fade var(--dur-feedback) linear both; } }
@keyframes fade { from { opacity: 0.001; } }
~~~

**Exit shorter than entry** — `.panel { transition: transform var(--dur-panel) var(--ease-out), opacity var(--dur-panel); } .panel[data-state="closed"] { transition-duration: var(--dur-feedback); }`

## Type

**Voice from one variable family** — display and body from one file, apart on the width or weight axis: `h1 { font-variation-settings: "wdth" 85; font-weight: 750; letter-spacing: -0.02em; text-wrap: balance; }` over body at `font-weight: 400`.

**Prose that breaks well** — `p { text-wrap: pretty; max-inline-size: 65ch; hanging-punctuation: first last; }`, and `font-variant-numeric: tabular-nums` on any changing figure.

## Judgment

- The contract and the job gate in `motion.md` outrank every shape here; a shape with no contract field behind it is decoration.
- Body-text contrast on top of a ground shape outranks the shape.
- One shape per job: two atmosphere layers doing the same job is one too many.
- Existing repository tokens, mixins, and motion primitives outrank these shapes; port the shape onto them.
