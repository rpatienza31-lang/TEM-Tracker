import { requireRole } from "@/lib/auth";
import { getApprovedReadyToUpload, getReviewQueueItems } from "@/lib/work-items/queries";
import { ReviewClient } from "./review-client";

export default async function ReviewQueuePage() {
  await requireRole("owner", "admin");

  const [inReview, readyToUpload] = await Promise.all([getReviewQueueItems(), getApprovedReadyToUpload()]);

  return <ReviewClient inReview={inReview} readyToUpload={readyToUpload} />;
}
