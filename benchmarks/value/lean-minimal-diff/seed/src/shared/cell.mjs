// Cell and line formatting for delimited-text output (exports, reports, dumps).
// Values come from users and imports, so each cell is made safe to open in a
// spreadsheet before it is joined into a line.

const FORMULA_START = /^[=+\-@\t\r]/;

function wrap(text) {
  return `"${text.replaceAll('"', '""')}"`;
}

// One cell. null and undefined are empty, dates are ISO timestamps, and text
// that a spreadsheet would run as a formula gets a leading apostrophe. Text
// that holds the separator, a double quote, a line break or edge whitespace
// is wrapped. Numbers are never treated as formulas, so -5 stays -5.
export function cell(value, sep = ",") {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  const wrapped = text.includes(sep) || /["\r\n]/.test(text) || text !== text.trim();
  return wrapped ? wrap(text) : text;
}

// One line, without the line break.
export function line(values, sep = ",") {
  return values.map((value) => cell(value, sep)).join(sep);
}
