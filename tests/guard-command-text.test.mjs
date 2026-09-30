// blankCommandText keeps the words that run and blanks the text that only
// reads: quoted strings, heredoc bodies and git commit messages.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankCommandText } from '../hooks/guards/command-text.mjs';

const blanks = (count) => ' '.repeat(count);

test('a command without quoted text comes back unchanged', () => {
  const command = 'git status && npm test | tail -5';
  assert.equal(blankCommandText(command), command);
});

test('single-quoted and double-quoted text is blanked and the quotes stay', () => {
  assert.equal(blankCommandText(`echo 'rm -rf x' "drop table t"`), `echo '${blanks(8)}' "${blanks(12)}"`);
});

test('the result keeps the length of the command', () => {
  const command = `git commit -m "fix: drop table words" && echo 'a; b'`;
  assert.equal(blankCommandText(command).length, command.length);
});

test('an escaped quote does not end a double-quoted string', () => {
  assert.equal(blankCommandText('echo "a \\" rm b" ls'), `echo "${blanks(9)}" ls`);
});

test('a command substitution inside a double-quoted string stays visible', () => {
  assert.equal(blankCommandText('echo "note $(rm -rf x) end"'), `echo "${blanks(5)}$(rm -rf x)${blanks(4)}"`);
});

test('a backtick substitution inside a double-quoted string stays visible', () => {
  assert.equal(blankCommandText('echo "a `rm x` b"'), `echo "${blanks(2)}\`rm x\`${blanks(2)}"`);
});

test('a substitution in a substitution keeps its own quoted text blanked', () => {
  assert.equal(blankCommandText(`echo "$(echo 'ab')"`), `echo "$(echo '${blanks(2)}')"`);
});

test('a quoted heredoc body is blanked and its delimiter lines stay', () => {
  const command = "cat <<'EOF'\nrm -rf x\n& drop table t\nEOF\nls";
  assert.equal(blankCommandText(command), `cat <<'EOF'\n${blanks(8)}\n${blanks(14)}\nEOF\nls`);
});

test('an unquoted heredoc body is blanked except for its substitutions', () => {
  const command = 'cat <<EOF\nnote $(rm x)\nEOF\nls';
  assert.equal(blankCommandText(command), `cat <<EOF\n${blanks(5)}$(rm x)\nEOF\nls`);
});

test('a dash heredoc ends at a tab-indented delimiter', () => {
  const command = "cat <<-'END'\n\tbody\n\tEND\nls";
  assert.equal(blankCommandText(command), `cat <<-'END'\n${blanks(5)}\n\tEND\nls`);
});

test('a command after a heredoc on the same line stays visible', () => {
  const command = "cat <<'EOF' | grep x\nbody\nEOF";
  assert.equal(blankCommandText(command), `cat <<'EOF' | grep x\n${blanks(4)}\nEOF`);
});

test('two heredocs on one line each blank their own body', () => {
  const command = "cat <<'A' <<'B'\none\nA\ntwo\nB\nls";
  assert.equal(blankCommandText(command), `cat <<'A' <<'B'\n${blanks(3)}\nA\n${blanks(3)}\nB\nls`);
});

test('a here-string is not a heredoc', () => {
  assert.equal(blankCommandText('grep x <<< abc\nls'), 'grep x <<< abc\nls');
});

test('a heredoc without its delimiter line blanks to the end', () => {
  assert.equal(blankCommandText("cat <<'EOF'\nbody"), `cat <<'EOF'\n${blanks(4)}`);
});

test('a commit message from a quoted heredoc in a substitution is blanked', () => {
  const command = "git commit -m \"$(cat <<'EOF'\nfix: drop table\n\nBody with & sign\nEOF\n)\"";
  const blanked = blankCommandText(command);
  assert.equal(blanked.length, command.length);
  assert.ok(!/drop table|sign|&/.test(blanked));
  assert.ok(blanked.startsWith('git commit -m "$(cat <<\'EOF\'\n'));
  assert.ok(blanked.endsWith('\nEOF\n)"'));
});

test('a bare word after -m is blanked', () => {
  assert.equal(blankCommandText('git commit -m fixdrop'), `git commit -m ${blanks(7)}`);
});

test('a bare word after a bundled -am, -mfoo or --message= is blanked', () => {
  assert.equal(blankCommandText('git commit -am fix'), `git commit -am ${blanks(3)}`);
  assert.equal(blankCommandText('git commit -mfix'), `git commit -m${blanks(3)}`);
  assert.equal(blankCommandText('git commit --message=fix'), `git commit --message=${blanks(3)}`);
});

test('a commit message after a quoted config value is blanked', () => {
  assert.equal(
    blankCommandText(`git -c "user.name=x" commit -m "rm -rf y"`),
    `git -c "${blanks(11)}" commit -m "${blanks(8)}"`
  );
});

test('each chained commit blanks its own message', () => {
  assert.equal(blankCommandText('git commit -m one && git commit -m two'), `git commit -m ${blanks(3)} && git commit -m ${blanks(3)}`);
});

test('a bare word after -m of another command stays', () => {
  assert.equal(blankCommandText('python -m http.server'), 'python -m http.server');
});

test('a message word with a substitution stays visible', () => {
  assert.equal(blankCommandText('git commit -m $(rm x)'), 'git commit -m $(rm x)');
});

test('the command around a commit message stays visible', () => {
  assert.equal(
    blankCommandText('git add . && git commit -m "drop table" && git push --force'),
    `git add . && git commit -m "${blanks(10)}" && git push --force`
  );
});

test('an empty command comes back empty', () => {
  assert.equal(blankCommandText(''), '');
});
