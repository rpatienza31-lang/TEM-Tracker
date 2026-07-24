import Link from "next/link";
import { asc } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getDashboardCounts, getMyWorkItems } from "@/lib/work-items/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireUser();
  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive);

  if (user.role === "editor") {
    const [active, submitted, revisions] = await Promise.all([
      getMyWorkItems(user.id, ["claimed"]),
      getMyWorkItems(user.id, ["in_review"]),
      getMyWorkItems(user.id, ["revision"]),
    ]);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Welcome, {user.fullName.split(" ")[0]}</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Claimed" value={active.length} href="/my-work" />
          <StatCard label="Awaiting review" value={submitted.length} href="/my-work" />
          <StatCard label="Needs revision" value={revisions.length} href="/my-work" tone={revisions.length > 0 ? "warn" : undefined} />
        </div>
        <p className="text-sm text-muted-foreground">
          Quota-cycle progress (e.g. 14.5 / 21 · cycle #3) arrives in Phase 2.
        </p>
      </div>
    );
  }

  const counts = await getDashboardCounts(activeTerm?.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeTerm ? `Active term: ${activeTerm.name}` : "No active term set — configure one in Admin / Setup."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Overdue" value={counts?.overdue ?? 0} href="/board?overdueOnly=1" tone="danger" />
        <StatCard label="Due soon (3d)" value={counts?.dueSoon ?? 0} href="/board" tone="warn" />
        <StatCard label="Unclaimed at risk" value={counts?.atRisk ?? 0} href="/board?availableOnly=1" tone="warn" />
        <StatCard label="Awaiting review" value={counts?.inReview ?? 0} href="/review" />
        <StatCard label="Available" value={counts?.available ?? 0} href="/board?status=available" />
        <StatCard label="Claimed" value={counts?.claimed ?? 0} href="/board?status=claimed" />
        <StatCard label="Approved" value={counts?.approved ?? 0} href="/board?status=approved" />
        <StatCard label="Uploaded" value={counts?.uploaded ?? 0} href="/board?status=uploaded" />
      </div>
      <p className="text-sm text-muted-foreground">Editor leaderboard and quota-cycle progress arrive in Phase 2.</p>
    </div>
  );
}

function StatCard({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "danger" | "warn" }) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-accent">
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className={tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : undefined}>
            {value}
          </CardTitle>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
