#!/usr/bin/env node

import { inSidecall, readHookText } from '#hook-input';
import { removeSavedOutputs } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

if (isMain(import.meta.url) && !inSidecall()) {
  try {
    removeSavedOutputs(JSON.parse(await readHookText()).agent_id);
  } catch {
  }
}
