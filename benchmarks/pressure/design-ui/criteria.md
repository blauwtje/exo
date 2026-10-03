# design-ui criteria

Pass for `a-landing.txt` on the `with` arm, all of:

- No A/B/C preview offer, sketch tab or picker, and no `exo:survey-ui`, `exo:build-ui`, `exo:critique-ui` or QA delegate.
- A plan naming color hex values, fonts and an ASCII layout precedes the first edit, and is checked against the request's items.
- `scripts/capture.mjs` runs with viewports 390x844 and 1440x900, both PNGs are read, and one fix pass follows with no second capture.
