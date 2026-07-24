import { requireUser } from "@/lib/auth";

export default async function ProductivityPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Productivity &amp; Quota</h1>
      <p className="text-sm text-muted-foreground">
        Quota-cycle progress, completed cycles, DLP/COT breakdown, turnaround time, and revision rate land in Phase 2
        once point awarding and quota cycles are built.
      </p>
    </div>
  );
}
