// Bash guard: denies deleting a container, volume, database or credential,
// often reached for to get past a blocked state whose data is the only copy.
// Git deletions are git-guard's. Segments split at `;`, `&`, `|` and line
// breaks in the blanked command; the command word is read blanked, arguments
// raw. SQL counts only in a pipeline that runs a database client.
// Ceiling: matched, not parsed; SQL read from a file (`psql -f`, `< x.sql`) is
// not seen; `|&` ends a pipeline.

import { blankCommandText, HEREDOC_OPERATOR } from './command-text.mjs';

const SEGMENT_SEPARATOR = /[;&|\n]/g;
const START = '(?:^|[ (])';
const ENGINE = '(?:docker|podman)';
// A database client, also after a path, `sudo`, an assignment or `docker exec`.
const SQL_CLIENT = /(?:^|[ (/])(?:psql|mysql|mariadb|sqlite3|duckdb)(?: |$)/;
// A heredoc operator; `<<<` is a here-string, read as an argument.
const HEREDOC_START = /(?<!<)<<(?!<)/g;

const CREDENTIAL_REASON = 'destructive-guard: deleting a credential file locks the user out, and the secret often exists nowhere else. Report the path and ask the user.';
const DATABASE_FILE_REASON = 'destructive-guard: deleting a database file deletes the only copy of its data. Ask the user.';

// [command word on the blanked segment, argument on the raw segment or null,
// reason]. `docker stop`, `rmi`, plain `compose down`, and a deployment or pod
// delete stay allowed. A credential directory matches on its prefix.
const SEGMENT_RULES = [
  [new RegExp(`${START}${ENGINE} +(?:container +|compose +)?rm(?: |$)`), null,
    'destructive-guard: removing a container destroys its writable layer and everything in it that is not on a volume. Stop it instead, or report the container and ask the user.'],
  [new RegExp(`${START}${ENGINE} +volume +(?:rm|prune)(?: |$)`), null,
    'destructive-guard: a volume holds the only copy of its data. Report the volume and ask the user.'],
  [new RegExp(`${START}${ENGINE} +(?:system|container) +prune(?: |$)`), null,
    'destructive-guard: a system or container prune removes stopped containers and unused volumes across the whole machine, including ones from other projects. Ask the user.'],
  [new RegExp(`${START}(?:${ENGINE} +compose|docker-compose|podman-compose)(?: +(?:-f|--file) +[^ ]+)* +down(?: |$)`), /(?:^| )(?:-v|--volumes)(?: |$)/,
    'destructive-guard: compose down with --volumes deletes the project\'s volumes and the data in them. Run it without --volumes, or ask the user.'],
  [new RegExp(`${START}kubectl(?: +[^ ]+)* +delete(?: |$)`), /^.*?kubectl(?: +[^ ]+)*? +delete +.*(?:\b(?:pvc|persistentvolumeclaims?|namespaces?|ns)\b|(?:^| )--all(?: |$))/,
    'destructive-guard: deleting a namespace, a persistent volume claim or everything in a namespace destroys data the cluster does not back up. Name what should go and ask the user.'],
  [new RegExp(`${START}dropdb(?: |$)`), null,
    'destructive-guard: dropdb deletes the database and everything in it. Ask the user.'],
  [new RegExp(`${START}mysqladmin(?: +[^ ]+)* +drop(?: |$)`), null,
    'destructive-guard: mysqladmin drop deletes the database and everything in it. Ask the user.'],
  [/(?:prisma +migrate +reset|drizzle-kit +drop|db:drop)/, null,
    'destructive-guard: this command drops and recreates the database, discarding every row in it. Ask the user.'],
  [new RegExp(`${START}rm(?: |$)`), /\.(?:db|sqlite|sqlite3)["']?(?: |$)/, DATABASE_FILE_REASON],
  [new RegExp(`${START}rm(?: |$)`), /(?:\.(?:ssh|aws)(?:\/|["']?(?: |$))|\.config\/gh)/, CREDENTIAL_REASON],
  [new RegExp(`${START}rm(?: |$)`), /(?:\.git-credentials|\.netrc|\.pem|\.key|\.env(?:\.[^ "']+)?)["']?(?: |$)/, CREDENTIAL_REASON],
  [new RegExp(`${START}security +delete-(?:generic-password|internet-password|keychain)(?: |$)`), null,
    'destructive-guard: deleting a keychain entry destroys the only copy of that secret. Ask the user.'],
  [new RegExp(`${START}gh +auth +logout(?: |$)`), null,
    'destructive-guard: gh auth logout removes the stored GitHub token and ends every gh command in this session. Ask the user.'],
  [new RegExp(`${START}chezmoi +(?:destroy|forget)(?: |$)`), null,
    'destructive-guard: chezmoi destroy deletes the target file and chezmoi forget drops it from the source. Ask the user.']
].map(([command, argument, reason]) => ({ command, argument, reason }));

// DDL is matched in the text a client pipeline is fed, whatever the client.
const SQL_RULES = [
  { argument: /(?:^|[^a-z_])drop\s+(?:database|schema|table)(?:\s|$)/i,
    reason: 'destructive-guard: dropping a database, schema or table deletes data that is often the only copy. Ask the user, or put it in a migration the user approves.' },
  { argument: /(?:^|[^a-z_])truncate\s+(?:table\s+)?[a-z_"`]/i,
    reason: 'destructive-guard: TRUNCATE empties a table and cannot be undone. Ask the user.' }
];

// Blanked and raw text of each segment, grouped into pipelines joined by a lone `|`.
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
  return SEGMENT_RULES.find((rule) => rule.command.test(segment.blanked) && (!rule.argument || rule.argument.test(segment.raw)))?.reason;
}

// The body of the heredoc whose operator is at `index`, from `from` or the next
// line, up to its delimiter; `end` is where the next heredoc's body starts.
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

// The SQL reason for a client pipeline, in its arguments and heredoc bodies.
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
  return SQL_RULES.find((rule) => rule.argument.test(texts.join('\n')))?.reason;
}

function denialReason(command) {
  for (const pipeline of pipelinesOf(command)) {
    const reason = pipeline.map(segmentReason).find(Boolean) || sqlReason(pipeline, command);
    if (reason) return reason;
  }
  return null;
}

export { denialReason as denialFor };
