-- CreateIndex
CREATE INDEX "purchase_returns_shop_id_returned_at_idx" ON "purchase_returns"("shop_id", "returned_at" DESC);

-- CreateIndex
CREATE INDEX "sale_returns_shop_id_returned_at_idx" ON "sale_returns"("shop_id", "returned_at" DESC);

-- CreateIndex
CREATE INDEX "stock_adjustments_shop_id_adjusted_at_idx" ON "stock_adjustments"("shop_id", "adjusted_at" DESC);

-- CreateIndex
CREATE INDEX "sync_operations_shop_id_created_at_idx" ON "sync_operations"("shop_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_operations_shop_id_client_op_id_idx" ON "sync_operations"("shop_id", "client_op_id");
