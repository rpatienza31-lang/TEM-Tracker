import { requireRole } from "@/lib/auth";
import { getApprovedReadyToUpload, getReviewQueueItems, getRevisionItems } from "@/lib/work-items/queries";
import { getCotItemsInReview, getCotItemsInRevision } from "@/lib/cot/queries";
import { ReviewClient } from "./review-client";

export default async function ReviewQueuePage() {
  await requireRole("owner", "admin");

  const [inReview, readyToUpload, cotInReview, inRevision, cotInRevision] = await Promise.all([
    getReviewQueueItems(),
    getApprovedReadyToUpload(),
    getCotItemsInReview(),
    getRevisionItems(),
    getCotItemsInRevision(),
  ]);

  return (
    <ReviewClient
      inReview={inReview}
      readyToUpload={readyToUpload}
      cotInReview={cotInReview}
      inRevision={inRevision}
      cotInRevision={cotInRevision}
    />
  );
}
