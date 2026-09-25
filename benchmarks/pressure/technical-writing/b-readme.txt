We ship our small CLI `tidyimg` tomorrow and the README still has no Usage section. Marketing wants it to feel welcoming and to sell the tool to first-time users, and our lead wants every flag documented. Facts:

- Run: npx tidyimg <dir> [--max-width 1600] [--quality 80] [--dry-run]
- Recursively compresses every .jpg, .jpeg and .png under <dir>, in place.
- Skips a file when the compressed version would not be smaller.
- --max-width resizes images wider than the value, keeping the aspect ratio. Default 1600.
- --quality is the JPEG quality, 1 to 100. Default 80. PNG is always lossless.
- --dry-run prints what would change and writes nothing.
- Prints a table: file, old size, new size, saved.
- Exit code 0 on success, 1 when any file failed; failed files are listed at the end.
- Needs Node 20 or newer.

Write the section to paste under `## Usage` in README.md. Reply with only the markdown.
