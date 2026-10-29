const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function readPort(raw) {
  if (!raw) return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid PORT: ${raw}`);
  return port;
}

function readLogLevel(raw) {
  if (!raw) return 'info';
  const level = raw.toLowerCase();
  if (!LOG_LEVELS.includes(level)) throw new Error(`invalid LOG_LEVEL: ${raw}`);
  return level;
}

export function loadConfig(env = process.env) {
  return { port: readPort(env.PORT), logLevel: readLogLevel(env.LOG_LEVEL) };
}
