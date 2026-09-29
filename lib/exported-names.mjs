// The names a JavaScript or TypeScript file exports. Names are matched by
// pattern at the start of a line, with no parser: an export inside a template
// literal is matched too, while `export const { a } = b` and
// `module.exports = { a }` are not. A parser would lift that limit, and this
// module takes no dependency.

export const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARED_NAME = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|function|class|const|let|var|interface|type|enum|namespace)\b\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const NAME_LIST = /^export\s+(?:type\s+)?\{([^}]*)\}/gm;
const NAMESPACE_NAME = /^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm;
const COMMONJS_NAME = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm;
const ANONYMOUS_DEFAULT = /^export\s+default\b(?!\s+(?:abstract\s+)?(?:async\s+)?(?:function|class)\b\s*\*?\s*[A-Za-z_$])/m;

export function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(DECLARED_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAMESPACE_NAME)) names.add(match[1]);
  for (const match of source.matchAll(COMMONJS_NAME)) names.add(match[1]);
  for (const match of source.matchAll(NAME_LIST)) {
    for (const entry of match[1].split(',')) {
      // `local as exported` and `type Name` both end on the exported name.
      const words = entry.trim().split(/\s+/);
      const exportedAs = words.at(-1);
      if (IDENTIFIER.test(exportedAs)) names.add(exportedAs);
    }
  }
  if (ANONYMOUS_DEFAULT.test(source)) names.add('default');
  return [...names];
}
