-- Numeric ranges are CHECK constraints because Prisma's schema language cannot express them.
-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "draftConfig" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentConfiguration_version_check" CHECK ("version" >= 1),
    CONSTRAINT "AgentConfiguration_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "Task" (
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
    CONSTRAINT "Task_version_check" CHECK ("version" >= 1)
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hypothesis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "repetitions" INTEGER NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "timeoutSeconds" INTEGER NOT NULL,
    "passThreshold" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Experiment_repetitions_check" CHECK ("repetitions" >= 1),
    CONSTRAINT "Experiment_concurrency_check" CHECK ("concurrency" >= 1),
    CONSTRAINT "Experiment_timeoutSeconds_check" CHECK ("timeoutSeconds" >= 1),
    CONSTRAINT "Experiment_passThreshold_check" CHECK ("passThreshold" >= 0 AND "passThreshold" <= 1),
    CONSTRAINT "Experiment_status_check" CHECK ("status" IN ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'))
);

-- CreateTable
CREATE TABLE "ExperimentConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "agentConfigurationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    CONSTRAINT "ExperimentConfiguration_displayOrder_check" CHECK ("displayOrder" >= 0),
    CONSTRAINT "ExperimentConfiguration_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ExperimentConfiguration_agentConfigurationId_fkey" FOREIGN KEY ("agentConfigurationId") REFERENCES "AgentConfiguration" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "ExperimentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskSnapshot" JSONB NOT NULL,
    "executionOrder" INTEGER NOT NULL,
    CONSTRAINT "ExperimentTask_executionOrder_check" CHECK ("executionOrder" >= 0),
    CONSTRAINT "ExperimentTask_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "ExperimentTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "experimentConfigurationId" TEXT NOT NULL,
    "experimentTaskId" TEXT NOT NULL,
    "repetitionIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "hermesProfile" TEXT,
    "hermesSessionId" TEXT,
    "finalOutput" TEXT,
    "processExitCode" INTEGER,
    "error" TEXT,
    "usage" JSONB,
    "durationMs" INTEGER,
    "runtimeSnapshot" JSONB NOT NULL DEFAULT '{}',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "Run_repetitionIndex_check" CHECK ("repetitionIndex" >= 0),
    CONSTRAINT "Run_durationMs_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
    CONSTRAINT "Run_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT')),
    CONSTRAINT "Run_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Run_experimentConfigurationId_fkey" FOREIGN KEY ("experimentConfigurationId") REFERENCES "ExperimentConfiguration" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "Run_experimentTaskId_fkey" FOREIGN KEY ("experimentTaskId") REFERENCES "ExperimentTask" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawEvent" JSONB NOT NULL,
    "timestamp" DATETIME NOT NULL,
    CONSTRAINT "ExecutionEvent_sequence_check" CHECK ("sequence" >= 0),
    CONSTRAINT "ExecutionEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "criterionResults" JSONB NOT NULL,
    "evaluatedAt" DATETIME NOT NULL,
    CONSTRAINT "Evaluation_score_check" CHECK ("score" >= 0 AND "score" <= 1),
    CONSTRAINT "Evaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateIndex
CREATE INDEX "Agent_name_idx" ON "Agent"("name");

-- CreateIndex
CREATE INDEX "Agent_createdAt_idx" ON "Agent"("createdAt");

-- CreateIndex
CREATE INDEX "AgentConfiguration_createdAt_idx" ON "AgentConfiguration"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfiguration_agentId_version_key" ON "AgentConfiguration"("agentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfiguration_agentId_configHash_key" ON "AgentConfiguration"("agentId", "configHash");

-- CreateIndex
CREATE INDEX "Task_name_idx" ON "Task"("name");

-- CreateIndex
CREATE INDEX "Task_version_idx" ON "Task"("version");

-- CreateIndex
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE INDEX "Experiment_createdAt_idx" ON "Experiment"("createdAt");

-- CreateIndex
CREATE INDEX "ExperimentConfiguration_experimentId_displayOrder_idx" ON "ExperimentConfiguration"("experimentId", "displayOrder");

-- CreateIndex
CREATE INDEX "ExperimentConfiguration_agentConfigurationId_idx" ON "ExperimentConfiguration"("agentConfigurationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentConfiguration_experimentId_agentConfigurationId_key" ON "ExperimentConfiguration"("experimentId", "agentConfigurationId");

-- CreateIndex
CREATE INDEX "ExperimentTask_experimentId_executionOrder_idx" ON "ExperimentTask"("experimentId", "executionOrder");

-- CreateIndex
CREATE INDEX "ExperimentTask_taskId_idx" ON "ExperimentTask"("taskId");

-- CreateIndex
CREATE INDEX "Run_experimentId_status_idx" ON "Run"("experimentId", "status");

-- CreateIndex
CREATE INDEX "Run_experimentTaskId_idx" ON "Run"("experimentTaskId");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Run_experimentConfigurationId_experimentTaskId_repetitionIndex_key" ON "Run"("experimentConfigurationId", "experimentTaskId", "repetitionIndex");

-- CreateIndex
CREATE INDEX "ExecutionEvent_runId_timestamp_idx" ON "ExecutionEvent"("runId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionEvent_runId_sequence_key" ON "ExecutionEvent"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_runId_key" ON "Evaluation"("runId");

-- CreateIndex
CREATE INDEX "Evaluation_passed_idx" ON "Evaluation"("passed");

-- CreateIndex
CREATE INDEX "Evaluation_evaluatedAt_idx" ON "Evaluation"("evaluatedAt");
