import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { binaryReadTokens, imageTokenCap, pdfPageTokens } from './context-limits.mjs';

const IMAGE_LONG_EDGE = 1568;
const IMAGE_PIXELS_PER_TOKEN = 750;
const HEAD_BYTES = 1 << 20;
const SNIFF_BYTES = 4096;
const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z])/g;
const PAGE_COUNT = /\/Count\s+(\d+)/g;
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);


function head(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, bytes, 0));
  } finally {
    fs.closeSync(fd);
  }
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('latin1', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function gifSize(buffer) {
  if (buffer.length < 10 || !buffer.toString('latin1', 0, 3).startsWith('GIF')) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (SOF_MARKERS.has(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    offset += marker === 0xff ? 1 : 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

const WEBP_SIZES = {
  'VP8X': (buffer) => ({ width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }),
  'VP8 ': (buffer) => ({ width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }),
  'VP8L': (buffer) => {
    const bits = buffer.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  },
};

function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  return WEBP_SIZES[buffer.toString('latin1', 12, 16)]?.(buffer) ?? null;
}

export function imageSize(buffer) {
  return pngSize(buffer) ?? gifSize(buffer) ?? jpegSize(buffer) ?? webpSize(buffer);
}

export function imageTokens(size, home = os.homedir()) {
  const cap = imageTokenCap(home);
  if (!size || !(size.width > 0) || !(size.height > 0)) return cap;
  const scale = Math.min(1, IMAGE_LONG_EDGE / Math.max(size.width, size.height));
  return Math.min(cap, Math.ceil((size.width * scale * size.height * scale) / IMAGE_PIXELS_PER_TOKEN));
}

export function pdfPages(buffer) {
  const text = buffer.toString('latin1');
  const objects = (text.match(PAGE_OBJECT) ?? []).length;
  const counted = Math.max(0, ...[...text.matchAll(PAGE_COUNT)].map((match) => Number(match[1])));
  return Math.max(1, objects, counted);
}

function isImage(buffer) {
  return imageSize(buffer) !== null || buffer.toString('latin1', 0, 4) === 'RIFF' || buffer.toString('latin1', 0, 2) === '\xff\xd8';
}

const isPdf = (buffer) => buffer.toString('latin1', 0, 5) === '%PDF-';
const isBinary = (buffer) => buffer.includes(0);

export function fileTokens(file, { bytesPerToken, size, home = os.homedir() }) {
  const sniffed = head(file, Math.min(size, SNIFF_BYTES));
  if (isPdf(sniffed)) return pdfPages(fs.readFileSync(file)) * pdfPageTokens(home);
  if (isImage(sniffed) || /\.(png|jpe?g|gif|webp)$/i.test(file)) return imageTokens(imageSize(head(file, Math.min(size, HEAD_BYTES))), home);
  if (isBinary(sniffed)) return binaryReadTokens(home);
  return size / bytesPerToken;
}

function uidSuffix() {
  return typeof process.getuid === 'function' ? `claude-${process.getuid()}` : 'claude';
}

export function sessionTempRoots(env = process.env) {
  const suffix = uidSuffix();
  const roots = [env.TMPDIR, os.tmpdir(), '/private/tmp', '/tmp'].filter(Boolean).map((root) => path.join(root, suffix));
  return [...new Set(roots)];
}

const projectSlug = (directory) => directory.replace(/[^A-Za-z0-9]/g, '-');

function sessionIdOf(session) {
  if (typeof session?.session_id === 'string' && session.session_id) return session.session_id;
  if (typeof session?.transcript_path === 'string') return path.basename(session.transcript_path, '.jsonl');
  return null;
}

function slugsOf(session, cwd) {
  const slugs = [];
  if (typeof session?.transcript_path === 'string') slugs.push(path.basename(path.dirname(session.transcript_path)));
  for (const directory of [session?.cwd, cwd]) if (typeof directory === 'string' && directory) slugs.push(projectSlug(directory));
  return slugs;
}

function childDirectories(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function sessionImageDirs(session, cwd, env = process.env) {
  const id = sessionIdOf(session);
  if (!id) return [];
  const dirs = [];
  for (const root of sessionTempRoots(env)) {
    const slugs = [...new Set([...slugsOf(session, cwd), ...childDirectories(root)])];
    for (const slug of slugs) dirs.push(path.join(root, slug, id, 'images'));
  }
  return dirs;
}

function repoRoot(base) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function searchDirectories(base, session, env = process.env) {
  const root = repoRoot(base);
  return [base, ...(root && root !== base ? [root] : []), ...sessionImageDirs(session, base, env)];
}

export function resolveRead(name, { base, session, env = process.env }) {
  if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
  const found = searchDirectories(base, session, env).map((directory) => path.resolve(directory, name));
  return found.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function searchedDirectories(base, session, env = process.env) {
  const directories = searchDirectories(base, session, env);
  const images = sessionImageDirs(session, base, env);
  const existing = directories.filter((directory) => fs.existsSync(directory));
  return images.length && !existing.some((directory) => images.includes(directory)) ? [...existing, images[0]] : existing;
}
