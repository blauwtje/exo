# Setup walk

Walk every setting through one page in rounds, and write only what the user changed once the review confirms. The enemy is a map whose recommended answer changes a value, which turns Go into a change the user never read. The overcorrection is an answer the scripts would reject: offer only the values each script accepts.

## Contents

- [The run folder](#the-run-folder)
- [The rounds](#the-rounds)
- [The map file](#the-map-file)
- [Each setting](#each-setting)
- [Judgment](#judgment)

## The run folder

`RUN="$(git rev-parse --git-dir)/exo/setup"`, or a temp directory outside a git repository. It holds `map.json` and `questions/`, and nothing in it is committed.

## The rounds

`<page>` stands for the page command the skill's `## The walk` names.

1. **Check the issue route.** Run `git remote get-url origin` and `gh auth status`. Offer `issues` and `both` only when origin is on GitHub and both pass, because either answer fails at the first spec otherwise.
2. **Write the map** that `## The map file` below describes, in the user's language. Each setting's first answer keeps its current value and is the recommended one, so Go keeps every setting still open.
3. **Serve the page once** under the Bash tool's `run_in_background`: `<page> --serve "$RUN/questions" --map "$RUN/map.json" 2> "$RUN/page.log"`.
4. **Ask in rounds** with `<page> --ask "$RUN/questions" --map "$RUN/map.json" > "$RUN/answer.json"`. A round asks every open setting. After each answer, close each answered setting as `you` with its `round`, open the settings that waited on one just closed, raise `round`, rewrite the map and ask again. A `go` answer closes every open setting on its keep answer.
5. **Close what the counter decides.** A counter answered `off` closes the guard and its line limit as `exo`, because the counter's off switch stops the guard as well.
6. **Fall back to the chat** on exit 3, and at once when a step before it cannot run, such as a denied map write or no browser to open: ask each remaining setting in its own message, in the question shape, and never pick an answer for the user. Exit 2 names the map field to repair.
7. **Review before writing.** With every setting closed, write the map with no open setting and ask once more: `done` confirms, and `reopen` or typed words return the settings they name as the next round. In the chat, list the changes and wait for a yes.
8. **Write only the changes, then report.** Use the commands under `## The write commands` in the skill, and on a rejection relay it as printed and write nothing after it, because the user confirmed the set as a whole. Report one line per changed value and where it now lives.

## The map file

Write `$RUN/map.json` whole before each `--ask`. The first round asks `scope` and `counter`, the two settings that wait on nothing:

```json
{
  "lang": "en",
  "goal": "Set up exo the way you work. The first answer always keeps what you have.",
  "round": 1,
  "words": {
    "mapTitle": "All settings",
    "round": "Round {r} · {k} settings still open",
    "question": "Setting {n}",
    "you": "You chose",
    "exo": "Follows the counter",
    "go": "Keep the rest",
    "goGives": "Every setting still open keeps its current value.",
    "review": "Save these settings?",
    "done": "Yes, save them",
    "changeMarked": "Change what I marked"
  },
  "decisions": [
    {
      "id": "scope", "name": "Where the exo settings apply", "state": "open", "number": 1,
      "question": "Where should your exo settings apply?",
      "changes": "It decides whether the next three settings hold in every repository or only in this one.",
      "why": "One choice then holds wherever you work.",
      "options": [
        { "id": "global", "label": "Every project", "gives": "Your choice holds everywhere; you confirm it once in /config.", "recommended": true },
        { "id": "project", "label": "This repository, for everyone", "gives": "Everyone who clones it gets it once .claude/exo.json is committed." },
        { "id": "local", "label": "This repository, only me", "gives": "Only you, only here; the file stays out of git." }
      ]
    },
    { "id": "specs", "name": "Where specs go", "state": "waits", "waitsOn": "scope" },
    { "id": "replies", "name": "How replies read", "state": "waits", "waitsOn": "scope" },
    { "id": "interview", "name": "Where define-scope asks", "state": "waits", "waitsOn": "scope" },
    {
      "id": "counter", "name": "Savings counter", "state": "open", "number": 2,
      "question": "Should exo count what it costs?",
      "changes": "Now on, from the default.",
      "why": "It keeps what you have now.",
      "options": [
        { "id": "keep", "label": "Keep on", "gives": "The cost shows in the status line.", "recommended": true },
        { "id": "off", "label": "off", "gives": "No counting, no status line segment and no read guard." }
      ]
    },
    { "id": "guard", "name": "Read guard", "state": "waits", "waitsOn": "counter" },
    { "id": "guardLines", "name": "Big-file limit", "state": "waits", "waitsOn": "counter" }
  ]
}
```

- `lang`, `goal`, `words`, every `name`, `question`, `changes`, `why`, `label` and `gives` are written in the user's language.
- Each setting's `changes` names its current value and the layer the `show` block printed for it, such as `now docs, from the default`, and the `why` of a keep answer says it keeps what the user has now.
- A setting waiting on one just closed turns `open` and takes the next `number` in the next round, in the order above.

## Each setting

Every setting but `scope` offers its current value first, as `{ "id": "keep", "label": "Keep <value>", "recommended": true }` with that value's `gives`, then every other value below, each with its value as its `id`.

| Setting | Question | Values and what each gives |
|---|---|---|
| `specs` | Where should a spec go when exo shapes a change? | `docs`: a file under docs/specs in the repository. `issues`: a GitHub issue. `both`: a file plus a linked issue. |
| `replies` | How should exo write its replies? | `tight`: short, no preamble, recap or filler. `standard`: full prose. |
| `interview` | Where should define-scope ask its questions? | `chat`: in the conversation, answered with a digit. `page`: in a browser tab like this one, answered with a click. |
| `counter` | Should exo count what it costs? | `on`: the cost shows in the status line. `off`: no counting, no status line segment and no read guard. |
| `guard` | Should exo refuse to read a big file whole? | `on`: it reads the part it needs. `off`: any file may be read whole. |
| `guardLines` | From how many lines is a file big? | `200`, `400` (the default) and `800`, each: files over that many lines count as big. A typed whole number of at least 1 is also an answer. |

`issues` and `both` are left out when step 1 of `## The rounds` found no working GitHub route. A value that is the current one appears only as `keep`.

## Judgment

- The current value outranks the default as the recommended answer.
- An answer the scripts reject is never offered, even when the user typed it: ask that setting again with the accepted values.
- The user's typed words outrank the click they came with.
