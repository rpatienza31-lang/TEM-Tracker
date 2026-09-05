import { formatInTimeZone } from "date-fns-tz";
import { Banknote, CalendarRange, Clock, Download, History, Receipt, Users, Wallet } from "lucide-react";

import { requireRole } from "@/lib/auth";
import {
  getActiveClockIns,
  getApprovedTimeLogsForPeriod,
  getAttendanceOnlyForPeriod,
  getPendingTimeLogs,
} from "@/lib/time-logs/queries";
import { getPayrollReport } from "@/lib/payroll/report";
import { getPointsBreakdown } from "@/lib/payroll/breakdown";
import { splitPaidUnpaid } from "@/lib/payroll/paid-split";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PendingApprovals } from "./pending-approvals";
import { ActiveClockIns } from "./active-clock-ins";
import { QuotaStaffTable } from "./quota-staff-table";
import { HourlyStaffTable } from "./hourly-staff-table";
import { DailyStaffTable } from "./daily-staff-table";
import { getDailyStaffForPeriod, getDailyStaffSessions } from "@/lib/payroll/daily";
import { PayslipsTable } from "./payslips-table";
import { AttendanceLog } from "./attendance-log";

type SearchParams = { from?: string; to?: string };

const PH_TZ = "Asia/Manila";
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateLabel = (iso: string) => formatInTimeZone(new Date(`${iso}T00:00:00`), PH_TZ, "MMM d, yyyy");
const phTime = (d: Date | null) => (d ? formatInTimeZone(new Date(d), PH_TZ, "h:mm a") : null);

const TONES = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-bold tabular-nums">{value}</div>
        {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

const HEADER_TONES = {
  emerald: "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30",
  blue: "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30",
  amber: "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30",
  violet: "border-violet-500 bg-violet-50/60 dark:bg-violet-950/30",
} as const;

function SectionCard({
  icon: Icon,
  title,
  description,
  tone,
  badge,
  children,
}: {
  icon: typeof Wallet;
  title: string;
  description?: string;
  tone: keyof typeof HEADER_TONES;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={cn("flex items-center gap-3 border-b-2 px-4 py-3.5 md:px-5", HEADER_TONES[tone])}>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold leading-tight tracking-tight">
            {title}
            {badge && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", TONES[tone])}>{badge}</span>
            )}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

function toSession(log: {
  id: string;
  workDate: string;
  clockIn: Date | null;
  clockOut: Date | null;
  hours: number;
  note: string | null;
}) {
  return {
    id: log.id,
    workDate: log.workDate,
    clockInIso: log.clockIn ? new Date(log.clockIn).toISOString() : null,
    clockOutIso: log.clockOut ? new Date(log.clockOut).toISOString() : null,
    hours: log.hours,
    note: log.note,
  };
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole("owner", "admin");
  const isOwner = user.role === "owner";
  const sp = await searchParams;
  const defaults = defaultRange();
  const from = sp.from || defaults.from;
  const to = sp.to || defaults.to;

  const [pending, report, activeClockIns, breakdownMap, approvedLogs, dailyStaff, dailySessions, attendanceOnly] =
    await Promise.all([
      getPendingTimeLogs(),
      getPayrollReport(from, to),
      getActiveClockIns(),
      // All projects up to the period end, so the split against lifetime-paid points is correct.
      getPointsBreakdown("1970-01-01", to),
      getApprovedTimeLogsForPeriod(from, to),
      getDailyStaffForPeriod(from, to),
      getDailyStaffSessions(from, to),
      getAttendanceOnlyForPeriod(from, to),
    ]);
  // Show only the UNPAID projects in the live breakdown — already-paid ones live
  // in the Payment history, so the list isn't cluttered with settled work.
  const paidByUser = new Map(report.quotaRows.map((r) => [r.userId, r.pointsPaid]));
  const breakdown = Object.fromEntries(
    [...breakdownMap].map(([userId, lines]) => [userId, splitPaidUnpaid(lines, paidByUser.get(userId) ?? 0).unpaidLines]),
  );

  const sessionsByUser: Record<string, ReturnType<typeof toSession>[]> = {};
  for (const log of approvedLogs) {
    (sessionsByUser[log.userId] ??= []).push(toSession(log));
  }

  const grossTotal = report.payslips.reduce((s, p) => s + p.gross, 0);
  const caTotal = report.payslips.reduce((s, p) => s + p.cashAdvance, 0);
  const activeNow = activeClockIns.filter((a) => a.clockIn).length;
  const rangeLabel = `${dateLabel(from)} – ${dateLabel(to)}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
            <p className="text-sm text-muted-foreground">
              <CalendarRange className="mr-1 inline h-3.5 w-3.5" />
              {rangeLabel}
            </p>
          </div>
        </div>
        {isOwner && (
          <a
            href="/payroll/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent"
          >
            <History className="h-4 w-4" />
            Payment history
          </a>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isOwner ? (
          <>
            <StatCard icon={Wallet} label="Gross this period" value={peso.format(grossTotal)} tone="blue" />
            <StatCard icon={Banknote} label="Net payout" value={peso.format(report.totalNet)} tone="emerald" />
            <StatCard
              icon={Receipt}
              label="Cash advance"
              value={peso.format(caTotal)}
              hint={`${report.payslips.length} staff`}
              tone="amber"
            />
            <StatCard
              icon={Clock}
              label="Pending approvals"
              value={String(pending.length)}
              hint={activeNow ? `${activeNow} clocked in now` : undefined}
              tone="violet"
            />
          </>
        ) : (
          <>
            <StatCard icon={Clock} label="Pending approvals" value={String(pending.length)} tone="violet" />
            <StatCard icon={Users} label="Clocked in now" value={String(activeNow)} tone="blue" />
          </>
        )}
      </div>

      {/* Period toolbar */}
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="from">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="to">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">Update period</Button>
        <Button asChild variant="outline">
          <a href={`/api/payroll/export?from=${from}&to=${to}`}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </a>
        </Button>
      </form>

      {activeNow > 0 && (
        <ActiveClockIns
          active={activeClockIns
            .filter((a) => a.clockIn)
            .map((a) => ({
              id: a.id,
              userName: a.userName,
              clockInIso: new Date(a.clockIn as Date).toISOString(),
              clockInLabel: formatInTimeZone(new Date(a.clockIn as Date), PH_TZ, "MMM d, h:mm a"),
            }))}
        />
      )}

      <SectionCard
        icon={Clock}
        title="Approvals"
        badge={pending.length ? `${pending.length} pending` : undefined}
        tone="violet"
        description="Approve time as “Hourly (paid)” to count it toward hourly pay, or “Attendance only” to record a quota staffer’s presence without paying hourly."
      >
        <PendingApprovals
          logs={pending.map((p) => ({
            id: p.id,
            userName: p.userName,
            workDate: p.workDate,
            timeIn: phTime(p.clockIn),
            timeOut: phTime(p.clockOut),
            hours: p.hours,
            note: p.note,
          }))}
        />
      </SectionCard>

      <SectionCard
        icon={Clock}
        title="Attendance (monitor only)"
        badge={attendanceOnly.length ? `${attendanceOnly.length} record${attendanceOnly.length === 1 ? "" : "s"}` : undefined}
        tone="blue"
        description="Sessions approved as “Attendance only” — recorded presence for quota staff, not paid hourly (for the selected date range). Move one to “Hourly (paid)” if it was classified by mistake."
      >
        <AttendanceLog
          isAdmin
          rows={attendanceOnly.map((a) => ({
            id: a.id,
            userName: a.userName,
            workDate: a.workDate,
            timeIn: phTime(a.clockIn),
            timeOut: phTime(a.clockOut),
            hours: a.hours ? a.hours.toFixed(2) : null,
          }))}
        />
      </SectionCard>

      <SectionCard
        icon={Users}
        title="Quota staff"
        tone="blue"
        description={
          isOwner
            ? "Unpaid points × per-subject rate. Click a figure to see or correct the projects, then Mark paid."
            : "Unpaid points for the period and the pro-rated salary."
        }
      >
        <QuotaStaffTable rows={report.quotaRows} breakdown={breakdown} isOwner={isOwner} from={from} to={to} />
      </SectionCard>

      <SectionCard
        icon={Clock}
        title="Hourly staff"
        tone="amber"
        description="Approved hours for the period — click a figure to see the clock-in / clock-out history."
      >
        <HourlyStaffTable rows={report.hourlyRows} sessions={sessionsByUser} isOwner={isOwner} from={from} to={to} />
      </SectionCard>

      {dailyStaff.length > 0 && (
        <SectionCard
          icon={CalendarRange}
          title="Daily staff"
          tone="violet"
          description="Fixed pay per day present — days come from the time clock (attendance), salary is days × daily rate."
        >
          <DailyStaffTable rows={dailyStaff} sessions={dailySessions} isOwner={isOwner} from={from} to={to} />
        </SectionCard>
      )}

      {isOwner && (
        <SectionCard
          icon={Banknote}
          title="Payslips"
          tone="emerald"
          description="Gross combines quota and hourly pay; net is gross minus the editable cash advance (CA)."
        >
          <PayslipsTable
            rows={report.payslips.map((p) => ({
              userId: p.userId,
              fullName: p.fullName,
              quotaSalary: p.quotaSalary,
              hourlySalary: p.hourlySalary,
              quotaCarried: p.quotaCarried,
              cashAdvance: p.cashAdvance,
            }))}
            from={from}
            to={to}
          />
        </SectionCard>
      )}
    </div>
  );
}
