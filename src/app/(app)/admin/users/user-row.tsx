"use client";

import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { updateUserAction } from "./actions";

type Row = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "sales" | "editor";
  payType: "hourly" | "quota";
  isActive: boolean;
};

export function UserRow({ user }: { user: Row }) {
  const [role, setRole] = useState(user.role);
  const [payType, setPayType] = useState(user.payType);
  const [isActive, setIsActive] = useState(user.isActive);
  const [isPending, startTransition] = useTransition();

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
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quota">Quota</SelectItem>
            <SelectItem value="hourly">Hourly</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  );
}
