-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex (resetToken for faster password reset lookups)
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");

-- CreateIndex (stripePaymentIntentId unique for webhook idempotency)
CREATE UNIQUE INDEX "Transaction_stripePaymentIntentId_key" ON "Transaction"("stripePaymentIntentId");
