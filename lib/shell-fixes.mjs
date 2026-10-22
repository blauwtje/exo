import process from 'node:process';
import { onPath } from '#on-path';

const ZSH_PREFIX = '[ -n "$ZSH_VERSION" ] && setopt noequals; ';
const PERL_TIMEOUT = String.raw`$t=shift;$t=~/^(\d*\.?\d+)([smhd]?)$/||(warn("timeout: only timeout DURATION COMMAND is supported\n"),exit 125);$t*={""=>1,s=>1,m=>60,h=>3600,d=>86400}->{$2};$t=int($t)+($t>int$t);setpgrp;$SIG{TERM}="IGNORE";($p=fork)//exit 125;if(!$p){$SIG{TERM}="DEFAULT";exec{$ARGV[0]}@ARGV;warn"timeout: failed to run command $ARGV[0]: $!\n";exit($!{ENOENT}?127:126)}$SIG{ALRM}=sub{kill 15,-$$;exit 124};alarm$t;waitpid$p,0;exit($?&127?128+($?&127):$?>>8)`;
export const TIMEOUT_FUNCTION = `timeout() { perl -e '${PERL_TIMEOUT}' -- "$@"; }; `;
const EQUALS_WORD = /(?:^|\s)=\S/;
const TIMEOUT_WORD = /(?<![\w-])timeout(?![\w-])/;

// why: a prefix the shell resolves leaves the command text as written; text matching of shell syntax never ends.
export function fixShell(toolInput, hasTimeout = onPath('timeout', process.env)) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const prefix = (EQUALS_WORD.test(command) ? ZSH_PREFIX : '') + (!hasTimeout && TIMEOUT_WORD.test(command) ? TIMEOUT_FUNCTION : '');
  return prefix ? { ...toolInput, command: prefix + command } : null;
}
