import { line } from "../shared/cell.mjs";

export function dumpAudit(events) {
  return events.map((e) => line([e.at, e.actor, e.action, e.target])).join("\n") + "\n";
}
