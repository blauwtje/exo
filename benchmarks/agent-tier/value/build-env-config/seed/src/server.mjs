import { loadConfig } from './config.mjs';

export function describeServer(config = loadConfig()) {
  return `listening on :${config.port} (log level ${config.logLevel})`;
}
