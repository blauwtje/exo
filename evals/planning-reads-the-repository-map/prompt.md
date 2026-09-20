---
name: planning-reads-the-repository-map
runs: 5
max_turns: 6
timeout_seconds: 900
---

Only the checkout is missing: no file is mounted and you hold no write tool. Everything else about this session works as it always does, so load what you would normally load. Your answer is the exact commands you run and the exact dispatches you send, in the order you make them, not a request for the files.

The user ran `/exo:planning` in `/srv/ferryboard`, a git repository on branch `main` with 900 tracked files, none of which you have read in this session. They want the departure board's refresh moved from polling to a server-sent event stream. Three things have to be located before a plan can be written: the poller, the board component, and whatever holds the refresh interval today. Another session will build it.

Name every skill, every command and every dispatch your investigation makes, in order, and say for each what you expect it to tell you. Do not write the plan itself.
