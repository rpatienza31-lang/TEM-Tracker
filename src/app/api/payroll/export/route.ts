import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth";
import { getPayrollReport, payrollReportToCsv } from "@/lib/payroll/report";

export async function GET(request: NextRequest) {
  await requireRole("owner", "admin");

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to query params are required" }, { status: 400 });
  }

  const report = await getPayrollReport(from, to);
  const csv = payrollReportToCsv(report);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll-${from}-to-${to}.csv"`,
    },
  });
}
