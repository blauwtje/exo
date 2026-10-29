export function rankScores(scores) {
  return scores.map((score) => 1 + scores.filter((other) => other > score).length);
}
