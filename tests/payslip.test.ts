import { describe, expect, it } from "vitest";

import { renderPayslipHtml } from "@/lib/payroll/payslip-html";

describe("payslip html", () => {
  it("renders a second page with hourly sessions when provided", () => {
    const html = renderPayslipHtml({
      fullName: "Josh Mediona",
      from: "2026-08-01",
      to: "2026-08-09",
      hourly: { hours: 20, rate: 55, amount: 1100 },
      gross: 1100,
      cashAdvance: 0,
      net: 1100,
      hourlySessions: [
        { dateLabel: "Sat, Aug 8", timeIn: "8:41 AM", timeOut: "6:47 PM", hours: 10.1 },
        { dateLabel: "Fri, Aug 7", timeIn: "8:39 AM", timeOut: "6:36 PM", hours: 9.9 },
      ],
    });
    expect(html).toContain("page-break-before:always");
    expect(html).toContain("Approved clock-in / clock-out");
    expect(html).toContain("6:47 PM");
    expect(html).toContain("Total hours");
    expect(html).toContain("20.00"); // 10.10 + 9.90
  });

  it("renders a second page with credited projects for quota staff", () => {
    const html = renderPayslipHtml({
      fullName: "Ralph Alcaide",
      from: "2026-08-01",
      to: "2026-08-09",
      quota: { points: 2, perSubjectRate: 166.67, amount: 333.34 },
      gross: 333.34,
      cashAdvance: 0,
      net: 333.34,
      quotaItems: [
        { label: "DLP", detail: "Grade 3 · Math · Week 1", points: 1, dateLabel: "Aug 7" },
        { label: "PPT", detail: "Grade 5 · EPP-AFA · Week 8", points: 1, dateLabel: "Aug 7" },
      ],
    });
    expect(html).toContain("page-break-before:always");
    expect(html).toContain("Projects credited to points");
    expect(html).toContain("Grade 5 · EPP-AFA · Week 8");
    expect(html).toContain("Total points");
  });

  it("omits the second page when there is no detail", () => {
    const html = renderPayslipHtml({
      fullName: "No Detail",
      from: "2026-08-01",
      to: "2026-08-09",
      hourly: { hours: 5, rate: 50, amount: 250 },
      gross: 250,
      cashAdvance: 0,
      net: 250,
    });
    expect(html).not.toContain("page-break-before:always");
  });
});
