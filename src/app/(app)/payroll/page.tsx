import { requireRole } from "@/lib/auth";

export default async function PayrollPage() {
  await requireRole("owner", "admin");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Payroll Period</h1>
      <p className="text-sm text-muted-foreground">
        Time logs, hourly approvals, and the payroll CSV export land in Phase 3.
      </p>
    </div>
  );
}
