
import fs from 'node:fs';
import path from 'node:path';
import { sectionBody, UNRELEASED_HEADING } from './lib/changelog.mjs';

const changelog = fs.readFileSync(path.join(import.meta.dirname, '..', 'CHANGELOG.md'), 'utf8');
const unreleased = sectionBody(changelog, UNRELEASED_HEADING);
console.log(unreleased ? 'yes' : 'no');
