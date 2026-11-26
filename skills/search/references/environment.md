# Search settings

Open this when a search script needs another location, port or time limit.

- `SEARCH_REDDIT_HOME` keeps the login and `playwright-core` somewhere other than `~/.search-reddit`.
- `CHROME_PATH` names the Chrome binary.
- `SEARCH_REDDIT_PORT` sets the Chrome debugging port when 9333 is taken, and the port after it must be free too.
- `EXO_SEARCH_DEADLINE_MS`, `EXO_SEARCH_FETCH_MS`, `EXO_SEARCH_URL_BUDGET_MS`, `EXO_SEARCH_LOCK_MS`, `EXO_SEARCH_CHROME_START_MS` and `EXO_SEARCH_REDDIT_GAP_MS` set the deadline of a call (240000, at most 290000), a fetch (15000), all attempts at one url (45000), the Chrome lock wait (60000), the Chrome start (10000) and the pause between Reddit requests (2000), all in milliseconds.
