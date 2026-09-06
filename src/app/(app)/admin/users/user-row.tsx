"use client";

import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { deleteUserAction, updateUserAction } from "./actions";
import { SetPasswordCell } from "./set-password-cell";

type Row = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "sales" | "editor" | "staff";
  payType: "hourly" | "quota" | "both";
  isActive: boolean;
};

export function UserRow({ user, canDelete = false, isSelf = false }: { user: Row; canDelete?: boolean; isSelf?: boolean }) {
  const [role, setRole] = useState(user.role);
  const [payType, setPayType] = useState(user.payType);
  const [isActive, setIsActive] = useState(user.isActive);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete() {
    setDeleteError(null);
    const confirmed = window.confirm(
      `Permanently delete ${user.fullName} (${user.email})? This removes their login and cannot be undone.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteUserAction(user.id);
      if (!result.ok) setDeleteError(result.message ?? "Could not delete this user.");
    });
  }

  return (
    <TableRow className={!isActive ? "opacity-50" : undefined}>
      <TableCell>{user.fullName}</TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v as Row["role"]);
            startTransition(() => updateUserAction(user.id, { role: v as Row["role"] }));
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="staff">Staff (time only)</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={payType}
          onValueChange={(v) => {
            setPayType(v as Row["payType"]);
            startTransition(() => updateUserAction(user.id, { payType: v as Row["payType"] }));
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quota">Quota (points)</SelectItem>
            <SelectItem value="hourly">Hourly (clock)</SelectItem>
            <SelectItem value="both">Both — quota + hourly rate</SelectItem>
          </SelectContent>
        </Select>
        {payType === "quota" && (
          <p className="mt-1 max-w-[11rem] text-[11px] leading-tight text-muted-foreground">
            Choose “Both” to add an hourly rate and time clock for this quota staffer.
          </p>
        )}
      </TableCell>
      <TableCell>
        <SetPasswordCell userId={user.id} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                const next = !isActive;
                setIsActive(next);
                startTransition(() => updateUserAction(user.id, { isActive: next }));
              }}
            >
              {isActive ? "Deactivate" : "Reactivate"}
            </Button>
            {canDelete && !isSelf && (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleDelete}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Delete
              </Button>
            )}
          </div>
          {deleteError && <span className="max-w-xs text-xs text-destructive">{deleteError}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
