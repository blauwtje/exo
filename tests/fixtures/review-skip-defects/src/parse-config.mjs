export const DEFAULT_PORT = 8080;

export const DEFAULT_CONFIG = { host: 'localhost', port: 8080 };

export function parsePort(text) {
  const port = Number.parseInt(text, 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

export function parseConfig(text) {
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {}
  return {
    host: typeof parsed.host === 'string' ? parsed.host : DEFAULT_CONFIG.host,
    port: parsePort(parsed.port)
  };
}

export function legacyPort(text) {
  return parsePort(text.trim());
}
