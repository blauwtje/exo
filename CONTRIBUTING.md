# Contributing

## Set up

Clone the repository. You need Node 22 or newer and `bash` on `PATH`; the verifier and tests use only the Node standard library.

A marketplace added from `blauwtje/exo` on GitHub installs a cache copy, so an edit there is live only after a release; `claude --plugin-dir <your clone>` runs the working tree instead. A marketplace added from a local directory whose `marketplace.json` sets `"source": "./"` (this checkout is one) loads the plugin in place, with no cache copy: an edit is live after `/reload-plugins`.

## Codemap

- `CODE.md`: the code principles, read by the builder before it writes code.
- `BASE.md`: the shared rules on one page. Each skill and agent reads it first.
- `skills/`: one folder per skill, holding its skill file and, when a layout is too long for it, a `references/` folder.
- `agents/`: the `builder` and `researcher` prompts.
- `lib/`: the status line and the modules it imports, plus the helpers the checks use.
- `verify/`: the static checks that `verify.mjs` runs.
- `tests/`: the tests of the kept files, which reach into any module by path.
- `docs/`: specs and plans.

## Checks

| Command | What it runs |
|---|---|
| `npm run check` | The gate before any commit: `npm test`, then `node verify.mjs`. It ends with `SUMMARY PASS=n FAIL=n WARN=n UNRUN=n`. |
| `npm run validate:static` | The static checks only: `claude plugin validate --strict`, skill and agent frontmatter, local Markdown links, skill size, JavaScript syntax, invisible Unicode and personal paths. |
| `npm test` | The tests under `tests/`. |

CI runs `npm run check` on Node 22 and 24 on Ubuntu for every push to `main` and every pull request.

`npm test` loads `tests/clean-run-env.mjs` first, which strips the run variables so a test sees a clean environment.

## The standard

exo reads and works like the best-known Claude Code plugins and skill-authoring guides. That holds after every refactor, addition or removal, in two layers:

- **Mechanics, checked.** The `plugin shape` check (`verify/checks/plugin-shape.mjs`) fails a skill that does not open with a `#` title and a bold rule, holds no example in a code block, does not read `${CLAUDE_PLUGIN_ROOT}/BASE.md` or leaves a reference file unlinked; and an agent with no title or no report example. The frontmatter and size checks hold the 35-word description and the 500-line limit.
- **Voice, reviewed.** Before a change to a skill, an agent, `BASE.md`, `CODE.md` or the README lands, a fresh reviewer that did not write it compares the changed files with this standard, and the proven gaps are fixed in one pass.

## Hooks

exo ships no hooks. A hook is the last resort: encode a rule first as a check in `verify/`, a test or a script, and add a hook only when none of those can do the job. A hook does mechanical work only. Delete the instruction a hook replaces in the same change, because a text rule is often skipped while the hook runs anyway.

## Editing a skill

A skill is `skills/<name>/SKILL.md`, plus `references/*.md` for a layout too long to keep in it. Its frontmatter keeps `name`, `description`, `argument-hint`, `model` and `effort` where it needs them.

A skill reads like a page from an engineer who has done the job many times, not like a form:

- `# Title`, then one paragraph in the second person that opens with the skill's one rule in bold and says why it holds.
- Sections named after the parts of the job, such as `## Find the cause` or `## Watch`, not a fixed `## Steps`.
- An `## Excuses` table (You think, Do instead) where a shortcut tempts, and a `## When stuck` table (Situation, Do) where the work can stall.
- One example in a code block: a report, a file layout, or a Good and Bad pair.
- A `Next:` line naming the skill that usually follows, when one does.
- A reason only where a rule is not obvious. A rule `BASE.md` already states is not repeated.
- Full sentences with one idea each, and plain words over coined ones.

The `skill size` check (`verify/checks/skill-size.mjs`) enforces two rules:

- Rule 4: a skill file holds at most 500 lines. Other `.md` files in the folder, such as `references/`, are allowed and not counted.
- Rule 5: a skill folder holds only `.md` files, and its text names no file ending in `.mjs`, `.cjs`, `.js`, `.ts`, `.py`, `.sh`, `.bash`, `.rb`, `.go` or `.ps1`, unless the skill and file pair is on the exception list in `skill-size.mjs` with a reason. The list starts empty. Plain commands such as `git`, `gh`, `rg` and `curl` stay allowed.

A skill's description holds at most 35 words, names the words the user says, and keeps a `Use when ` clause and, where a neighbour skill is close, a `Not for` clause, because a trigger on a fact nobody knows when the request arrives leaves the model to guess. The frontmatter check enforces the word limit.

A skill whose work leaves the machine (a push, pull request or merge) runs only on the authorization its body names. `ship` asks before each push, pull request or merge.

Change a skill only after a real session that went wrong, and then remove something rather than add something.

## How a skill dispatches work

- Two roles are plugin agents under `agents/`, `builder` and `researcher`, because an agent file fixes a tool list, a model, an effort and a turn limit. The lead sends one fresh agent per separate job with file paths in the prompt, and runs jobs in parallel only when they share no file.
- Every scratch file lives in `<scratch>`, defined in `BASE.md`, and the lead names the file in each agent prompt.
- A subagent takes its model and effort from its agent file's frontmatter. A dispatch passes the Agent tool's `model` or `effort` only where a skill says so, such as the second attempt in `build`.
- The builder's report starts with one status, `DONE`, `BLOCKED`, `NEEDS ANSWER` or `PLAN WRONG`, defined once in `agents/builder.md`.
- Each agent sets `maxTurns` in its frontmatter, and the harness ends a delegate at that turn.

`docs/` is gitignored and holds only plans and research.

## Releasing

A release is cut weekly, not per merge: a scheduled run every Monday 06:00 UTC cuts it when `## Unreleased` holds an entry, and `gh workflow run release.yml` (or the Run workflow button on the Actions page, optionally with `-f level=patch|minor|major`) cuts one sooner. A scheduled run uses level `auto`, which reads the level off `## Unreleased`. `.github/workflows/release.yml` runs only on `main`. It checks with `npm run release-pending` whether `## Unreleased` holds an entry; if so it runs `npm run check` and `npm run bump`, commits `chore(release): <version>`, tags `v<version>`, pushes both and publishes the GitHub Release from `npm run release-notes`. With nothing under `## Unreleased` it cuts no release.

A change the user should read first gets at most three bold lead sentences under `### Highlights` in `## Unreleased`, in the commit that records it and not in a release commit; entries collect under `## Unreleased` until the next release. The release push uses `GITHUB_TOKEN`, which starts no further workflow, so the release commit does not release itself. After a release, `claude plugin marketplace update blauwtje` and `claude plugin update exo@blauwtje` install it locally; the marketplace compares only the manifest version, so an unbumped release installs as a no-op.
