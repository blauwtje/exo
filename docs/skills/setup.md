# setup

Walks you through every exo setting on one page and saves only what you change.

## When it fires

Only when you run `/exo:setup`.

## What you get

- A browser page with every setting, its current value, and one question at a time answered with a click; without a browser, the same questions in the chat.
- Keeping what you have is always the first answer, and Keep the rest ends the walk at any point.
- A review of every change before anything is saved, then one line per saved value and where it lives.
- A value for every project is named for you to pick in `/config`, because that file belongs to the harness.

## Where its rules live

`skills/setup/SKILL.md`, with the page's map in `skills/setup/references/setup-map.md`. It writes through the settings and savings scripts, never by hand.
