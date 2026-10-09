// Rewrites exo's Claude Code Markdown into Codex text by fixed rules. Every
// function is pure: path and text in, text out, no file read.
//
//   codexMarkdown(path, text, known)  a whole skill Markdown file, frontmatter included
//   codexBody(path, text, known)      text without frontmatter, such as an agent body
//   codexOpenaiYaml(path, text)       the `agents/openai.yaml` policy, or null
//
// `known` is `{ skills, agents }`, two arrays of names, because `exo:<name>`
// becomes `$<name>` for a skill and `exo-<name>` for an agent.

import path from 'node:path';

export const DESCRIPTION_CAP = 1024;
export const EMPHASIS_WORDS = ['MUST', 'NEVER', 'ALWAYS', 'IMPORTANT', 'CRITICAL', 'REQUIRED'];

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
// Every lib file reaches the launcher, which refuses one outside its LIB_ENTRIES list.
const SCRIPT_PATH = /^(skills\/[a-z0-9-]+\/scripts|lib)\/[^/]+\.mjs$/;
const RUN_ENTRY = 'node "{{EXO_ROOT}}/harnesses/codex/run.mjs"';

// Plain-text phrases, longest first so a longer phrase wins over its part.
const PHRASES = [
  ['the Agent or Task tool', 'a spawn of the custom agent'],
  ['the Task or Agent tool', 'a spawn of the custom agent'],
  ['the Agent tool', 'a spawn of the custom agent'],
  ['the Task tool', 'a spawn of the custom agent'],
  ['through the Skill tool', "by reading that skill's `SKILL.md`"],
  ['the Skill tool', "a read of that skill's `SKILL.md`"],
  // Whether Codex wakes the parent when a spawned agent finishes is unconfirmed, so it waits.
  ['end the turn; each completion notification resumes it', 'wait for each agent with `wait_agent`'],
  ["under the Bash tool's `run_in_background`", 'in a background `exec_command` session polled with `write_stdin`'],
  ['with `run_in_background: false`', 'then waits for it with `wait_agent`'],
  ['under `run_in_background`', 'in a background `exec_command` session polled with `write_stdin`'],
  ['A `SendMessage`', 'A follow-up message'],
  ['`SendMessage` it to', 'send it as a follow-up message to'],
  ['via SendMessage', 'by a follow-up message'],
  ['by SendMessage', 'by a follow-up message'],
  ['a `general-purpose` delegate', 'a built-in `default` delegate'],
  ['`general-purpose`', 'the built-in `default` agent'],
  ['with TaskStop', 'by killing its process'],
  ["agent's maxTurns", "agent's turn budget, which Codex does not enforce"],
  ['with Bash `timeout: 600000`', 'with `exec_command`, polling its session with `write_stdin` until it exits,'],
  ['means `exo:<name>`', 'means `$<name>`, a bare agent name `exo-<name>`']
];

// Claude runs a line `` !`cmd` `` when the skill loads; Codex passes the line as text.
const LOAD_COMMAND = /^!`([^`\n]+)`$/gm;

// An agent has no skill folder of its own: the dispatch passes one.
const AGENT_SKILL_DIR = [
  ['`${CLAUDE_SKILL_DIR}`', 'skill folder path'],
  ['${CLAUDE_SKILL_DIR}', 'the skill folder path the dispatch passes']
];

export function splitFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (match === null) return { fields: null, body: text };
  const fields = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    fields[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return { fields, body: text.slice(match[0].length) };
}

// All-caps emphasis words go lowercase outside fenced blocks and code spans.
function lowerEmphasis(text) {
  const words = new RegExp(`\\b(?:${EMPHASIS_WORDS.join('|')})\\b`, 'g');
  const lower = (piece) => piece.replace(words, (word) => word.toLowerCase());
  let inFence = false;
  const lines = text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line
      .split(/((`+).+?\2)/)
      .map((piece, index) => (index % 3 === 0 ? lower(piece) : piece))
      .filter((_, index) => index % 3 !== 2)
      .join('');
  });
  return lines.join('\n');
}

function skillOf(file) {
  const match = /^skills\/([^/]+)\//.exec(file.split(path.sep).join('/'));
  return match === null ? null : match[1];
}

// `node "${CLAUDE_SKILL_DIR}/scripts/x.mjs"` runs through the launcher, which
// sets the host and takes only a skill script or a lib entry; any other root file keeps a plain path.
function mapScriptCommands(file, text) {
  const command = /node "\$\{CLAUDE_(SKILL_DIR|PLUGIN_ROOT)\}\/([^"]+\.mjs)"/g;
  return text.replace(command, (whole, variable, relative) => {
    let base = '';
    if (variable === 'SKILL_DIR') {
      const skill = skillOf(file);
      if (skill === null) throw new Error(`${file}: \${CLAUDE_SKILL_DIR} command outside a skill folder`);
      base = `skills/${skill}`;
    }
    const target = path.posix.normalize(path.posix.join(base, relative));
    if (target.startsWith('..')) throw new Error(`${file}: script path leaves the exo root: ${relative}`);
    if (SCRIPT_PATH.test(target)) return `${RUN_ENTRY} "{{EXO_ROOT}}/${target}"`;
    return `node "{{EXO_ROOT}}/${target}"`;
  });
}

function mapNames(file, text, known) {
  const skills = new Set(known.skills);
  const agents = new Set(known.agents);
  return text.replace(/\/?exo:([a-z][a-z0-9-]*)/g, (whole, name) => {
    if (skills.has(name)) return `$${name}`;
    if (agents.has(name)) return `exo-${name}`;
    throw new Error(`${file}: ${whole} names no skill or agent`);
  });
}

export function codexBody(file, text, known) {
  let mapped = mapScriptCommands(file, text);
  mapped = mapped.replaceAll('${CLAUDE_PLUGIN_ROOT}', '{{EXO_ROOT}}');
  const inSkill = skillOf(file) !== null;
  if (inSkill) mapped = mapped.replaceAll('${CLAUDE_SKILL_DIR}', '{{SKILL_DIR}}');
  else for (const [token, wording] of AGENT_SKILL_DIR) mapped = mapped.replaceAll(token, wording);
  mapped = mapNames(file, mapped, known);
  for (const [phrase, replacement] of PHRASES) mapped = mapped.replaceAll(phrase, replacement);
  mapped = mapped.replace(LOAD_COMMAND, 'Run `$1` first and use its output here.');
  mapped = lowerEmphasis(mapped);
  // The installer fills {{SKILL_DIR}} only in a skill folder.
  const leftovers = inSkill ? ['${CLAUDE_'] : ['${CLAUDE_', '{{SKILL_DIR}}'];
  for (const leftover of leftovers) {
    const left = mapped.indexOf(leftover);
    if (left !== -1) {
      throw new Error(`${file}: left unmapped: ${mapped.slice(left, left + 40).split('\n')[0]}`);
    }
  }
  return mapped;
}

// The generated `name` and `description` pair; throws on a missing field or a
// description over the cap.
export function codexHeader(file, text, known) {
  const { fields } = splitFrontmatter(text);
  if (fields === null || !fields.name || !fields.description) {
    throw new Error(`${file}: frontmatter needs name and description`);
  }
  const description = codexBody(file, fields.description, known);
  if (description.length > DESCRIPTION_CAP) {
    throw new Error(`${file}: description is ${description.length} characters, over ${DESCRIPTION_CAP}`);
  }
  return { name: fields.name, description };
}

export function codexMarkdown(file, text, known) {
  const { fields, body } = splitFrontmatter(text);
  const mapped = codexBody(file, body, known);
  if (fields === null) return mapped;
  const { name, description } = codexHeader(file, text, known);
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n${mapped}`;
}

// A skill that disables model invocation is explicit-only on Codex.
export function codexOpenaiYaml(file, text) {
  const { fields } = splitFrontmatter(text);
  if (fields?.['disable-model-invocation'] !== 'true') return null;
  return 'policy:\n  allow_implicit_invocation: false\n';
}
