<script setup lang="ts">
import type { EvaluationBatch } from '../types';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getEvaluationBatch } from '../api/evaluation-plans';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { monitoredBatch, trackBatch } from '../composables/eval-monitor';
import { errorMessage } from '../utils/api-error';
import { costCaption, formatRate } from '../utils/eval-metrics';
import { formatTimestamp } from '../utils/format';

const route = useRoute();
const loaded = ref<EvaluationBatch | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const batchId = computed(() =>
  typeof route.params.batchId === 'string' ? route.params.batchId : '',
);
const batch = computed(() => {
  const live = monitoredBatch.value;
  if (live && live.id === batchId.value) {
    return live;
  }
  return loaded.value;
});

watch(batchId, () => {
  void load();
});

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  loaded.value = null;
  if (!batchId.value) {
    error.value = 'Batch not found.';
    loading.value = false;
    return;
  }
  try {
    const result = await getEvaluationBatch(batchId.value);
    loaded.value = result.data;
    trackBatch(result.data);
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load the batch.');
  } finally {
    loading.value = false;
  }
}

const itemLabels: Record<EvaluationBatch['items'][number]['status'], string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

function itemTone(status: EvaluationBatch['items'][number]['status']) {
  if (status === 'COMPLETED') {
    return 'success' as const;
  }
  if (status === 'FAILED') {
    return 'danger' as const;
  }
  if (status === 'RUNNING') {
    return 'info' as const;
  }
  return 'neutral' as const;
}

function thresholdLabel(item: EvaluationBatch['items'][number]): string {
  if (item.passRateThreshold === null) {
    return '—';
  }
  if (item.thresholdMet === null) {
    return 'No completed test cases';
  }
  return item.thresholdMet ? 'Met' : 'Below';
}

function progress(value: EvaluationBatch): number {
  if (value.counts.total === 0) {
    return 0;
  }
  return Math.round(((value.counts.completed + value.counts.failed) / value.counts.total) * 100);
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/">Back to dashboard</RouterLink></p>
    <LoadingState v-if="loading" message="Loading batch…" />
    <ErrorState v-else-if="error || !batch" :message="error ?? 'Batch not found.'" @retry="load" />
    <template v-else>
      <PageHeader
        :title="batch.name"
        :description="`Started ${formatTimestamp(batch.startedAt)}`"
      />
      <div class="metric-grid">
        <div class="metric">
          <div class="metric-label">Evaluations</div>
          <div class="metric-value">{{ batch.counts.total }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Completed</div>
          <div class="metric-value">{{ batch.counts.completed }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Running</div>
          <div class="metric-value">{{ batch.counts.running }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Failed</div>
          <div class="metric-value">{{ batch.counts.failed }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Test-case pass rate</div>
          <div class="metric-value">{{ formatRate(batch.passRate) }}</div>
          <p class="meta">
            <template v-if="batch.completedTestCases === 0">No completed test cases</template>
            <template v-else>
              {{ batch.passedTestCases }} of {{ batch.completedTestCases }} completed
            </template>
          </p>
        </div>
        <div class="metric">
          <div class="metric-label">Cost</div>
          <div class="metric-value cost-value">{{ costCaption(batch.cost) }}</div>
        </div>
      </div>
      <div
        v-if="batch.status === 'RUNNING'"
        class="bar-track"
        role="progressbar"
        :aria-valuenow="progress(batch)"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Batch progress"
      >
        <div class="bar-fill" :style="{ width: `${progress(batch)}%` }"></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Version</th>
              <th>Task suite</th>
              <th>Status</th>
              <th>Pass rate</th>
              <th>Threshold</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in batch.items" :key="item.id">
              <td>
                <RouterLink :to="`/experiments/${item.experimentId}`">{{
                  item.agentName
                }}</RouterLink>
              </td>
              <td>Version {{ item.version }}</td>
              <td>{{ item.taskSuiteName }}</td>
              <td>
                <StatusBadge :label="itemLabels[item.status]" :tone="itemTone(item.status)" />
              </td>
              <td>
                {{ formatRate(item.passRate) }}
                <p v-if="item.failedRuns > 0" class="meta">
                  {{ item.failedRuns }} execution failed
                </p>
              </td>
              <td :class="{ negative: item.thresholdMet === false }">{{ thresholdLabel(item) }}</td>
              <td>{{ costCaption(item.cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
