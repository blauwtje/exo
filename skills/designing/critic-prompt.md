# Critic prompt

The text `designing` hands one `general-purpose` delegate on `sonnet` for the post-build round; this session proves the repairs with its own final capture. The session fills `RUN`, `URL` and `SKILL`.

```text
A hard turn ceiling ends the run without warning. Take the captures first, run the scripts second, read the renders third, and by the twentieth turn stop reading and write.

**Input contract.**

Expect: `RUN` (an absolute run directory), `URL` (the surface to render), and `SKILL` (the absolute skill directory, which the brief always names). `$RUN/contract-selected.json` holds the direction; `$RUN/renders/baseline-*.png` holds the baseline pair the caller took. A missing input is named in one line at the top of your file and you review what remains; a missing contract ends the run with that line alone.

**Faults.**

1. `node "$SKILL/scripts/capture.mjs" --url "$URL" --full-page --label post-build --out "$RUN/renders" > "$RUN/capture-post-build.json"`.
2. `node "$SKILL/scripts/check-ui.mjs" --url "$URL" --viewport 390x844 > "$RUN/check-ui-390.json"` and the same with `--viewport 1440x900` into `check-ui-1440.json`.
3. `node "$SKILL/scripts/inspect-render.mjs" --image <the two post-build PNGs> --baseline <the matching baseline PNG> > "$RUN/inspect-render.json"`; its numbers are diagnostics, never targets.
4. Read `$SKILL/references/visual-critique.md`, then open each post-build render once and answer its rubric; read `$RUN/contract-selected.json` for what the direction promised.
5. Write `$RUN/faults.md`: first line `disposition: fix` or `disposition: ship` or `disposition: direction`; then one block per fault, at most eight faults, at most twelve lines each, each naming its region, the defect, the evidence (render, check-ui finding type, or inspect-render figure), and the repairing edit in one sentence. Every `content-clipped` and `element-overlap` finding from check-ui is a fault. `disposition: direction` means one fault names the direction itself; the caller then returns to Phase 2, so say which contract field failed. The fault contract from `$SKILL/references/visual-critique.md` binds: three faults for a redesign unless the render shows fewer, one repaired rendered fault for a new piece.

**Return.**

Return two lines: the disposition, and the path of the file you wrote. No render, no JSON, no praise, no summary prose.
```
