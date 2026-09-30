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
// are arguments that the blanking hides.
// Ceiling: the command string is matched, not parsed, so a command assembled
// from variables at run time reads as written. A heredoc body is one segment per
// line with no command word, so SQL in it is denied even when the heredoc feeds
// `cat` or a commit message; rewrite it or ask the user.
// A failed read of stdin exits 1, a non-blocking error; the guard never exits 2.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { blankCommandText } from './command-text.mjs';

const SEGMENT_SEPARATOR = /[;&|\n]/g;
const START = '(?:^|[ (])';
const ENGINE = '(?:docker|podman)';
// A segment that only reads or prints text: searching a file for "drop table" or
// writing a commit message about it is not a drop.
const READING_COMMAND = /^ *(?:grep|rg|ag|cat|head|tail|less|find|awk|jq|echo|sed|git)(?: |$)/;

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
    command: new RegExp(`${START}(?:${ENGINE} +compose|docker-compose|podman-compose) +down(?: |$)`),
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
    argument: /(?:\.ssh\/|\.aws\/|\.config\/gh)/,
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
// a sqlite3 argument or a heredoc, so it is matched in the segment text rather
// than per client.
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

// Pairs the blanked and the raw text of each segment. Blanking keeps every
// character position, so the separators found in one cut both.
function segmentsOf(command) {
  const blanked = blankCommandText(command);
  const segments = [];
  let start = 0;
  for (const separator of [...blanked.matchAll(SEGMENT_SEPARATOR), { index: blanked.length }]) {
    segments.push({
      blanked: blanked.slice(start, separator.index),
      raw: command.slice(start, separator.index)
    });
    start = separator.index + 1;
  }
  return segments;
}

function ruleReason(segment) {
  for (const rule of SEGMENT_RULES) {
    if (!rule.command.test(segment.blanked)) continue;
    if (!rule.argument || rule.argument.test(segment.raw)) return rule.reason;
  }
  if (READING_COMMAND.test(segment.blanked)) return null;
  const sqlRule = SQL_RULES.find((rule) => rule.argument.test(segment.raw));
  return sqlRule ? sqlRule.reason : null;
}

function denialReason(command) {
  for (const segment of segmentsOf(command)) {
    const reason = ruleReason(segment);
    if (reason) return reason;
  }
  return null;
}

// A setting that cannot be read leaves the guard on, because a safety guard that
// a broken settings file switches off would fail open.
function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

async function main() {
  let hookInput;
  try {
    const text = await readHookText();
    if (text.trim() === '') return;
    hookInput = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`destructive-guard: cannot read the hook input: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const command = hookInput.tool_input?.command;
  if (hookInput.tool_name !== 'Bash' || typeof command !== 'string' || command === '') return;
  if (!guardsOn()) return;
  const reason = denialReason(command);
  if (!reason) return;
  const decision = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: decision })}\n`);
}

await main();
