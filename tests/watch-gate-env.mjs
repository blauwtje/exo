import process from 'node:process';
import { tempDir } from './harness.mjs';

process.env.CLAUDE_PLUGIN_DATA = tempDir('watch-gate-data-');
process.env.EXO_WATCH_GATE_MS = '0';
process.env.EXO_WATCH_BACKOFF_MS = '0';
process.env.EXO_WATCH_RATE_WAIT_MS = '0';
