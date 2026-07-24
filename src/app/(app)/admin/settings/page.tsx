import { requireRole } from "@/lib/auth";
import { getPointsTable, getQuotaSize, getWipLimit } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettingsAction } from "./actions";

export default async function SettingsAdminPage() {
  await requireRole("owner");

  const [quotaSize, wipLimit, points] = await Promise.all([getQuotaSize(), getWipLimit(), getPointsTable()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Points are snapshotted onto each work item when it&apos;s created — changing these values never rewrites
          history.
        </p>
      </div>

      <form action={updateSettingsAction} className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="quotaSize">Quota cycle size (points)</Label>
          <Input id="quotaSize" name="quotaSize" type="number" step="0.5" defaultValue={quotaSize} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="wipLimit">WIP limit per editor</Label>
          <Input id="wipLimit" name="wipLimit" type="number" step="1" defaultValue={wipLimit} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="dlpPoints">DLP points</Label>
          <Input id="dlpPoints" name="dlpPoints" type="number" step="0.5" defaultValue={points.DLP} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cotPoints">COT points</Label>
          <Input id="cotPoints" name="cotPoints" type="number" step="0.5" defaultValue={points.COT} />
        </div>
        <Button type="submit" className="w-fit">
          Save settings
        </Button>
      </form>
    </div>
  );
}
