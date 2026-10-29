export function rankScores(scores) {
  return scores.map((score) => 1 + new Set(scores.filter((other) => other > score)).size);
}
