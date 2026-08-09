import type { PointLine } from "@/lib/payroll/breakdown";

export type PaidSplit = { paidLines: PointLine[]; unpaidLines: PointLine[] };

/**
 * Splits an editor's breakdown lines into those already covered by past payouts
 * and those still unpaid, by walking oldest-first and marking the first
 * `paidPoints` worth as paid. A line straddling the boundary stays on the unpaid
 * side (never hide unpaid work). Gives the live view its clean unpaid-only list
 * and each payout its covered-projects snapshot.
 */
export function splitPaidUnpaid(lines: PointLine[], paidPoints: number): PaidSplit {
  const sorted = [...lines].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const paidLines: PointLine[] = [];
  const unpaidLines: PointLine[] = [];
  const eps = 1e-9;
  let acc = 0;
  for (const line of sorted) {
    // Only positive-earning lines consume the paid budget; negative corrections
    // (removals/deductions) always stay on the unpaid side so they're visible.
    if (line.points > 0 && acc + line.points <= paidPoints + eps) {
      paidLines.push(line);
      acc += line.points;
    } else {
      unpaidLines.push(line);
    }
  }
  return { paidLines, unpaidLines };
}
