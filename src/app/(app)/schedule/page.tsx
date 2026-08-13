import { asc, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, users } from "@/db/schema";
import { getScheduleItems, getStaffAvailability } from "@/lib/work-items/queries";
import { ScheduleClient } from "./schedule-client";

type SearchParams = Record<string, string | undefined>;

const PH_TZ = "Asia/Manila";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isAdmin = user.role === "owner" || user.role === "admin";

  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  // Default to ALL terms in one combined calendar; each card is labelled with
  // its term so nothing gets missed on a separate tab.
  const termId = sp.term || undefined;

  const days = Math.min(Math.max(Number(sp.days) || 7, 1), 31);
  const today = formatInTimeZone(new Date(), PH_TZ, "yyyy-MM-dd");
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const to = addDays(from, days - 1);

  const [items, availability, staffRows] = await Promise.all([
    getScheduleItems(from, to, { termId, today }),
    getStaffAvailability(from, to),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.fullName)),
  ]);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(addDays(from, i));

  return (
    <ScheduleClient
      items={items}
      availability={availability}
      allStaff={staffRows}
      dates={dates}
      from={from}
      days={days}
      today={today}
      terms={termRows.map((t) => ({ id: t.id, name: t.name }))}
      termId={termId ?? ""}
      isAdmin={isAdmin}
      currentUserId={user.id}
    />
  );
}
