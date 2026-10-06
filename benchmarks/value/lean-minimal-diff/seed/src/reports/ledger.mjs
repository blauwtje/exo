import { line } from "../shared/cell.mjs";
import { isoDay } from "../shared/dates.mjs";

const HEAD = ["date", "account", "memo", "amount"];

// Tab-separated, because the accountants paste it straight into their sheet.
export function ledgerToTsv(entries) {
  const rows = entries.map((e) =>
    line([isoDay(e.date), e.account, e.memo, e.amountCents / 100], "\t"),
  );
  return [line(HEAD, "\t"), ...rows].join("\n") + "\n";
}
