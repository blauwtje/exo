import process from 'node:process';
import { projectEcosystems } from './run-session-ecosystems.mjs';
import { unsandboxedScripts } from './run-session-rules.mjs';
import { spellings } from './run-session-paths.mjs';

export function sandboxMode(config, { platform = process.platform, root = null, planFiles = [] } = {}) {
  if (platform === 'win32') return { enabled: false, reason: 'native Windows has no sandbox' };
  const sandbox = config?.defaults?.sandbox ?? {};
  if (sandbox.enabled === false) return { enabled: false, reason: 'sandbox.enabled is false in run.json' };
  const project = root === null ? [] : projectEcosystems({ root, planFiles }).domains;
  const extra = Array.isArray(sandbox.allowedDomains) ? sandbox.allowedDomains.map(String) : [];
  return { enabled: true, allowedDomains: [...new Set([...project, ...extra])] };
}

export function sandboxSettings(mode, { tail = false } = {}) {
  if (!mode.enabled) return null;
  const excludedCommands = [...new Set(unsandboxedScripts(tail).flatMap((file) => spellings(file).flatMap((spelling) => [`node "${spelling}"`, `node ${spelling}`, `node "${spelling}":*`, `node ${spelling}:*`])))];
  return {
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      excludedCommands,
      network: { allowedDomains: mode.allowedDomains }
    }
  };
}
