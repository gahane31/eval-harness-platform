-- Evaluation plans and one-click batch execution. Checks cover ranges Prisma cannot express.
-- CreateTable
CREATE TABLE "EvaluationPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EvaluationPlanEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionPolicy" TEXT NOT NULL,
    "pinnedVersionId" TEXT,
    "taskSuiteId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "passRateThreshold" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvaluationPlanEntry_displayOrder_check" CHECK ("displayOrder" >= 0),
    CONSTRAINT "EvaluationPlanEntry_versionPolicy_check" CHECK ("versionPolicy" IN ('LATEST_PUBLISHED', 'PINNED')),
    CONSTRAINT "EvaluationPlanEntry_pin_check" CHECK (("versionPolicy" = 'PINNED' AND "pinnedVersionId" IS NOT NULL) OR ("versionPolicy" = 'LATEST_PUBLISHED' AND "pinnedVersionId" IS NULL)),
    CONSTRAINT "EvaluationPlanEntry_passRateThreshold_check" CHECK ("passRateThreshold" IS NULL OR ("passRateThreshold" >= 0 AND "passRateThreshold" <= 1)),
    CONSTRAINT "EvaluationPlanEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EvaluationPlan" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationPlanEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationPlanEntry_pinnedVersionId_fkey" FOREIGN KEY ("pinnedVersionId") REFERENCES "AgentConfiguration" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationPlanEntry_taskSuiteId_fkey" FOREIGN KEY ("taskSuiteId") REFERENCES "TaskSuite" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "EvaluationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "runningKey" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationBatch_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED')),
    CONSTRAINT "EvaluationBatch_running_key_check" CHECK (("status" = 'RUNNING' AND "runningKey" = 'RUNNING') OR ("status" <> 'RUNNING' AND "runningKey" IS NULL))
);

-- CreateTable
CREATE TABLE "EvaluationBatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "planEntryId" TEXT,
    "resolvedVersionId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "taskSuiteId" TEXT NOT NULL,
    "taskSuiteName" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "passRateThreshold" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationBatchItem_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    CONSTRAINT "EvaluationBatchItem_passRateThreshold_check" CHECK ("passRateThreshold" IS NULL OR ("passRateThreshold" >= 0 AND "passRateThreshold" <= 1)),
    CONSTRAINT "EvaluationBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EvaluationBatch" ("id") ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationBatchItem_planEntryId_fkey" FOREIGN KEY ("planEntryId") REFERENCES "EvaluationPlanEntry" ("id") ON DELETE SET NULL ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationBatchItem_resolvedVersionId_fkey" FOREIGN KEY ("resolvedVersionId") REFERENCES "AgentConfiguration" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "EvaluationBatchItem_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateIndex
CREATE INDEX "EvaluationPlan_enabled_idx" ON "EvaluationPlan"("enabled");

-- CreateIndex
CREATE INDEX "EvaluationPlan_updatedAt_idx" ON "EvaluationPlan"("updatedAt");

-- CreateIndex
CREATE INDEX "EvaluationPlanEntry_planId_displayOrder_idx" ON "EvaluationPlanEntry"("planId", "displayOrder");

-- CreateIndex
CREATE INDEX "EvaluationPlanEntry_agentId_idx" ON "EvaluationPlanEntry"("agentId");

-- CreateIndex
CREATE INDEX "EvaluationPlanEntry_taskSuiteId_idx" ON "EvaluationPlanEntry"("taskSuiteId");

-- CreateIndex
CREATE INDEX "EvaluationPlanEntry_pinnedVersionId_idx" ON "EvaluationPlanEntry"("pinnedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationPlanEntry_planId_agentId_taskSuiteId_key" ON "EvaluationPlanEntry"("planId", "agentId", "taskSuiteId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationBatch_runningKey_key" ON "EvaluationBatch"("runningKey");

-- CreateIndex
CREATE INDEX "EvaluationBatch_status_idx" ON "EvaluationBatch"("status");

-- CreateIndex
CREATE INDEX "EvaluationBatch_createdAt_idx" ON "EvaluationBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationBatchItem_experimentId_key" ON "EvaluationBatchItem"("experimentId");

-- CreateIndex
CREATE INDEX "EvaluationBatchItem_batchId_idx" ON "EvaluationBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "EvaluationBatchItem_planEntryId_idx" ON "EvaluationBatchItem"("planEntryId");

-- CreateIndex
CREATE INDEX "EvaluationBatchItem_resolvedVersionId_idx" ON "EvaluationBatchItem"("resolvedVersionId");

-- CreateIndex
CREATE INDEX "EvaluationBatchItem_status_idx" ON "EvaluationBatchItem"("status");
