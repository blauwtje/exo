import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { onPath } from '#on-path';

const zshPrefix = (options) => `[ -n "$ZSH_VERSION" ] && setopt ${options}; `;
const PERL_TIMEOUT = String.raw`$t=shift;$t=~/^(\d*\.?\d+)([smhd]?)$/||(warn("timeout: only timeout DURATION COMMAND is supported\n"),exit 125);$t*={""=>1,s=>1,m=>60,h=>3600,d=>86400}->{$2};$t=int($t)+($t>int$t);setpgrp;$SIG{TERM}="IGNORE";($p=fork)//exit 125;if(!$p){$SIG{TERM}="DEFAULT";exec{$ARGV[0]}@ARGV;warn"timeout: failed to run command $ARGV[0]: $!\n";exit($!{ENOENT}?127:126)}$SIG{ALRM}=sub{kill 15,-$$;exit 124};alarm$t;waitpid$p,0;exit($?&127?128+($?&127):$?>>8)`;
export const TIMEOUT_FUNCTION = `timeout() { perl -e '${PERL_TIMEOUT}' -- "$@"; }; `;
export const SED_FUNCTION = `sed() { local n=$# a=; while [ "$n" -gt 0 ]; do a=$1; shift; n=$((n-1)); set -- "$@" "$a"; if [ "$a" = -i ] && { [ "$n" -eq 0 ] || [ -n "$1" ]; }; then set -- "$@" ''; fi; done; command sed "$@"; };`;
const BARE_SED_I = /(?<![\w-])sed\s(?:[^|;&\n]*\s)?-i(?=\s)(?!\s+(?:''|""))/;
const isBsdSed = () => spawnSync('sed', ['--version'], { stdio: 'ignore' }).status !== 0;
const EQUALS_WORD = /(?:^|\s)=\S/;
const SINGLE_QUOTED = /'[^']*'/g;
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;
const UNQUOTED_EXPANSION = /\$(?:[\w@*]|\{(?![#!]))/;
const ARRAY_SUBSCRIPT = /\$\{[A-Za-z_]\w*\[(?![@*]\])/;
const ZSH_OPTIONS = [
  ['noequals', (command) => EQUALS_WORD.test(command)],
  ['shwordsplit', (command) => UNQUOTED_EXPANSION.test(command.replace(QUOTED, ''))],
  ['ksharrays', (command) => ARRAY_SUBSCRIPT.test(command.replace(SINGLE_QUOTED, ''))]
];
const zshOptionsFor = (command) => ZSH_OPTIONS.filter(([, needed]) => needed(command)).map(([option]) => option).join(' ');
const TIMEOUT_WORD = /(?<![\w-])timeout(?![\w-])/;

// why: a prefix the shell resolves leaves the command text as written; text matching of shell syntax never ends.
export function fixShell(toolInput, hasTimeout = onPath('timeout', process.env), bsdSed = isBsdSed) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const zshOptions = zshOptionsFor(command);
  const prefix = (zshOptions ? zshPrefix(zshOptions) : '') + (!hasTimeout && TIMEOUT_WORD.test(command) ? TIMEOUT_FUNCTION : '') + (BARE_SED_I.test(command) && bsdSed() ? SED_FUNCTION : '');
  return prefix ? { ...toolInput, command: prefix + command } : null;
}

const GLOB_PASS_LINE = 'if [ -n "${ZSH_VERSION-}" ]; then setopt nonomatch; fi';

export function passUnmatchedGlobs(envFile) {
  if (!envFile) return;
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  if (text.split('\n').includes(GLOB_PASS_LINE)) return;
  fs.appendFileSync(envFile, `${text === '' || text.endsWith('\n') ? '' : '\n'}${GLOB_PASS_LINE}\n`);
}

const SEARCH_COMMAND = /(?<![\w./-])(grep|rg)(?=\s)((?:\s+--?[^\s]*)*)/g;
const GREP_RECURSIVE = /\s(?:-[A-Za-z]*[rR]|--recursive)/;
const LISTING_OR_COUNT = /\s(?:-[A-Za-z]*[lLcq]|--(?:files|count|quiet))/;

function listFilesOnly(toolInput) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const listed = command.replace(SEARCH_COMMAND, (match, tool, flags) => {
    const recursive = tool === 'rg' || GREP_RECURSIVE.test(flags);
    return recursive && !LISTING_OR_COUNT.test(flags) ? `${tool} -l${flags}` : match;
  });
  return listed === command ? null : { ...toolInput, command: listed };
}

const MENTIONS_SEARCH = /(?<![\w./-])(?:grep|rg)(?=\s)/;

export function fixShellFor(hookInput, agentTypeOf) {
  const input = hookInput.tool_input;
  const listed = MENTIONS_SEARCH.test(input?.command ?? '') && agentTypeOf(hookInput) === 'orchestrator' ? listFilesOnly(input) : null;
  return fixShell(listed ?? input) ?? listed;
}

const LOOP_AT = /^(?:(?:until|while)\b[^\n]*;\s*do\b[\s\S]*?\bsleep(?=\s|$)|(?:until|while)\b[\s\S]*?\bdo\b[\s\S]*?\bsleep(?=\s|$))/;
const LOOP_START = /\b(?:until|while)\b/g;
const SHELL_TEXT = /\b(?:(?:ba|z)?sh\s+-\w*c|eval)\s+(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
const QUOTED_TEXT = /(["'])(?:\\.|(?!\1)[^\\])*\1/g;
const BOUND_BEFORE = /\bg?timeout\s+(?:-k\s*\S+\s+)?(?:-\w\s+)*\d+\S*\s+(?:(?:ba|z)?sh\s+-\w*c\s+)?$/;
const COUNTED = /^(?:until|while)\s+\[+\s*"?\$\{?\w+\}?"?\s+-(?:lt|le|gt|ge)\s+\d+/;

function loopText(command) {
  return command.replace(SHELL_TEXT, (_, quote, body) => ` ${body}`).replace(QUOTED_TEXT, '""');
}

function isBounded(text, index) {
  return BOUND_BEFORE.test(text.slice(0, index)) || COUNTED.test(text.slice(index));
}

export function pollsUnbounded(command) {
  const text = loopText(command);
  return [...text.matchAll(LOOP_START)].some(({ index }) => LOOP_AT.test(text.slice(index)) && !isBounded(text, index));
}
