export const OVERUSED_FONTS = Object.freeze([
  'Roboto', 'Open Sans', 'Google Sans', 'Montserrat', 'Poppins',
  'Lato', 'Arimo', 'Oswald', 'Noto Sans', 'DM Sans', 'Raleway', 'Nunito',
  'Playfair Display', 'Rubik', 'Ubuntu', 'Manrope', 'Outfit', 'Kanit',
  'Archivo', 'Merriweather', 'Lora', 'Work Sans', 'Plus Jakarta Sans',
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

export function normalizeFamily(name) {
  return String(name ?? '').trim().replace(/^["']+|["']+$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

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
