import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repo = path.resolve(process.argv[2] ?? '.');
const file = path.join(repo, 'answer.txt');
const EXPECTED = '30';

const answer = existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
const detail = answer === EXPECTED ? [] : [answer === null ? 'answer.txt is missing' : `answer.txt holds "${answer}", want "${EXPECTED}"`];

process.stdout.write(`${JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: 1, detail })}\n`);
