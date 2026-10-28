import { spawn } from 'node:child_process';
import path from 'node:path';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';
import { insideClaudeCode, resolveClaude } from './run-session.mjs';

const USAGE = 'usage: exo claude [--provider <name>] [--effort <level>] [-- <claude args>]';

function parseArgs(args) {
  const separator = args.indexOf('--');
  const own = separator < 0 ? args : args.slice(0, separator);
  const passed = separator < 0 ? [] : args.slice(separator + 1);
  const flags = {};
  for (let at = 0; at < own.length; at += 2) {
    const name = own[at];
    if (!['--provider', '--effort'].includes(name) || own[at + 1] === undefined) return { refused: USAGE };
    flags[name.slice(2)] = own[at + 1];
  }
  return { flags, passed };
}

export function claudeEnvironment({ config, keys, home, env, provider: name, effort }) {
  if (!Object.hasOwn(config.providers, name)) {
    return { refused: `refused: unknown provider ${JSON.stringify(name)}; known: ${Object.keys(config.providers).join(', ')}` };
  }
  if (effort !== undefined && !config.efforts.includes(effort)) {
    return { refused: `refused: unknown effort ${JSON.stringify(effort)}; use one of ${config.efforts.join(', ')}` };
  }
  const resolved = resolveProvider(config, name, keys, effort, home);
  if (resolved.refused !== undefined) return { refused: `refused: ${resolved.refused}` };
  const inherited = { ...env };
  if (name !== 'claude') delete inherited.ANTHROPIC_API_KEY;
  const setsEffort = effort !== undefined || config.providers[name].effort !== undefined;
  return {
    env: { ...inherited, ...resolved.env, ...(setsEffort ? { CLAUDE_CODE_EFFORT_LEVEL: resolved.effort } : {}) }
  };
}

function runChild(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGQUIT']) process.on(signal, () => {});
    child.on('error', (error) => resolve({ refused: `refused: cannot start claude: ${error.message}` }));
    child.on('exit', (code) => resolve({ code: code ?? 1 }));
  });
}

function loadConfig(home) {
  try {
    return { config: loadRunConfig({ home }) };
  } catch (error) {
    return { refused: `refused: ${path.join(configDir(home), 'run.json')} does not load: ${error.message}` };
  }
}

export async function startClaude(args, { home, env = process.env }) {
  if (insideClaudeCode(env)) return { refused: 'refused: exo claude starts an interactive session and runs only from a terminal, not inside a Claude Code session' };
  const parsed = parseArgs(args);
  if (parsed.refused) return parsed;
  const loaded = loadConfig(home);
  if (loaded.refused) return loaded;
  const { config } = loaded;
  const built = claudeEnvironment({
    config,
    keys: readKeys(path.join(configDir(home), 'keys.env')),
    home,
    env,
    provider: parsed.flags.provider ?? config.defaults.provider,
    effort: parsed.flags.effort
  });
  if (built.refused) return built;
  const claude = resolveClaude({ pathValue: env.PATH ?? '' });
  if (claude.refused) return { refused: `refused: ${claude.refused}` };
  return runChild(claude.command, [...claude.prefix, ...parsed.passed], built.env);
}
