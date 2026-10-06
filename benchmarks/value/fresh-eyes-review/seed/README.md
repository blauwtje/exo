# taskbook

A small task tracker. Tasks live in a JSON data file; `TaskStore` loads it, changes it and saves it back.

```
node src/cli.js [--file taskbook.json] <command>

  add <title> [--tags a,b] [--due <iso date>]
  list [--status open|done]
  show <id>
  done <id>
  rm <id>
  search <text>
  tags
  stats
  export csv|json
  remind
```

## Data file

```json
{
  "version": 1,
  "tasks": [
    { "id": 1, "title": "write report", "tags": ["work"], "status": "open",
      "dueAt": "2026-02-27T09:00:00.000Z", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

Deleting a task (`rm <id>`) removes it from the data file for good.

## Modules

- `src/store.js`: `TaskStore`, the only writer of the data file.
- `src/search.js`: text search over titles and tags.
- `src/tags.js`: tag counts and tag lookups.
- `src/stats.js`: the numbers `stats` prints.
- `src/export.js`: CSV and JSON dumps.
- `src/reminders.js`: open tasks past their due date.
- `src/cli.js`: the command line over all of them.

## Tests

`npm test`
