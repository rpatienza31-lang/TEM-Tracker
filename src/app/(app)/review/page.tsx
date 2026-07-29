import { requireRole } from "@/lib/auth";
import { getApprovedReadyToUpload, getReviewQueueItems } from "@/lib/work-items/queries";
import { getCotItemsInReview } from "@/lib/cot/queries";
import { ReviewClient } from "./review-client";

export default async function ReviewQueuePage() {
  await requireRole("owner", "admin");

  const [inReview, readyToUpload, cotInReview] = await Promise.all([
    getReviewQueueItems(),
    getApprovedReadyToUpload(),
    getCotItemsInReview(),
  ]);

  return <ReviewClient inReview={inReview} readyToUpload={readyToUpload} cotInReview={cotInReview} />;
}
