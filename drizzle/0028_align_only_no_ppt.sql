-- Align-only COT orders are DLP-only: no PPT deliverable, no PPT editor.
-- Remove the (not-yet-approved) PPT deliverables from existing align orders.
-- Approved PPTs are left alone so their awarded points aren't orphaned; handle
-- those few by hand if needed.
DELETE FROM "custom_order_items" ci
USING "custom_orders" co
WHERE ci.order_id = co.id
  AND co.work_kind = 'align'
  AND ci.type = 'COT_PPT'
  AND ci.status <> 'approved';
