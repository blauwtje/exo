// The flag grammar every skill script with a command line shares, so a bad
// argument fails the same way in each of them. Imported as `#script-flags`,
// because a skill script never reaches into another skill's folder.

/** Invalid arguments: the caller gets exit 2 and an empty stdout. */
export class UsageError extends Error {}

export function parseFlags(argv, spec) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new UsageError(`unexpected argument '${token}'`);
    const name = token.slice(2);
    const kind = spec[name];
    if (!kind) throw new UsageError(`unknown flag '${token}'`);
    if (kind === 'boolean') {
      values[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`flag '${token}' needs a value`);
    }
    index += 1;
    if (kind === 'list') {
      (values[name] ??= []).push(value);
    } else {
      values[name] = value;
    }
  }
  return values;
}
