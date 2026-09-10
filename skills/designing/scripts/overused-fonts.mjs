// The hard font ban shared by font-candidates.mjs (candidate exclusion) and
// check-ui.mjs (the overused-font tell), so both read one list and agree on
// what "names a banned family" means. A banned name also covers its
// superfamily: "Inter" bans "Inter Tight", never "Interstate". Nothing is written.

export const OVERUSED_FONTS = Object.freeze([
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Arial', 'Helvetica', 'Helvetica Neue',
  'Fraunces', 'Instrument Sans', 'Instrument Serif',
  'Geist', 'Geist Mono', 'Mona Sans', 'Plus Jakarta Sans',
  'Space Grotesk', 'Space Mono', 'Recoleta',
  'Playfair Display', 'Cormorant', 'Cormorant Garamond',
  'Lora', 'Crimson Text', 'Crimson Pro', 'Newsreader', 'Syne',
  'IBM Plex', 'DM Sans', 'DM Serif Display', 'DM Serif Text', 'DM Mono',
  'Outfit', 'Manrope', 'Nunito', 'Raleway', 'Work Sans',
  'Bebas Neue', 'Oswald', 'Merriweather', 'Source Sans 3'
]);

/** Lowercase, unquoted, single-spaced: the one form both sides compare. */
export function normalizeFamily(name) {
  return String(name ?? '').trim().replace(/^["']+|["']+$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The banned family names, normalized. */
export function loadOverusedFonts() {
  return OVERUSED_FONTS.map(normalizeFamily);
}

export function isOverusedFamily(name, list = loadOverusedFonts()) {
  const family = normalizeFamily(name);
  if (family.length === 0) return false;
  return list.some((entry) => {
    const banned = normalizeFamily(entry);
    return family === banned || family.startsWith(`${banned} `);
  });
}
