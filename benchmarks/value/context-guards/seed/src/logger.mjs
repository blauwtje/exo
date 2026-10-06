const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ level = process.env.LOG_LEVEL ?? 'debug', stream = process.stderr } = {}) {
  const minimum = LEVELS[level] ?? LEVELS.debug;
  const write = (name) => (message) => {
    if (LEVELS[name] < minimum) return;
    stream.write(`${new Date().toISOString()} ${name.toUpperCase().padEnd(5)} ${message}\n`);
  };
  return { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}
