import { line } from "../shared/cell.mjs";
import { isoDay } from "../shared/dates.mjs";

export const CUSTOMER_COLUMNS = ["id", "name", "email", "phone", "company", "joined", "notes"];

export function customersToCsv(customers) {
  const rows = customers.map((c) =>
    line([c.id, c.name, c.email, c.phone, c.company, isoDay(c.joined), c.notes]),
  );
  return [line(CUSTOMER_COLUMNS), ...rows].join("\n") + "\n";
}
