import Link from "next/link";
import { asc } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getDashboardCounts, getMyWorkItems } from "@/lib/work-items/queries";
import { getProductivityStats } from "@/lib/quota/productivity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/progress-bar";

export default async function DashboardPage() {
  const user = await requireUser();
  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive);

  if (user.role === "editor") {
    const [active, submitted, revisions, stats] = await Promise.all([
      getMyWorkItems(user.id, ["claimed"]),
      getMyWorkItems(user.id, ["in_review"]),
      getMyWorkItems(user.id, ["revision"]),
      getProductivityStats(),
    ]);
    const mine = stats.find((s) => s.editorId === user.id);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Welcome, {user.fullName.split(" ")[0]}</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Claimed" value={active.length} href="/my-work" />
          <StatCard label="Awaiting review" value={submitted.length} href="/my-work" />
          <StatCard label="Needs revision" value={revisions.length} href="/my-work" tone={revisions.length > 0 ? "warn" : undefined} />
        </div>
        {mine && (
          <Card className="max-w-sm">
            <CardHeader className="pb-2">
              <CardDescription>Current cycle</CardDescription>
              <CardTitle>
                {mine.pointsTotal.toFixed(1)} / {mine.targetPoints.toFixed(0)} · cycle #{mine.cycleNumber}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={mine.pointsTotal} max={mine.targetPoints} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const [counts, stats, myClaimed, mySubmitted, myRevisions] = await Promise.all([
    getDashboardCounts(activeTerm?.id),
    getProductivityStats(),
    getMyWorkItems(user.id, ["claimed"]),
    getMyWorkItems(user.id, ["in_review"]),
    getMyWorkItems(user.id, ["revision"]),
  ]);
  const leaderboard = [...stats].sort((a, b) => b.pointsTotal - a.pointsTotal).slice(0, 8);
  const myAssignedTotal = myClaimed.length + mySubmitted.length + myRevisions.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {activeTerm ? `Active term: ${activeTerm.name}` : "No active term set — configure one in Admin / Setup."}
        </p>
      </div>

      {myAssignedTotal > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Assigned to you</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Claimed" value={myClaimed.length} href="/my-work" />
            <StatCard label="Awaiting review" value={mySubmitted.length} href="/my-work" />
            <StatCard
              label="Needs revision"
              value={myRevisions.length}
              href="/my-work"
              tone={myRevisions.length > 0 ? "warn" : undefined}
            />
          </div>
        </section>
      )}
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Editor leaderboard — points this cycle</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {leaderboard.map((row) => (
            <div key={row.editorId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm">{row.fullName}</span>
              <ProgressBar value={row.pointsTotal} max={row.targetPoints} className="flex-1" />
              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                {row.pointsTotal.toFixed(1)}/{row.targetPoints.toFixed(0)}
              </span>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No editors yet.</p>}
        </CardContent>
      </Card>
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
