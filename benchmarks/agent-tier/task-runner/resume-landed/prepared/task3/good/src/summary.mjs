import { mean } from './mean.mjs';
import { span } from './span.mjs';

export function summary(values) {
  return { span: span(values), mean: mean(values) };
}
