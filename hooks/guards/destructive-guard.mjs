#!/usr/bin/env node
// PreToolUse guard on Bash: denies a command that deletes a container, volume,
// database or credential. Such a delete is often reached for to get past a
// blocked state, and the state is evidence while the data behind it is often the
// only copy. Git deletions live in the git guard; this guard leaves them alone.
// Stands down when the `guards` setting is `off`.
//
// The command is split into segments at `;`, `&`, `|` and line breaks found in
// the blanked command (`blankCommandText`), so an operator inside a quoted string
// splits nothing. The command word of a segment is read from the blanked text, so
// a word in a commit message or a heredoc body is not a command. Arguments are
// read from the raw segment, because SQL in `psql -c "..."` and a quoted path
// are arguments that the blanking hides. SQL counts only in a pipeline that runs
// a database client, read from the pipeline's arguments and heredoc bodies, so
// `--truncate` or a note about dropping a table passes.
// Ceiling: the command string is matched, not parsed, so a command assembled
// from variables at run time reads as written; SQL a client reads from a file
// (`psql -f`, `< drop.sql`) is not seen; `|&` ends a pipeline.
// A fault reading the input exits 0 with no output; the guard never exits 2.

import { blankCommandText, HEREDOC_OPERATOR } from './command-text.mjs';
import { isProcessEntry, runBashGuard } from './guard-runner.mjs';

const SEGMENT_SEPARATOR = /[;&|\n]/g;
const START = '(?:^|[ (])';
const ENGINE = '(?:docker|podman)';
// A database client that runs the SQL it is given, also after a path, `sudo`,
// an environment assignment or `docker exec`.
const SQL_CLIENT = /(?:^|[ (/])(?:psql|mysql|mariadb|sqlite3|duckdb)(?: |$)/;
// A heredoc operator in the blanked text; `<<<` is a here-string, read as an argument.
const HEREDOC_START = /(?<!<)<<(?!<)/g;

const CREDENTIAL_REASON = 'destructive-guard: deleting a credential file locks the user out, and the secret often exists nowhere else. Report the path and ask the user.';
const DATABASE_FILE_REASON = 'destructive-guard: deleting a database file deletes the only copy of its data. Ask the user.';

// A rule matches the command word on the blanked segment and, when `argument`
// is set, the arguments on the raw segment. `docker stop`, `docker rmi` and a
// plain `compose down` stay allowed: a stop is reversible and an image is
// re-pullable.
const SEGMENT_RULES = [
  {
    command: new RegExp(`${START}${ENGINE} +(?:container +|compose +)?rm(?: |$)`),
    reason: 'destructive-guard: removing a container destroys its writable layer and everything in it that is not on a volume. Stop it instead, or report the container and ask the user.'
  },
  {
    command: new RegExp(`${START}${ENGINE} +volume +(?:rm|prune)(?: |$)`),
    reason: 'destructive-guard: a volume holds the only copy of its data. Report the volume and ask the user.'
  },
  {
    command: new RegExp(`${START}${ENGINE} +(?:system|container) +prune(?: |$)`),
    reason: 'destructive-guard: a system or container prune removes stopped containers and unused volumes across the whole machine, including ones from other projects. Ask the user.'
  },
  {
    command: new RegExp(`${START}(?:${ENGINE} +compose|docker-compose|podman-compose)(?: +(?:-f|--file) +[^ ]+)* +down(?: |$)`),
    argument: /(?:^| )(?:-v|--volumes)(?: |$)/,
    reason: 'destructive-guard: compose down with --volumes deletes the project\'s volumes and the data in them. Run it without --volumes, or ask the user.'
  },
  // A deployment or pod delete is routine and stays allowed; a namespace, a
  // claim and --all are not.
  {
    command: new RegExp(`${START}kubectl(?: +[^ ]+)* +delete(?: |$)`),
    argument: /^.*?kubectl(?: +[^ ]+)*? +delete +.*(?:\b(?:pvc|persistentvolumeclaims?|namespaces?|ns)\b|(?:^| )--all(?: |$))/,
    reason: 'destructive-guard: deleting a namespace, a persistent volume claim or everything in a namespace destroys data the cluster does not back up. Name what should go and ask the user.'
  },
  {
    command: new RegExp(`${START}dropdb(?: |$)`),
    reason: 'destructive-guard: dropdb deletes the database and everything in it. Ask the user.'
  },
  {
    command: new RegExp(`${START}mysqladmin(?: +[^ ]+)* +drop(?: |$)`),
    reason: 'destructive-guard: mysqladmin drop deletes the database and everything in it. Ask the user.'
  },
  {
    command: /(?:prisma +migrate +reset|drizzle-kit +drop|db:drop)/,
    reason: 'destructive-guard: this command drops and recreates the database, discarding every row in it. Ask the user.'
  },
  {
    command: new RegExp(`${START}rm(?: |$)`),
    argument: /\.(?:db|sqlite|sqlite3)["']?(?: |$)/,
    reason: DATABASE_FILE_REASON
  },
  // A credential directory matches on its prefix, because the file inside it
  // carries any name; a credential file matches on its whole name.
  {
    command: new RegExp(`${START}rm(?: |$)`),
    argument: /(?:\.(?:ssh|aws)(?:\/|["']?(?: |$))|\.config\/gh)/,
    reason: CREDENTIAL_REASON
  },
  {
    command: new RegExp(`${START}rm(?: |$)`),
    argument: /(?:\.git-credentials|\.netrc|\.pem|\.key|\.env(?:\.[^ "']+)?)["']?(?: |$)/,
    reason: CREDENTIAL_REASON
  },
  {
    command: new RegExp(`${START}security +delete-(?:generic-password|internet-password|keychain)(?: |$)`),
    reason: 'destructive-guard: deleting a keychain entry destroys the only copy of that secret. Ask the user.'
  },
  {
    command: new RegExp(`${START}gh +auth +logout(?: |$)`),
    reason: 'destructive-guard: gh auth logout removes the stored GitHub token and ends every gh command in this session. Ask the user.'
  },
  {
    command: new RegExp(`${START}chezmoi +(?:destroy|forget)(?: |$)`),
    reason: 'destructive-guard: chezmoi destroy deletes the target file and chezmoi forget drops it from the source. Ask the user.'
  }
];

// A DDL statement reaches the database the same way from `psql -c`, `mysql -e`,
// a sqlite3 argument, a pipe or a heredoc, so it is matched in the text a client
// pipeline is fed rather than per client.
const SQL_RULES = [
  {
    argument: /(?:^|[^a-z_])drop\s+(?:database|schema|table)(?:\s|$)/i,
    reason: 'destructive-guard: dropping a database, schema or table deletes data that is often the only copy. Ask the user, or put it in a migration the user approves.'
  },
  {
    argument: /(?:^|[^a-z_])truncate\s+(?:table\s+)?[a-z_"`]/i,
    reason: 'destructive-guard: TRUNCATE empties a table and cannot be undone. Ask the user.'
  }
];

// Pairs the blanked and the raw text of each segment, grouped into pipelines:
// a lone `|` joins a segment to the next, `||` does not. Blanking keeps every
// character position, so the separators found in one cut both.
function pipelinesOf(command) {
  const blanked = blankCommandText(command);
  const pipelines = [[]];
  let start = 0;
  for (const separator of [...blanked.matchAll(SEGMENT_SEPARATOR), { index: blanked.length }]) {
    const end = separator.index;
    pipelines.at(-1).push({ blanked: blanked.slice(start, end), raw: command.slice(start, end), start });
    const piped = blanked[end] === '|' && blanked[end - 1] !== '|' && blanked[end + 1] !== '|';
    if (!piped) pipelines.push([]);
    start = end + 1;
  }
  return pipelines;
}

function segmentReason(segment) {
  for (const rule of SEGMENT_RULES) {
    if (!rule.command.test(segment.blanked)) continue;
    if (!rule.argument || rule.argument.test(segment.raw)) return rule.reason;
  }
  return null;
}

// The body of the heredoc whose operator is at `index`: the lines from `from`, or
// the line after the operator's when later, up to the delimiter line. `end` is
// where the next heredoc on the same line starts.
function heredocBody(command, index, from) {
  HEREDOC_OPERATOR.lastIndex = index;
  const match = HEREDOC_OPERATOR.exec(command);
  const lineEnd = command.indexOf('\n', index);
  if (!match || lineEnd === -1) return { text: '', end: from };
  const [, dash, singleQuoted, doubleQuoted, bare] = match;
  const delimiter = singleQuoted ?? doubleQuoted ?? bare;
  const bodyStart = Math.max(lineEnd + 1, from);
  const lines = command.slice(bodyStart).split('\n');
  const close = lines.findIndex((line) => (dash ? line.replace(/^\t+/, '') : line) === delimiter);
  if (close === -1) return { text: lines.join('\n'), end: command.length };
  const text = lines.slice(0, close).join('\n');
  return { text, end: bodyStart + lines.slice(0, close + 1).join('\n').length + 1 };
}

// The SQL reason for a pipeline that runs a database client, matched in its
// arguments and in the heredoc bodies it reads.
function sqlReason(pipeline, command) {
  if (!pipeline.some((segment) => SQL_CLIENT.test(segment.blanked))) return null;
  const texts = pipeline.map((segment) => segment.raw);
  let from = 0;
  for (const segment of pipeline) {
    for (const operator of segment.blanked.matchAll(HEREDOC_START)) {
      const body = heredocBody(command, segment.start + operator.index, from);
      texts.push(body.text);
      from = body.end;
    }
  }
  const text = texts.join('\n');
  const rule = SQL_RULES.find((sqlRule) => sqlRule.argument.test(text));
  return rule ? rule.reason : null;
}

function denialReason(command) {
  for (const pipeline of pipelinesOf(command)) {
    for (const segment of pipeline) {
      const reason = segmentReason(segment);
      if (reason) return reason;
    }
    const reason = sqlReason(pipeline, command);
    if (reason) return reason;
  }
  return null;
}

export { denialReason as denialFor };

if (isProcessEntry(import.meta.url)) await runBashGuard(denialReason);
