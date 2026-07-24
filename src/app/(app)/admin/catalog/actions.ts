"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { generateCatalog, previewCatalog, type CatalogGeneratorInput } from "@/lib/catalog/generator";

export async function previewCatalogAction(input: CatalogGeneratorInput) {
  await requireRole("owner", "admin");
  return previewCatalog(input);
}

export async function generateCatalogAction(input: CatalogGeneratorInput) {
  await requireRole("owner", "admin");
  const result = await generateCatalog(input);
  revalidatePath("/board");
  revalidatePath("/matrix");
  revalidatePath("/admin");
  return result;
}
