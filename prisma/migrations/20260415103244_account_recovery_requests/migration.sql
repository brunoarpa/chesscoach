-- CreateTable
CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "chessComUsername" TEXT,
    "contactInfo" TEXT NOT NULL,
    "message" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecoveryRequest_resolved_idx" ON "RecoveryRequest"("resolved");

-- CreateIndex
CREATE INDEX "RecoveryRequest_createdAt_idx" ON "RecoveryRequest"("createdAt");
