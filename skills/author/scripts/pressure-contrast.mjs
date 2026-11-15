import { UsageError } from '#script-flags';

export function parseContrastEnv(value) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=([^,=]+),([^,=]+)$/.exec(value);
  if (!match) throw new UsageError(`--contrast-env needs NAME=<a>,<b>, got '${value}'`);
  if (match[2] === match[3]) throw new UsageError(`--contrast-env needs two different values, got '${match[2]}' twice`);
  return { name: match[1], values: [match[2], match[3]] };
}

export function parseContrastStyle(value) {
  const values = value.split(',');
  if (values.length !== 2 || values.some((style) => style === '')) throw new UsageError(`--contrast-style needs <a>,<b>, got '${value}'`);
  if (values[0] === values[1]) throw new UsageError(`--contrast-style needs two different values, got '${values[0]}' twice`);
  return { style: true, name: 'outputStyle', values };
}

export function contrastArms({ pluginDir, contrast }) {
  const flags = ['--plugin-dir', pluginDir];
  if (contrast.style) {
    return contrast.values.map((outputStyle, at) => ({
      name: at === 0 ? 'with' : 'contrast',
      pluginDir,
      flags: [...flags, '--settings', JSON.stringify({ outputStyle })],
      outputStyle
    }));
  }
  return [
    { name: 'with', pluginDir, flags, env: { [contrast.name]: contrast.values[0] } },
    { name: 'contrast', pluginDir, flags, env: { [contrast.name]: contrast.values[1] } }
  ];
}
