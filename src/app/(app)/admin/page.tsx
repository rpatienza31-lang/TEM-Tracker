import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  { href: "/admin/catalog", title: "Catalog generator", description: "Bulk-create work items for a term (grades × subjects × weeks × DLP/COT)." },
  { href: "/admin/users", title: "Users", description: "Invite staff, set role and pay type, deactivate accounts." },
  { href: "/admin/subjects", title: "Subjects", description: "Master subject list used by the catalog generator." },
  { href: "/admin/terms", title: "Terms & weeks", description: "Create terms, mark the active one, and set weekly upload deadlines." },
  { href: "/admin/activity", title: "Activity log", description: "Every work-item status change, filterable by item, actor, or date." },
  { href: "/admin/settings", title: "Settings", description: "Quota size, point values, WIP limit. Owner only." },
];

export default async function AdminIndexPage() {
  const user = await requireRole("owner", "admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Admin / Setup</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.fullName} ({user.role}).</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.filter((s) => s.href !== "/admin/settings" || user.role === "owner").map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
