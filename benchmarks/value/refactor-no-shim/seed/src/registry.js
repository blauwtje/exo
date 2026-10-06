import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config/models.json', import.meta.url), 'utf8'));

export const exportModel = config.exportModel;

// Collects every export of the model files named in config/models.json.
export async function loadModels(files = config.files) {
  const models = {};
  for (const file of files) {
    const mod = await import(`./models/${file}.js`);
    Object.assign(models, mod);
  }
  return models;
}
