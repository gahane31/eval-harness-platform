import type { ExperimentExecution } from '../types';
import { computed, reactive } from 'vue';
import { getExecution } from '../api/execution';

export interface MonitoredEval {
  id: string;
  name: string;
  execution: ExperimentExecution;
}

type FinishedHandler = (item: MonitoredEval) => void;

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

const active = reactive(new Map<string, MonitoredEval>());
const latest = reactive(new Map<string, ExperimentExecution>());
let onFinished: FinishedHandler | null = null;
let timer: number | undefined;
let polling = false;

export const activeEvals = computed(() => [...active.values()]);

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

export function startEvalMonitor(handler: FinishedHandler): () => void {
  onFinished = handler;
  startTimer();
  return () => {
    onFinished = null;
    stopTimer();
  };
}

async function poll(): Promise<void> {
  if (polling) {
    return;
  }
  polling = true;
  try {
    await Promise.all([...active.values()].map((item) => pollOne(item)));
  } finally {
    polling = false;
    if (active.size === 0) {
      stopTimer();
    }
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
  if (onFinished && active.size > 0 && timer === undefined) {
    timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }
}

function stopTimer(): void {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}
