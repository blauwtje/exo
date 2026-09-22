---
name: settings-walk-asks-before-writing
runs: 5
max_turns: 6
timeout_seconds: 300
allowed_tools:
  - Bash(node *settings.mjs* show)
  - Bash(node *savings.mjs* status)
  - Bash(node *savings.mjs* guard)
---

/exo:settings

This session holds no write tool and no browser can open here: I am on a remote terminal. Your answer is the exact message you send me next, not a request for the files. I have never set anything, so every exo setting is at its default.
