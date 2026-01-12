-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "criteriaId" TEXT NOT NULL,
    "documentId" TEXT,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_sessionId_idx" ON "evaluations"("sessionId");

-- CreateIndex
CREATE INDEX "evaluations_criteriaId_idx" ON "evaluations"("criteriaId");

-- CreateIndex
CREATE INDEX "evaluations_documentId_idx" ON "evaluations"("documentId");

-- CreateIndex
CREATE INDEX "evaluations_createdAt_idx" ON "evaluations"("createdAt");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversations"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "evaluation_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
