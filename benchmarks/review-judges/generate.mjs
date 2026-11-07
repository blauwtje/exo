import path from 'node:path';
import { writeJudges } from '../../lib/review-judges.mjs';

writeJudges(path.resolve(import.meta.dirname, '..', '..'));
