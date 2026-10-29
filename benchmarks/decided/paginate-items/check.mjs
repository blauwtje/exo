import path from 'node:path';
import { runHiddenCheck } from '../check-runner.mjs';

runHiddenCheck(path.resolve(process.argv[2]), process.argv[3]);
