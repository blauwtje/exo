import path from 'node:path';
import { gradeRun } from '../grade.mjs';

await gradeRun({ planId: path.basename(import.meta.dirname), allowed: [[1, 2], []] });
