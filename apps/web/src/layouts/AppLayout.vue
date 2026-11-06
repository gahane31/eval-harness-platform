<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useToast } from '../components/ui/toast';
import {
  activeEvals,
  monitoredBatch,
  startEvalMonitor,
  type MonitoredEval,
} from '../composables/eval-monitor';
import type { EvaluationBatch } from '../types';

const route = useRoute();
const toast = useToast();
const menu = ref<HTMLDetailsElement | null>(null);
const sections = [
  { path: '/', label: 'Dashboard', exact: true },
  { path: '/agents', label: 'Agents', exact: false },
  { path: '/tasks', label: 'Tasks', exact: false },
  { path: '/experiments', label: 'Evals', exact: false },
];
const runningBatch = computed(() =>
  monitoredBatch.value?.status === 'RUNNING' ? monitoredBatch.value : null,
);

const stopMonitor = startEvalMonitor({
  onEvalFinished: notifyFinished,
  onBatchFinished: notifyBatch,
});
onUnmounted(stopMonitor);

watch(
  () => route.fullPath,
  () => {
    if (menu.value) {
      menu.value.open = false;
    }
  },
);

function notifyBatch(batch: EvaluationBatch): void {
  const to = `/batches/${batch.id}`;
  if (batch.counts.failed > 0) {
    toast.error(`Evaluations finished with failures: ${batch.name}`, { label: 'View results', to });
  } else {
    toast.success(`Evaluations completed: ${batch.name}`, { label: 'View results', to });
  }
}

function notifyFinished(item: MonitoredEval): void {
  const to = `/experiments/${item.id}`;
  if (item.execution.status === 'COMPLETED') {
    toast.success(`Eval completed: ${item.name}`, { label: 'View results', to });
  } else if (item.execution.status === 'FAILED') {
    toast.error(`Eval failed: ${item.name}`, { label: 'Open eval', to });
  } else {
    toast.info(`Eval cancelled: ${item.name}`, { label: 'Open eval', to });
  }
}

function progressText(item: MonitoredEval): string {
  const { completed, failed, planned } = item.execution;
  return `${completed + failed} of ${planned} executions`;
}

function progressPercent(item: MonitoredEval): number {
  const { completed, failed, planned } = item.execution;
  return planned > 0 ? Math.round(((completed + failed) / planned) * 100) : 0;
}

function batchProgress(batch: EvaluationBatch): number {
  if (batch.counts.total === 0) {
    return 0;
  }
  return Math.round(((batch.counts.completed + batch.counts.failed) / batch.counts.total) * 100);
}

function isActive(section: { path: string; exact: boolean }): boolean {
  if (section.exact) {
    return route.path === section.path;
  }
  return route.path === section.path || route.path.startsWith(`${section.path}/`);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Local evaluation workspace</p>
        <h1>Agent Evaluation Platform</h1>
      </div>
      <nav aria-label="Primary">
        <RouterLink
          v-for="section in sections"
          :key="section.path"
          :to="section.path"
          :class="{ 'router-link-active': isActive(section) }"
          :aria-current="isActive(section) ? 'page' : undefined"
        >
          {{ section.label }}
        </RouterLink>
        <details v-if="runningBatch || activeEvals.length > 0" ref="menu" class="eval-indicator">
          <summary>
            <span class="pulse" aria-hidden="true"></span>
            <template v-if="runningBatch">Batch running</template>
            <template v-else>
              {{ activeEvals.length }} {{ activeEvals.length === 1 ? 'eval' : 'evals' }} running
            </template>
          </summary>
          <ul class="eval-indicator-menu">
            <li v-if="runningBatch">
              <strong>{{ runningBatch.name }}</strong>
              <p class="meta">
                Running · {{ runningBatch.counts.completed + runningBatch.counts.failed }} of
                {{ runningBatch.counts.total }} evaluations
                <template v-if="runningBatch.counts.failed > 0">
                  · {{ runningBatch.counts.failed }} failed
                </template>
              </p>
              <div
                class="bar-track"
                role="progressbar"
                :aria-valuenow="batchProgress(runningBatch)"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Batch progress"
              >
                <div class="bar-fill" :style="{ width: `${batchProgress(runningBatch)}%` }"></div>
              </div>
              <RouterLink :to="`/batches/${runningBatch.id}`">View batch</RouterLink>
            </li>
            <li v-for="item in activeEvals" :key="item.id">
              <strong>{{ item.name }}</strong>
              <p class="meta">
                {{ item.execution.status === 'RUNNING' ? 'Running' : item.execution.status }} ·
                {{ progressText(item) }}
                <template v-if="item.execution.failed > 0">
                  · {{ item.execution.failed }} failed
                </template>
              </p>
              <div
                class="bar-track"
                role="progressbar"
                :aria-valuenow="progressPercent(item)"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="`${item.name} progress`"
              >
                <div class="bar-fill" :style="{ width: `${progressPercent(item)}%` }"></div>
              </div>
              <RouterLink :to="`/experiments/${item.id}`">Open eval</RouterLink>
            </li>
          </ul>
        </details>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
