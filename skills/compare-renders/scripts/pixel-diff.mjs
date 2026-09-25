// Exact pixel comparison for the compare-renders skill: a pair passes only when
// both PNGs have the same size and every RGBA byte matches, with no tolerance
// and no sampling, so a one-pixel drift fails the same way a broken layout does.
//
//   node scripts/pixel-diff.mjs --baseline <png> --candidate <png>
//                               [--baseline <png> --candidate <png> …]
//
// Pass one --candidate per --baseline, in the same order. One line per pair:
//   PASS <candidate> differing=0 of <pixels>
//   FAIL <candidate> differing=<n> of <pixels> box=<x>,<y> <w>x<h>
//   FAIL <candidate> size <w>x<h> against baseline <w>x<h>
// Exit 0 when every pair passes, 1 when any fails, 2 on a usage or decode error.

import fs from 'node:fs/promises';
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { inflateSync } from 'node:zlib';

import { parseFlags, UsageError } from '#script-flags';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
// Browser screenshots are 8-bit truecolor, with or without alpha; other PNG kinds are refused.
const BYTES_PER_PIXEL = { 2: 3, 6: 4 };

export class UnsupportedPngError extends Error {}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toUpperLeft = Math.abs(estimate - upperLeft);
  if (toLeft <= toAbove && toLeft <= toUpperLeft) return left;
  return toAbove <= toUpperLeft ? above : upperLeft;
}

function unfilterRow(filterType, row, previous, bytesPerPixel) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const above = previous[index];
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    if (filterType === 1) row[index] = (row[index] + left) % 256;
    else if (filterType === 2) row[index] = (row[index] + above) % 256;
    else if (filterType === 3) row[index] = (row[index] + Math.floor((left + above) / 2)) % 256;
    else if (filterType === 4) row[index] = (row[index] + paeth(left, above, upperLeft)) % 256;
    else if (filterType !== 0) throw new UnsupportedPngError(`unknown row filter ${filterType}`);
  }
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG into one RGBA byte array. */
export function decodePng(bytes) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new UnsupportedPngError('not a PNG file');
  }
  let header = null;
  const compressed = [];
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') compressed.push(data);
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header || header.length < 13) throw new UnsupportedPngError('no IHDR chunk');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bytesPerPixel = BYTES_PER_PIXEL[header[9]];
  if (header[8] !== 8 || !bytesPerPixel || header[12] !== 0) {
    throw new UnsupportedPngError(
      `only 8-bit non-interlaced RGB or RGBA is supported (bit depth ${header[8]}, color type ${header[9]}, interlace ${header[12]})`
    );
  }
  let raster;
  try {
    raster = inflateSync(Buffer.concat(compressed));
  } catch (error) {
    throw new UnsupportedPngError(`corrupt image data (${error.message})`);
  }
  const stride = width * bytesPerPixel;
  if (raster.length < (stride + 1) * height) throw new UnsupportedPngError('image data is shorter than the declared size');

  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const row = Uint8Array.from(raster.subarray(start + 1, start + 1 + stride));
    unfilterRow(raster[start], row, previous, bytesPerPixel);
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      pixels.set(row.subarray(x * bytesPerPixel, x * bytesPerPixel + 3), target);
      pixels[target + 3] = bytesPerPixel === 4 ? row[x * 4 + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

/**
 * Compares two decoded PNGs pixel by pixel. A size mismatch is reported as such
 * rather than cropped, because cropping would hide the drift that changed the size.
 */
export function diffImages(baseline, candidate) {
  const total = baseline.width * baseline.height;
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return { pass: false, sizeMismatch: true, total, differing: null, box: null };
  }
  const { width, height } = baseline;
  let differing = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (baseline.pixels[offset] === candidate.pixels[offset]
        && baseline.pixels[offset + 1] === candidate.pixels[offset + 1]
        && baseline.pixels[offset + 2] === candidate.pixels[offset + 2]
        && baseline.pixels[offset + 3] === candidate.pixels[offset + 3]) continue;
      differing += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const box = differing === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return { pass: differing === 0, sizeMismatch: false, total, differing, box };
}

export function verdictLine(candidateFile, baseline, candidate, diff) {
  if (diff.sizeMismatch) {
    return `FAIL ${candidateFile} size ${candidate.width}x${candidate.height} against baseline ${baseline.width}x${baseline.height}`;
  }
  const counted = `differing=${diff.differing} of ${diff.total}`;
  if (diff.pass) return `PASS ${candidateFile} ${counted}`;
  const { x, y, width, height } = diff.box;
  return `FAIL ${candidateFile} ${counted} box=${x},${y} ${width}x${height}`;
}

async function loadPng(file) {
  const bytes = await fs.readFile(file).catch((error) => {
    throw new UsageError(`cannot read '${file}': ${error.message}`);
  });
  try {
    return decodePng(bytes);
  } catch (error) {
    if (error instanceof UnsupportedPngError) throw new UnsupportedPngError(`'${file}': ${error.message}`);
    throw error;
  }
}

async function main(argv) {
  const flags = parseFlags(argv, { baseline: 'list', candidate: 'list' });
  const baselines = flags.baseline ?? [];
  const candidates = flags.candidate ?? [];
  if (baselines.length === 0) throw new UsageError('--baseline is required');
  if (baselines.length !== candidates.length) {
    throw new UsageError(`pass one --candidate per --baseline (${baselines.length} baselines, ${candidates.length} candidates)`);
  }
  let allPass = true;
  for (let index = 0; index < baselines.length; index += 1) {
    const baseline = await loadPng(baselines[index]);
    const candidate = await loadPng(candidates[index]);
    const diff = diffImages(baseline, candidate);
    if (!diff.pass) allPass = false;
    process.stdout.write(`${verdictLine(candidates[index], baseline, candidate, diff)}\n`);
  }
  return allPass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      const known = error instanceof UsageError || error instanceof UnsupportedPngError;
      process.stderr.write(`pixel-diff: ${known ? error.message : error.stack}\n`);
      process.exitCode = 2;
    }
  );
}
