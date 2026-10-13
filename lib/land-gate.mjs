export function equalsLandGate(command, landGate) {
  if (command === undefined || landGate === undefined || landGate === null) return false;
  return command.replace(/^`|`$/g, '').trim() === landGate.replace(/^`|`$/g, '').trim();
}
