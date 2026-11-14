
import * as claude from './claude/adapter.mjs';
import * as codex from './codex/adapter.mjs';
import * as opencode from './opencode/adapter.mjs';

export const adapters = [claude, codex, opencode];
