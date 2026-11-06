import type { EvaluationBatch, ExperimentExecution } from '../types';
import { computed, reactive, shallowRef } from 'vue';
import { getEvaluationBatch } from '../api/evaluation-plans';
import { getExecution } from '../api/execution';

export interface MonitoredEval {
  id: string;
  name: string;
  execution: ExperimentExecution;
}

type FinishedHandler = (item: MonitoredEval) => void;
type BatchHandler = (batch: EvaluationBatch) => void;

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const TERMINAL_BATCH = new Set(['COMPLETED', 'FAILED']);

const active = reactive(new Map<string, MonitoredEval>());
const latest = reactive(new Map<string, ExperimentExecution>());
const latestBatch = shallowRef<EvaluationBatch | null>(null);
let onFinished: FinishedHandler | null = null;
let onBatchFinished: BatchHandler | null = null;
let trackedBatchId: string | null = null;
let batchNotified = false;
let timer: number | undefined;
let polling = false;

export const activeEvals = computed(() => [...active.values()]);
export const monitoredBatch = computed(() => latestBatch.value);

export function latestExecution(id: string): ExperimentExecution | undefined {
  return latest.get(id);
}

export function trackEval(id: string, name: string, execution: ExperimentExecution): void {
  latest.set(id, execution);
  if (TERMINAL_STATUSES.has(execution.status) || active.has(id)) {
    return;
  }
  active.set(id, { id, name, execution });
  startTimer();
}

export function trackBatch(batch: EvaluationBatch): void {
  latestBatch.value = batch;
  if (TERMINAL_BATCH.has(batch.status)) {
    if (trackedBatchId === batch.id) {
      trackedBatchId = null;
    }
    return;
  }
  if (trackedBatchId !== batch.id) {
    batchNotified = false;
  }
  trackedBatchId = batch.id;
  startTimer();
}

export function startEvalMonitor(handlers: {
  onEvalFinished: FinishedHandler;
  onBatchFinished: BatchHandler;
}): () => void {
  onFinished = handlers.onEvalFinished;
  onBatchFinished = handlers.onBatchFinished;
  startTimer();
  return () => {
    onFinished = null;
    onBatchFinished = null;
    stopTimer();
  };
}

async function poll(): Promise<void> {
  if (polling) {
    return;
  }
  polling = true;
  try {
    await Promise.all([
      ...[...active.values()].map((item) => pollOne(item)),
      trackedBatchId === null ? Promise.resolve() : pollBatch(trackedBatchId),
    ]);
  } finally {
    polling = false;
    if (active.size === 0 && trackedBatchId === null) {
      stopTimer();
    }
  }
}

async function pollBatch(id: string): Promise<void> {
  let batch: EvaluationBatch;
  try {
    batch = (await getEvaluationBatch(id)).data;
  } catch {
    return;
  }
  if (trackedBatchId !== id) {
    return;
  }
  latestBatch.value = batch;
  if (!TERMINAL_BATCH.has(batch.status)) {
    return;
  }
  trackedBatchId = null;
  if (!batchNotified) {
    batchNotified = true;
    onBatchFinished?.(batch);
  }
}

async function pollOne(item: MonitoredEval): Promise<void> {
  let execution: ExperimentExecution;
  try {
    execution = (await getExecution(item.id)).data;
  } catch {
    return;
  }
  if (!active.has(item.id)) {
    return;
  }
  latest.set(item.id, execution);
  if (TERMINAL_STATUSES.has(execution.status)) {
    active.delete(item.id);
    onFinished?.({ ...item, execution });
    return;
  }
  active.set(item.id, { ...item, execution });
}

function startTimer(): void {
  if (!onFinished || timer !== undefined) {
    return;
  }
  if (active.size === 0 && trackedBatchId === null) {
    return;
  }
  timer = window.setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
}

function stopTimer(): void {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}
