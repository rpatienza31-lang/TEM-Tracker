import { requireUser } from "@/lib/auth";
import { getCotLibrary } from "@/lib/cot/queries";
import { LibraryClient } from "./library-client";

export default async function CotLibraryPage() {
  await requireUser();
  const orders = await getCotLibrary();

  return <LibraryClient orders={orders} />;
}
