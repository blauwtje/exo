export function bestEffort(work) {
  try {
    work();
  } catch {
    return;
  }
}
