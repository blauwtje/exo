// Append-only log. record stamps id and time; the caller names who did what
// to which entity, and what changed as { field: { from, to } }.
export function createAuditLog(now) {
  const events = [];
  let sequence = 0;

  return {
    record({ actor, action, entity, changes = {} }) {
      sequence += 1;
      const event = { id: `evt-${sequence}`, at: now(), actor, action, entity, changes };
      events.push(event);
      return event;
    },
    list({ entity } = {}) {
      const wanted = entity ?? null;
      return events
        .filter((event) => wanted === null || `${event.entity?.type}:${event.entity?.id}` === wanted)
        .map((event) => structuredClone(event));
    },
  };
}
