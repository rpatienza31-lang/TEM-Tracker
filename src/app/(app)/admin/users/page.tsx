import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { UserRow } from "./user-row";

export default async function UsersAdminPage() {
  const me = await requireRole("owner", "admin");
  const canDelete = me.role === "owner";
  const rows = await db.select().from(users).orderBy(asc(users.fullName));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Invite staff and manage role, pay type, and active status.</p>
      </div>

      <InviteForm />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Pay type</TableHead>
            <TableHead>Password</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <UserRow key={user.id} user={user} canDelete={canDelete} isSelf={user.id === me.id} />
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
