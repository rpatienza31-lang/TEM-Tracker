"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteUserAction, type InviteUserState } from "./actions";

const initialState: InviteUserState = { status: "idle" };

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);
  const [role, setRole] = useState("editor");
  const [payType, setPayType] = useState("quota");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" required className="w-48" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required className="w-56" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="text" minLength={6} placeholder="min 6 characters" className="w-44" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <input type="hidden" name="role" value={role} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Pay type</Label>
        <Select value={payType} onValueChange={setPayType}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quota">Quota</SelectItem>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="both">Both (quota + hourly)</SelectItem>
          </SelectContent>
        </Select>
        <input type="hidden" name="payType" value={payType} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      {state.status === "ok" && <p className="text-sm text-status-approved">{state.message}</p>}
      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
    </form>
  );
}
