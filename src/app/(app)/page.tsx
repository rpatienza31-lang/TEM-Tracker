import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  Layers,
  Target,
  Trophy,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getDashboardCounts, getMyWorkItems } from "@/lib/work-items/queries";
import { getMyCotItems } from "@/lib/cot/queries";
import { getProductivityStats, type EditorProductivity } from "@/lib/quota/productivity";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PH_TZ = "Asia/Manila";

export default async function DashboardPage() {
  const user = await requireUser();
  // Office/time-only staff have no production dashboard — send them straight to
  // their time clock.
  if (user.role === "staff") redirect("/time-logs");
  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive);
  const today = formatInTimeZone(new Date(), PH_TZ, "EEEE, MMMM d, yyyy");

  if (user.role === "editor") {
    const [active, submitted, revisions, cot, stats] = await Promise.all([
      getMyWorkItems(user.id, ["claimed"]),
      getMyWorkItems(user.id, ["in_review"]),
      getMyWorkItems(user.id, ["revision"]),
      getMyCotItems(user.id, ["claimed", "in_review", "revision"]),
      getProductivityStats(),
    ]);
    const mine = stats.find((s) => s.editorId === user.id);

    return (
      <div className="flex flex-col gap-6">
        <Hero
          greeting={`Welcome back, ${user.fullName.split(" ")[0]}`}
          subtitle={activeTerm ? activeTerm.name : "No active term"}
          today={today}
          cycle={mine}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Claimed" value={active.length} href="/my-work" icon={ClipboardList} tone="info" hint="In progress" />
          <StatCard label="Awaiting review" value={submitted.length} href="/my-work" icon={Hourglass} tone="warn" hint="Submitted" />
          <StatCard
            label="Needs revision"
            value={revisions.length}
            href="/my-work"
            icon={AlertTriangle}
            tone={revisions.length > 0 ? "danger" : "neutral"}
            hint="Sent back"
          />
          <StatCard label="COT orders" value={cot.length} href="/my-work" icon={FileText} tone="info" hint="Customized" />
        </div>

        {mine && (
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-claimed/10">
                    <Target className="h-4 w-4 text-status-claimed" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Current quota cycle</p>
                    <p className="text-xs text-muted-foreground">Cycle #{mine.ledgerCycleNumber}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {mine.ledgerCyclePoints.toFixed(1)}
                  <span className="text-muted-foreground"> / {mine.targetPoints.toFixed(0)} pts</span>
                </p>
              </div>
              <BigProgress value={mine.ledgerCyclePoints} max={mine.targetPoints} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const [counts, stats, myClaimed, mySubmitted, myRevisions, myCot] = await Promise.all([
    getDashboardCounts(activeTerm?.id),
    getProductivityStats(),
    getMyWorkItems(user.id, ["claimed"]),
    getMyWorkItems(user.id, ["in_review"]),
    getMyWorkItems(user.id, ["revision"]),
    getMyCotItems(user.id, ["claimed", "in_review", "revision"]),
  ]);
  // Rank by cycle first (whoever is on the most cycles leads), then by unpaid
  // points within the same cycle.
  const leaderboard = [...stats]
    .sort((a, b) => b.ledgerCycleNumber - a.ledgerCycleNumber || b.pointsUnpaid - a.pointsUnpaid)
    .slice(0, 8);
  const myAssignedTotal = myClaimed.length + mySubmitted.length + myRevisions.length + myCot.length;

  return (
    <div className="flex flex-col gap-6">
      <Hero
        greeting={`Hello, ${user.fullName.split(" ")[0]}`}
        subtitle={activeTerm ? `Active term · ${activeTerm.name}` : "No active term — configure one in Admin / Setup"}
        today={today}
      />

      {myAssignedTotal > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon={ClipboardList}>Assigned to you</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Claimed" value={myClaimed.length} href="/my-work" icon={ClipboardList} tone="info" />
            <StatCard label="Awaiting review" value={mySubmitted.length} href="/my-work" icon={Hourglass} tone="warn" />
            <StatCard
              label="Needs revision"
              value={myRevisions.length}
              href="/my-work"
              icon={AlertTriangle}
              tone={myRevisions.length > 0 ? "danger" : "neutral"}
            />
            <StatCard label="COT orders" value={myCot.length} href="/my-work" icon={FileText} tone="info" />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle icon={AlertTriangle}>Needs attention</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Overdue" value={counts?.overdue ?? 0} href="/board?overdueOnly=1" icon={AlertTriangle} tone="danger" hint="Past the deadline" />
          <StatCard label="Due soon" value={counts?.dueSoon ?? 0} href="/board" icon={CalendarClock} tone="warn" hint="Within 3 days" />
          <StatCard label="Unclaimed at risk" value={counts?.atRisk ?? 0} href="/board?availableOnly=1" icon={Clock} tone="warn" hint="Due in 5 days, no owner" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon={Layers}>Production pipeline</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Available" value={counts?.available ?? 0} href="/board?status=available" icon={CircleDashed} tone="neutral" />
          <StatCard label="Claimed" value={counts?.claimed ?? 0} href="/board?status=claimed" icon={ClipboardList} tone="info" />
          <StatCard label="In review" value={counts?.inReview ?? 0} href="/review" icon={Hourglass} tone="warn" />
          <StatCard label="Approved" value={counts?.approved ?? 0} href="/board?status=approved" icon={CheckCircle2} tone="success" />
          <StatCard label="Uploaded" value={counts?.uploaded ?? 0} href="/board?status=uploaded" icon={Upload} tone="success" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon={Trophy}>Editor leaderboard · by cycle, then unpaid points</SectionTitle>
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {leaderboard.map((row, i) => (
              <LeaderRow key={row.editorId} rank={i + 1} row={row} />
            ))}
            {leaderboard.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No editors yet.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ----------------------------- Building blocks ---------------------------- */

function Hero({
  greeting,
  subtitle,
  today,
  cycle,
}: {
  greeting: string;
  subtitle: string;
  today: string;
  cycle?: EditorProductivity;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900 p-6 text-white shadow-sm sm:p-7">
      <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-teal-500/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 right-24 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl" />
      <div className="relative flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-teal-300/90">{today}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}</h1>
        <p className="text-sm text-slate-300">{subtitle}</p>
        {cycle && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>Cycle #{cycle.cycleNumber}</span>
                <span className="tabular-nums">
                  {cycle.pointsTotal.toFixed(1)} / {cycle.targetPoints.toFixed(0)} pts
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-teal-400 transition-all"
                  style={{ width: `${pct(cycle.pointsTotal, cycle.targetPoints)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <Icon className="h-4 w-4" />
      {children}
    </h2>
  );
}

type Tone = "danger" | "warn" | "info" | "success" | "neutral";

const TONE: Record<Tone, { badge: string; icon: string; hover: string; value: string }> = {
  danger: { badge: "bg-status-overdue/10", icon: "text-status-overdue", hover: "hover:border-status-overdue/40", value: "text-status-overdue" },
  warn: { badge: "bg-status-review/10", icon: "text-status-review", hover: "hover:border-status-review/40", value: "" },
  info: { badge: "bg-status-claimed/10", icon: "text-status-claimed", hover: "hover:border-status-claimed/40", value: "" },
  success: { badge: "bg-status-approved/10", icon: "text-status-approved", hover: "hover:border-status-approved/40", value: "" },
  neutral: { badge: "bg-muted", icon: "text-muted-foreground", hover: "hover:border-foreground/20", value: "" },
};

function StatCard({
  label,
  value,
  href,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
}) {
  const t = TONE[tone];
  return (
    <Link href={href} className="group">
      <Card className={cn("h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md", t.hover)}>
        <CardContent className="flex items-start justify-between gap-3 p-4">
          <div className="flex flex-col gap-0.5">
            <span className={cn("text-2xl font-semibold leading-tight tabular-nums", t.value)}>{value}</span>
            <span className="text-xs font-medium text-foreground/80">{label}</span>
            {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", t.badge)}>
              <Icon className={cn("h-[18px] w-[18px]", t.icon)} strokeWidth={2} />
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

const RANK_STYLE: Record<number, string> = {
  1: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  2: "bg-slate-400/15 text-slate-500 dark:text-slate-300",
  3: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function LeaderRow({ rank, row }: { rank: number; row: EditorProductivity }) {
  // Unpaid balance has reached a full payable cycle.
  const reachedQuota = row.targetPoints > 0 && row.pointsUnpaid >= row.targetPoints;
  const initials = row.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
          RANK_STYLE[rank] ?? "bg-muted text-muted-foreground",
        )}
      >
        {rank}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-foreground">
        {initials}
      </span>
      <span className="w-28 shrink-0 truncate text-sm font-medium sm:w-40">{row.fullName}</span>
      <div className="flex flex-1 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", reachedQuota ? "bg-status-uploaded" : "bg-status-claimed")}
            style={{ width: `${pct(row.ledgerCyclePoints, row.targetPoints)}%` }}
          />
        </div>
      </div>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {row.ledgerCyclePoints.toFixed(1)}/{row.targetPoints.toFixed(0)} · cycle&nbsp;{row.ledgerCycleNumber}
      </span>
      {reachedQuota && <CheckCircle2 className="h-4 w-4 shrink-0 text-status-approved" />}
    </div>
  );
}

function BigProgress({ value, max }: { value: number; max: number }) {
  const done = value >= max && max > 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", done ? "bg-status-uploaded" : "bg-status-claimed")}
        style={{ width: `${pct(value, max)}%` }}
      />
    </div>
  );
}

function pct(value: number, max: number) {
  return max > 0 ? Math.min(100, (value / max) * 100) : 0;
}
