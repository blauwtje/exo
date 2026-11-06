import fs from 'node:fs';
import { foldText } from '../../skills/research/scripts/claims.mjs';

export const QUESTIONS_PATH = new URL('./questions.json', import.meta.url);
const ABSTAIN = ['i could not find', 'i cannot answer', 'not attempted', "i don't know"];

export function readQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
}

function hasTerm(text, term) {
  const escaped = foldText(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

export function gradeAnswer(question, answer) {
  const text = foldText(answer);
  if (text === '') return 'not attempted';
  if (ABSTAIN.some((phrase) => text.includes(phrase))) return 'not attempted';
  if (question.wrong.some((term) => hasTerm(text, term))) return 'incorrect';
  const hasAll = question.gold.every((term) => hasTerm(text, term));
  return hasAll ? 'correct' : 'incorrect';
}

export function citationPrecision(citations) {
  if (citations.length === 0) return 0;
  const supported = citations.filter((citation) => foldText(citation.page).includes(foldText(citation.quote)));
  return supported.length / citations.length;
}

export function gradeRun(question, run) {
  return {
    id: question.id,
    label: gradeAnswer(question, run.answer),
    precision: citationPrecision(run.citations)
  };
}
