-- CreateTable
CREATE TABLE "evaluation_criteria" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_criteria_sessionId_idx" ON "evaluation_criteria"("sessionId");

-- AddForeignKey
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversations"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
