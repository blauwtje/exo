# Setup map

Write the setup page's map so every setting shows its current value and keeping it costs one click. The enemy is a map whose recommended answer changes a value, which turns Go into a change the user never read. The overcorrection is an answer the scripts would reject: offer only the values each script accepts.

## The run folder

`RUN="$(git rev-parse --git-dir)/exo/setup"`, or a temp directory outside a git repository. It holds `map.json` and `questions/`, and nothing in it is committed.

## The map file

Write `$RUN/map.json` whole before each `--ask`. The first write asks `scope`:

```json
{
  "lang": "en",
  "goal": "Set up exo the way you work. The first answer always keeps what you have.",
  "asked": "scope",
  "words": {
    "mapTitle": "All settings",
    "place": "Setting {n}, {k} still open",
    "you": "You chose",
    "exo": "Follows the counter",
    "go": "Keep the rest",
    "goGives": "Every setting still open keeps its current value.",
    "reviewQuestion": "Save these settings?",
    "done": "Yes, save them",
    "doneGives": "exo writes only the values you changed."
  },
  "decisions": [
    {
      "id": "scope", "name": "Where the exo settings apply", "state": "open",
      "question": "Where should your exo settings apply?",
      "changes": "It decides whether the next three settings hold in every repository or only in this one.",
      "options": [
        { "id": "global", "label": "Every project", "gives": "Your choice holds everywhere; you confirm it once in /config.", "recommended": true },
        { "id": "project", "label": "This repository, for everyone", "gives": "Everyone who clones it gets it once .claude/exo.json is committed." },
        { "id": "local", "label": "This repository, only me", "gives": "Only you, only here; the file stays out of git." }
      ]
    },
    { "id": "specs", "name": "Where specs go", "state": "waits", "waitsOn": "scope" },
    { "id": "replies", "name": "How replies read", "state": "waits", "waitsOn": "scope" },
    { "id": "interview", "name": "Where shaping asks", "state": "waits", "waitsOn": "scope" },
    { "id": "counter", "name": "Savings counter", "state": "open" },
    { "id": "guard", "name": "Read guard", "state": "waits", "waitsOn": "counter" },
    { "id": "guardLines", "name": "Big-file limit", "state": "waits", "waitsOn": "counter" }
  ]
}
```

- `lang`, `goal`, `words`, every `name`, `question`, `changes`, `label` and `gives` are written in the user's language.
- Each setting's `changes` names its current value and the layer the `show` block printed for it, such as `now docs, from the default`.
- A decision waiting on one just closed turns `open`, and the next `asked` is the first open one in the order above.

## Each setting

Every setting but `scope` offers its current value first, as `{ "id": "keep", "label": "Keep <value>", "recommended": true }` with that value's `gives`, then every other value below, each with its value as its `id`.

| Setting | Question | Values and what each gives |
|---|---|---|
| `specs` | Where should a spec go when exo shapes a change? | `docs`: a file under docs/specs in the repository. `issues`: a GitHub issue. `both`: a file plus a linked issue. |
| `replies` | How should exo write its replies? | `tight`: short, no preamble, recap or filler. `standard`: full prose. |
| `interview` | Where should shaping ask its questions? | `chat`: in the conversation, answered with a digit. `page`: in a browser tab like this one, answered with a click. |
| `counter` | Should exo count what it costs? | `on`: the cost shows in the status line. `off`: no counting, no status line segment and no read guard. |
| `guard` | Should exo refuse to read a big file whole? | `on`: it reads the part it needs. `off`: any file may be read whole. |
| `guardLines` | From how many lines is a file big? | `200`, `400` (the default) and `800`, each: files over that many lines count as big. A typed whole number of at least 1 is also an answer. |

`issues` and `both` are left out when the loop's first step found no working GitHub route. A value that is the current one appears only as `keep`.

## Judgment

- The current value outranks the default as the recommended answer.
- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
