<script setup lang="ts">
import type { Dashboard, EvaluationBatch, EvaluationPlan } from '../types';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getDashboard, startEvaluationBatch, updateEvaluationPlan } from '../api/evaluation-plans';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { useToast } from '../components/ui/toast';
import { monitoredBatch, trackBatch } from '../composables/eval-monitor';
import { errorMessage } from '../utils/api-error';
import {
  costCaption,
  EVAL_STATUS_LABELS,
  EVAL_STATUS_TONES,
  formatRate,
} from '../utils/eval-metrics';
import { formatTimestamp } from '../utils/format';

const toast = useToast();
const dashboard = ref<Dashboard | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const starting = ref(false);
const confirming = ref(false);
const savingPlanId = ref<string | null>(null);

const shownBatch = computed(() => {
  const live = monitoredBatch.value;
  const loaded = dashboard.value?.latestBatch ?? null;
  if (live && (!loaded || live.id === loaded.id || live.status === 'RUNNING')) {
    return live;
  }
  return loaded;
});
const batchRunning = computed(() => shownBatch.value?.status === 'RUNNING');
const enabledEntryCount = computed(() =>
  (dashboard.value?.plans ?? []).reduce((sum, plan) => {
    if (!plan.enabled) {
      return sum;
    }
    return sum + plan.entries.filter((entry) => entry.enabled).length;
  }, 0),
);

watch(
  () => monitoredBatch.value?.status,
  (status, previous) => {
    if (previous === 'RUNNING' && status !== 'RUNNING') {
      void load();
    }
  },
);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  if (!dashboard.value) {
    loading.value = true;
  }
  error.value = null;
  try {
    const result = await getDashboard();
    dashboard.value = result.data;
    if (result.data.latestBatch?.status === 'RUNNING') {
      trackBatch(result.data.latestBatch);
    }
  } catch (caught) {
    if (!dashboard.value) {
      error.value = errorMessage(caught, 'Unable to load the dashboard.');
    } else {
      toast.error(errorMessage(caught, 'Unable to refresh the dashboard.'));
    }
  } finally {
    loading.value = false;
  }
}

async function runAll(): Promise<void> {
  confirming.value = false;
  if (starting.value || batchRunning.value) {
    return;
  }
  starting.value = true;
  try {
    const started = await startEvaluationBatch();
    trackBatch(started.data);
    toast.success('Evaluations started.');
    await load();
  } catch (caught) {
    toast.error(errorMessage(caught, 'Unable to start evaluations.'));
  } finally {
    starting.value = false;
  }
}

async function togglePlan(plan: EvaluationPlan): Promise<void> {
  savingPlanId.value = plan.id;
  try {
    await updateEvaluationPlan(plan.id, {
      name: plan.name,
      description: plan.description,
      enabled: !plan.enabled,
      entries: plan.entries.map((entry) => ({
        agentId: entry.agentId,
        versionPolicy: entry.versionPolicy,
        pinnedVersionId: entry.pinnedVersionId,
        taskSuiteId: entry.taskSuiteId,
        enabled: entry.enabled,
        passRateThreshold: entry.passRateThreshold,
      })),
    });
    await load();
  } catch (caught) {
    toast.error(errorMessage(caught, 'Unable to update the plan.'));
  } finally {
    savingPlanId.value = null;
  }
}

function versionLabel(entry: EvaluationPlan['entries'][number]): string {
  return entry.versionPolicy === 'PINNED' ? `Version ${entry.pinnedVersion}` : 'Latest published';
}

function batchFraction(batch: EvaluationBatch): string {
  const done = batch.counts.completed + batch.counts.failed;
  return `${done} of ${batch.counts.total} evaluations`;
}

function batchPercent(batch: EvaluationBatch): number {
  if (batch.counts.total === 0) {
    return 0;
  }
  return Math.round(((batch.counts.completed + batch.counts.failed) / batch.counts.total) * 100);
}

const problemItems = computed(
  () => dashboard.value?.attention.filter((item) => item.kind !== 'running') ?? [],
);
const runningItems = computed(
  () => dashboard.value?.attention.filter((item) => item.kind === 'running') ?? [],
);
const statusTone = computed(() => {
  if (problemItems.value.some((item) => item.kind === 'failed')) {
    return 'danger';
  }
  if (problemItems.value.length > 0) {
    return 'warning';
  }
  if (batchRunning.value || runningItems.value.length > 0) {
    return 'info';
  }
  if ((dashboard.value?.evaluationsToday ?? 0) === 0) {
    return 'neutral';
  }
  return 'success';
});
const statusTitle = computed(() => {
  const problems = problemItems.value.length;
  if (problems === 1) {
    return '1 evaluation needs attention.';
  }
  if (problems > 1) {
    return `${problems} evaluations need attention.`;
  }
  if (batchRunning.value || runningItems.value.length > 0) {
    return 'Evaluations are running.';
  }
  if ((dashboard.value?.evaluationsToday ?? 0) === 0) {
    return 'No evaluations yet today.';
  }
  const evaluated = dashboard.value?.agentsEvaluatedToday ?? 0;
  const agents = dashboard.value?.agents ?? 0;
  if (agents > 0 && evaluated === agents) {
    return 'All agents evaluated today are clear.';
  }
  return "Today's evaluations are clear.";
});
const statusDetail = computed(() => {
  const summary = dashboard.value;
  if (!summary) {
    return '';
  }
  if (problemItems.value.length > 0 && summary.evaluationsToday === 0) {
    return 'These are from earlier runs. Nothing has been evaluated today.';
  }
  if (summary.evaluationsToday === 0) {
    return 'Run evaluations to see whether the agents are healthy today.';
  }
  const coverage = `${summary.agentsEvaluatedToday} of ${summary.agents} agents evaluated today`;
  if (summary.passRateToday === null) {
    return `No completed test cases yet. ${coverage}.`;
  }
  return `Test-case pass rate ${formatRate(summary.passRateToday)}. ${summary.passedTestCasesToday} of ${summary.completedTestCasesToday} completed. ${coverage}.`;
});

function attentionTone(kind: Dashboard['attention'][number]['kind']) {
  if (kind === 'failed') {
    return 'danger' as const;
  }
  if (kind === 'threshold') {
    return 'warning' as const;
  }
  return 'info' as const;
}

function attentionLabel(kind: Dashboard['attention'][number]['kind']): string {
  if (kind === 'failed') {
    return 'Failed';
  }
  if (kind === 'threshold') {
    return 'Below threshold';
  }
  return 'Running';
}
</script>

<template>
  <section class="stack">
    <PageHeader title="Dashboard" description="Whether today's evaluations are clear.">
      <template #actions>
        <button class="button secondary" type="button" @click="load">Refresh</button>
        <button
          class="button"
          type="button"
          :disabled="starting || batchRunning || enabledEntryCount === 0"
          @click="confirming = true"
        >
          {{ starting ? 'Starting…' : batchRunning ? 'Batch running' : 'Run all evaluations' }}
        </button>
      </template>
    </PageHeader>
    <LoadingState v-if="loading" message="Loading dashboard…" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <template v-else-if="dashboard">
      <section class="status-panel" :class="statusTone" aria-live="polite">
        <div class="section-header">
          <div>
            <h2>{{ statusTitle }}</h2>
            <p>{{ statusDetail }}</p>
          </div>
          <RouterLink v-if="shownBatch" class="button secondary" :to="`/batches/${shownBatch.id}`">
            View results
          </RouterLink>
        </div>
        <div
          v-if="shownBatch && shownBatch.status === 'RUNNING'"
          class="bar-track"
          role="progressbar"
          :aria-valuenow="batchPercent(shownBatch)"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Batch progress"
        >
          <div class="bar-fill" :style="{ width: `${batchPercent(shownBatch)}%` }"></div>
        </div>
        <p v-else-if="shownBatch" class="meta">
          {{ shownBatch.name }} · {{ shownBatch.status === 'FAILED' ? 'Failed' : 'Completed' }} ·
          {{ batchFraction(shownBatch) }} · pass rate {{ formatRate(shownBatch.passRate) }} ·
          {{ costCaption(shownBatch.cost) }}
        </p>
        <ul v-if="dashboard.attention.length > 0" class="attention-list">
          <li v-for="item in dashboard.attention" :key="item.id">
            <StatusBadge :label="attentionLabel(item.kind)" :tone="attentionTone(item.kind)" />
            <div>
              <RouterLink :to="`/experiments/${item.experimentId}`">{{ item.title }}</RouterLink>
              <p class="meta">{{ item.detail }}</p>
            </div>
          </li>
        </ul>
      </section>

      <div class="metric-grid">
        <div class="metric">
          <div class="metric-label">Test-case pass rate today</div>
          <div class="metric-value">{{ formatRate(dashboard.passRateToday) }}</div>
          <p class="meta">
            <template v-if="dashboard.evaluationsToday === 0">No evaluations today</template>
            <template v-else-if="dashboard.passRateToday === null"
              >No completed test cases</template
            >
            <template v-else>
              {{ dashboard.passedTestCasesToday }} of
              {{ dashboard.completedTestCasesToday }} completed
            </template>
          </p>
        </div>
        <div class="metric">
          <div class="metric-label">Agents evaluated today</div>
          <div class="metric-value">
            {{ dashboard.agentsEvaluatedToday }} of {{ dashboard.agents }}
          </div>
        </div>
        <div class="metric">
          <div class="metric-label">Evaluations today</div>
          <div class="metric-value">{{ dashboard.evaluationsToday }}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Evaluation cost today</div>
          <div class="metric-value cost-value">{{ costCaption(dashboard.costToday) }}</div>
        </div>
      </div>
      <p class="inventory-line">
        {{ dashboard.agents }} {{ dashboard.agents === 1 ? 'agent' : 'agents' }} ·
        {{ dashboard.tasks }} {{ dashboard.tasks === 1 ? 'task' : 'tasks' }} ·
        {{ dashboard.taskSuites }}
        {{ dashboard.taskSuites === 1 ? 'task suite' : 'task suites' }}
      </p>

      <section class="panel stack">
        <h3>Recent evaluations</h3>
        <p v-if="dashboard.recent.length === 0" class="muted">No evaluations yet.</p>
        <div v-else class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Evaluation</th>
                <th>Version</th>
                <th>Status</th>
                <th>Pass rate</th>
                <th>Cost</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in dashboard.recent" :key="item.id">
                <td>
                  <RouterLink :to="`/experiments/${item.id}`">{{ item.name }}</RouterLink>
                  <p class="meta">{{ item.agentName }}</p>
                </td>
                <td>{{ item.versions }}</td>
                <td>
                  <StatusBadge
                    :label="EVAL_STATUS_LABELS[item.status]"
                    :tone="EVAL_STATUS_TONES[item.status]"
                  />
                </td>
                <td>
                  {{ formatRate(item.passRate) }}
                  <p v-if="item.failedRuns > 0" class="meta">
                    {{ item.failedRuns }} execution failed
                  </p>
                </td>
                <td>{{ costCaption(item.cost) }}</td>
                <td>{{ item.completedAt ? formatTimestamp(item.completedAt) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="stack">
        <div class="section-header">
          <h3>Evaluation plans</h3>
          <RouterLink class="button" to="/plans/new">Create plan</RouterLink>
        </div>
        <p v-if="enabledEntryCount === 0" class="meta">
          Enable a plan entry before running evaluations.
        </p>
        <p v-if="dashboard.plans.length === 0" class="muted">
          No evaluation plans yet. Create a plan to choose which agents and task suites run
          together.
        </p>
        <article v-for="plan in dashboard.plans" :key="plan.id" class="panel stack">
          <div class="section-header">
            <div>
              <h3>{{ plan.name }}</h3>
              <p v-if="plan.description" class="meta">{{ plan.description }}</p>
              <p class="meta">{{ plan.enabled ? 'Enabled' : 'Disabled' }}</p>
            </div>
            <div class="button-row">
              <button
                class="button secondary small"
                type="button"
                :disabled="savingPlanId === plan.id"
                @click="togglePlan(plan)"
              >
                {{ plan.enabled ? 'Disable' : 'Enable' }}
              </button>
              <RouterLink class="button secondary small" :to="`/plans/${plan.id}`">Edit</RouterLink>
            </div>
          </div>
          <ul v-if="plan.entries.length > 0" class="plan-entries">
            <li v-for="entry in plan.entries" :key="entry.id">
              <strong>{{ entry.agentName }}</strong>
              · {{ versionLabel(entry) }} · {{ entry.taskSuiteName }}
              <span class="meta">
                {{ entry.taskCount }} test cases
                <template v-if="entry.passRateThreshold !== null">
                  · threshold {{ formatRate(entry.passRateThreshold) }}
                </template>
                <template v-if="!entry.enabled"> · disabled</template>
              </span>
            </li>
          </ul>
          <p v-else class="muted">This plan has no entries.</p>
        </article>
      </section>
    </template>

    <ConfirmDialog
      :open="confirming"
      title="Run all evaluations?"
      :message="`This runs ${enabledEntryCount} enabled plan ${enabledEntryCount === 1 ? 'entry' : 'entries'}. Provider usage may incur cost.`"
      confirm-label="Run evaluations"
      @confirm="runAll"
      @cancel="confirming = false"
    />
  </section>
</template>
