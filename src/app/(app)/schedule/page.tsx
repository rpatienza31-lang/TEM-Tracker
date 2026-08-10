import { asc } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getScheduleItems } from "@/lib/work-items/queries";
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

  const days = Math.min(Math.max(Number(sp.days) || 7, 1), 14);
  const today = formatInTimeZone(new Date(), PH_TZ, "yyyy-MM-dd");
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const to = addDays(from, days - 1);

  const items = await getScheduleItems(from, to, { termId });

  const dates: string[] = [];
  for (let i = 0; i < days; i++) dates.push(addDays(from, i));

  return (
    <ScheduleClient
      items={items}
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
