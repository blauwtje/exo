// The hard font ban shared by direction.mjs (the contract check) and
// check-ui.mjs (the overused-font tell), so both read one list and agree on
// what "names a banned family" means. A banned name also covers its
// superfamily: "Roboto" bans "Roboto Slab", never "Robotech". Nothing is written.
//
// Criterion: a family is banned when a page gets it without anyone choosing it.
// 1. Google Fonts' popularity order in fonts.google.com/metadata/fonts, read
//    2026-09-16: walked from the top, skipping a family whose name extends one
//    already listed, until 30 were listed; Noto Sans JP then left, because
//    Noto Sans, listed after it, covers it.
// 2. The system UI face of Windows, macOS and iOS, and the default serif and
//    sans-serif browsers fall back to; Android's Roboto is already in part 1.
// 3. What models pick when nobody steers them: benchmarks/font-defaults-probe.mjs
//    with --runs 3 on 2026-09-16, every family picked for two or more briefs.
// 4. What models fall back on once parts 1 to 3 are banned: the same probe with
//    --avoid-overused, the same threshold, not already covered above.
// Inter and Geist stay off the list: a modern neutral sans that fits the mood is a valid pick.
// Rebuild the list by rerunning these four steps, never by adding a name by hand.

export const OVERUSED_FONTS = Object.freeze([
  'Roboto', 'Open Sans', 'Google Sans', 'Montserrat', 'Poppins',
  'Lato', 'Arimo', 'Oswald', 'Noto Sans', 'DM Sans', 'Raleway', 'Nunito',
  'Playfair Display', 'Rubik', 'Ubuntu', 'Manrope', 'Outfit', 'Kanit',
  'Archivo Black', 'Merriweather', 'Lora', 'Work Sans', 'Plus Jakarta Sans',
  'Quicksand', 'PT Sans', 'Figtree', 'Bebas Neue', 'Mulish',
  'Segoe UI', 'SF Pro', 'Arial', 'Helvetica', 'Times New Roman',
  'Fraunces', 'Space Grotesk', 'IBM Plex Sans', 'Söhne', 'Karla',
  'Source Serif', 'Source Sans', 'Public Sans', 'Fredoka', 'Atkinson Hyperlegible',
  'Freight Text', 'Bricolage Grotesque', 'Canela', 'Instrument Sans', 'Charter',
  'Hanken Grotesk', 'Cormorant Garamond', 'Lexend', 'Libre Franklin', 'Literata',
  'Newsreader', 'Sora', 'Spectral', 'Barlow Semi Condensed', 'Cooper Hewitt',
  'Frutiger', 'General Sans', 'Instrument Serif', 'JetBrains Mono', 'Red Hat Text',
  'Untitled Sans'
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
