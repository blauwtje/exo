#!/usr/bin/env python3
"""PreToolUse check on Bash: deny whole-file reads of large files through the shell.

In bypass-permissions mode the harness reads files with cat and sed instead of
the Read tool, so read-guard.sh never sees them. This check applies the same
byte cap to the shell forms: `cat FILE`, `sed -n 'A,Bp' FILE` with a range
over 300 lines or an open `$` end, `sed` without `-n` on a file, and `head`
with more than 300 lines. It only ever denies; it never rewrites the command.

Exempt, like read-guard.sh: paths under /.claude/ and /claude-skills/, and a
pipeline whose later stage already bounds the output (head, tail, wc, grep).
A command shlex cannot parse is allowed through unchanged.
"""
import json
import os
import re
import shlex
import sys

MAX_LINES = 300
BOUNDING_STAGES = {"head", "tail", "wc", "grep", "rg", "shasum", "md5", "sha256sum"}
SEPARATORS = {"|", "||", "&&", ";", "&"}
RANGE_SCRIPT = re.compile(r"^(\d+),(\d+|\$)p$")


def max_bytes_for(path):
    if "/.claude/" in path or "/claude-skills/" in path:
        return 0
    return int(os.environ.get("READ_GUARD_MAX_BYTES", "12000"))


def split_segments(command):
    lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    segments = [[]]
    for token in lexer:
        if token in SEPARATORS:
            segments.append([token])
            segments.append([])
        elif segments[-1] and segments[-1][0] in SEPARATORS:
            segments.append([token])
        else:
            segments[-1].append(token)
    return [segment for segment in segments if segment]


def big_file(token, cwd):
    if token.startswith("-"):
        return None
    path = os.path.expanduser(token)
    if not os.path.isabs(path):
        path = os.path.join(cwd, path)
    if not os.path.isfile(path):
        return None
    cap = max_bytes_for(path)
    size = os.path.getsize(path)
    if cap and size > cap:
        return path, size, cap
    return None


def bounded_downstream(segments, index):
    for later in segments[index + 1 :]:
        if later[0] == "|":
            continue
        if later[0] in SEPARATORS:
            return False
        return later[0] in BOUNDING_STAGES
    return False


def check_segment(tokens, cwd):
    """Return (path, size, cap, what) when this segment reads a large file whole."""
    command = tokens[0]
    args = tokens[1:]
    if command == "cat":
        for token in args:
            hit = big_file(token, cwd)
            if hit:
                return (*hit, "cat")
        return None
    if command == "sed":
        quiet = "-n" in args
        for token in args:
            match = RANGE_SCRIPT.match(token)
            if match and quiet:
                start, end = match.groups()
                if end != "$" and int(end) - int(start) < MAX_LINES:
                    return None
        for token in args:
            hit = big_file(token, cwd)
            if hit:
                return (*hit, "sed without a range under 300 lines")
        return None
    if command == "head":
        requested = 0
        for position, token in enumerate(args):
            if token == "-n" and position + 1 < len(args) and args[position + 1].isdigit():
                requested = int(args[position + 1])
            elif re.match(r"^-n?\d+$", token):
                requested = int(token.lstrip("-n"))
        if requested <= MAX_LINES:
            return None
        for token in args:
            hit = big_file(token, cwd)
            if hit:
                return (*hit, f"head of {requested} lines")
        return None
    return None


def main():
    payload = json.load(sys.stdin)
    command = (payload.get("tool_input") or {}).get("command") or ""
    cwd = payload.get("cwd") or os.getcwd()
    if not command:
        return
    try:
        segments = split_segments(command)
    except ValueError:
        return
    for index, tokens in enumerate(segments):
        if tokens[0] in SEPARATORS:
            continue
        if tokens[0] == "cd" and len(tokens) > 1:
            target = os.path.expanduser(tokens[1])
            cwd = target if os.path.isabs(target) else os.path.join(cwd, target)
            continue
        hit = check_segment(tokens, cwd)
        if not hit or bounded_downstream(segments, index):
            continue
        path, size, cap, what = hit
        reason = (
            f"{what} on {path}: {size} bytes (>{cap}, about {size // 4} tokens). "
            "Locate the range first with grep -n, then read only that range "
            f"with sed -n 'A,Bp' under {MAX_LINES} lines, or pipe into head."
        )
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }}))
        return


if __name__ == "__main__":
    main()
