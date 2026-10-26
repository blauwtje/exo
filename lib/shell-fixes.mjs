import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { onPath } from '#on-path';

const zshPrefix = (options) => `[ -n "$ZSH_VERSION" ] && setopt ${options}; `;
const PERL_TIMEOUT = String.raw`$t=shift;$t=~/^(\d*\.?\d+)([smhd]?)$/||(warn("timeout: only timeout DURATION COMMAND is supported\n"),exit 125);$t*={""=>1,s=>1,m=>60,h=>3600,d=>86400}->{$2};$t=int($t)+($t>int$t);setpgrp;$SIG{TERM}="IGNORE";($p=fork)//exit 125;if(!$p){$SIG{TERM}="DEFAULT";exec{$ARGV[0]}@ARGV;warn"timeout: failed to run command $ARGV[0]: $!\n";exit($!{ENOENT}?127:126)}$SIG{ALRM}=sub{kill 15,-$$;exit 124};alarm$t;waitpid$p,0;exit($?&127?128+($?&127):$?>>8)`;
export const TIMEOUT_FUNCTION = `timeout() { perl -e '${PERL_TIMEOUT}' -- "$@"; }; `;
export const SED_FUNCTION = `sed() { local n=$# a=; while [ "$n" -gt 0 ]; do a=$1; shift; n=$((n-1)); set -- "$@" "$a"; if [ "$a" = -i ] && { [ "$n" -eq 0 ] || [ -n "$1" ]; }; then set -- "$@" ''; fi; done; command sed "$@"; };`;
const BARE_SED_I = /(?<![\w-])sed\s(?:[^|;&\n]*\s)?-i(?=\s)(?!\s+(?:''|""))/;
const isBsdSed = () => spawnSync('sed', ['--version'], { stdio: 'ignore' }).status !== 0;
const EQUALS_WORD = /(?:^|\s)=\S/;
const FOR_IN_BARE_VAR = /(?<![\w-])for\s+\w+\s+in\s+\$[A-Za-z_]\w*(?![\w\[({])/;
const TIMEOUT_WORD = /(?<![\w-])timeout(?![\w-])/;

// why: a prefix the shell resolves leaves the command text as written; text matching of shell syntax never ends.
export function fixShell(toolInput, hasTimeout = onPath('timeout', process.env), bsdSed = isBsdSed) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const zshOptions = FOR_IN_BARE_VAR.test(command) ? 'noequals shwordsplit' : EQUALS_WORD.test(command) ? 'noequals' : '';
  const prefix = (zshOptions ? zshPrefix(zshOptions) : '') + (!hasTimeout && TIMEOUT_WORD.test(command) ? TIMEOUT_FUNCTION : '') + (BARE_SED_I.test(command) && bsdSed() ? SED_FUNCTION : '');
  return prefix ? { ...toolInput, command: prefix + command } : null;
}
