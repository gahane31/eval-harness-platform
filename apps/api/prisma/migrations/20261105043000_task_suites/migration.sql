-- CreateTable
CREATE TABLE "TaskSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskSuite_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hypothesis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "repetitions" INTEGER NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "timeoutSeconds" INTEGER NOT NULL,
    "passThreshold" REAL NOT NULL,
    "taskSuiteIds" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Experiment_repetitions_check" CHECK ("repetitions" >= 1),
    CONSTRAINT "Experiment_concurrency_check" CHECK ("concurrency" >= 1),
    CONSTRAINT "Experiment_timeoutSeconds_check" CHECK ("timeoutSeconds" >= 1),
    CONSTRAINT "Experiment_passThreshold_check" CHECK ("passThreshold" >= 0 AND "passThreshold" <= 1),
    CONSTRAINT "Experiment_status_check" CHECK ("status" IN ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT "Experiment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "new_Experiment" ("completedAt", "concurrency", "createdAt", "description", "hypothesis", "id", "name", "passThreshold", "repetitions", "startedAt", "status", "timeoutSeconds") SELECT "completedAt", "concurrency", "createdAt", "description", "hypothesis", "id", "name", "passThreshold", "repetitions", "startedAt", "status", "timeoutSeconds" FROM "Experiment";
DROP TABLE "Experiment";
ALTER TABLE "new_Experiment" RENAME TO "Experiment";
CREATE INDEX "Experiment_agentId_idx" ON "Experiment"("agentId");
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");
CREATE INDEX "Experiment_createdAt_idx" ON "Experiment"("createdAt");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "input" TEXT NOT NULL,
    "expectedOutcome" JSONB NOT NULL,
    "scoringCriteria" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "taskSuiteId" TEXT,
    CONSTRAINT "Task_version_check" CHECK ("version" >= 1),
    CONSTRAINT "Task_taskSuiteId_fkey" FOREIGN KEY ("taskSuiteId") REFERENCES "TaskSuite" ("id") ON DELETE SET NULL ON UPDATE RESTRICT
);
INSERT INTO "new_Task" ("createdAt", "description", "expectedOutcome", "id", "input", "name", "scoringCriteria", "tags", "updatedAt", "version") SELECT "createdAt", "description", "expectedOutcome", "id", "input", "name", "scoringCriteria", "tags", "updatedAt", "version" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_name_idx" ON "Task"("name");
CREATE INDEX "Task_version_idx" ON "Task"("version");
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");
CREATE INDEX "Task_taskSuiteId_idx" ON "Task"("taskSuiteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskSuite_agentId_idx" ON "TaskSuite"("agentId");

-- CreateIndex
CREATE INDEX "TaskSuite_createdAt_idx" ON "TaskSuite"("createdAt");
