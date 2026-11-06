<script setup lang="ts">
import type { RunDetail } from '../types';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { findRunEvaluation } from '../api/eval-results';
import type { RunEvaluationView } from '../api/evaluations';
import { getRun } from '../api/execution';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';
import {
  formatDuration,
  formatScore,
  formatTokens,
  formatUsd,
  RUN_OUTCOME_LABELS,
  RUN_OUTCOME_TONES,
  runCost,
  runOutcome,
} from '../utils/eval-metrics';
import { formatJson, formatTimestamp } from '../utils/format';

const route = useRoute();
const run = ref<RunDetail | null>(null);
const evaluation = ref<RunEvaluationView | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const outputExpanded = ref(false);
let generation = 0;
let timer: number | undefined;

const outcome = computed(() =>
  run.value ? runOutcome(run.value, evaluation.value ?? undefined) : 'pending',
);
const cost = computed(() => runCost(run.value ?? undefined));
const usage = computed(() => run.value?.usage ?? null);
const caseLink = computed(() =>
  run.value
    ? `/experiments/${run.value.experimentId}/cases/${run.value.experimentTaskId}`
    : '/experiments',
);

watch(
  () => [route.params.experimentId, route.params.runId],
  () => {
    stopPolling();
    void load();
  },
);

onMounted(() => {
  void load();
});

onUnmounted(() => {
  generation += 1;
  stopPolling();
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  await refresh(true);
  loading.value = false;
}

async function refresh(initial = false): Promise<void> {
  const runId = route.params.runId;
  if (typeof runId !== 'string') {
    error.value = 'Run not found.';
    run.value = null;
    return;
  }
  const current = ++generation;
  try {
    const result = await getRun(runId);
    if (current !== generation) {
      return;
    }
    run.value = result.data;
    evaluation.value = await findRunEvaluation(runId);
    error.value = null;
    if (run.value.status === 'QUEUED' || run.value.status === 'RUNNING') {
      startPolling();
    } else {
      stopPolling();
    }
  } catch (caught) {
    if (current !== generation) {
      return;
    }
    if (initial) {
      run.value = null;
      evaluation.value = null;
    }
    error.value = errorMessage(caught, 'Unable to load the run.');
    stopPolling();
  }
}

function valueText(value: unknown): string {
  if (value === undefined) {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function criterionLabel(passed: boolean | null, applicable: boolean): string {
  if (!applicable || passed === null) {
    return 'Not evaluated';
  }
  return passed ? 'Passed' : 'Failed';
}

function criterionTone(passed: boolean | null, applicable: boolean) {
  if (!applicable || passed === null) {
    return 'neutral' as const;
  }
  return passed ? ('success' as const) : ('danger' as const);
}

function flag(value: boolean | undefined): string {
  return value === undefined ? '—' : value ? 'Yes' : 'No';
}

function startPolling(): void {
  if (timer !== undefined) {
    return;
  }
  timer = window.setInterval(() => {
    void refresh();
  }, 2000);
}

function stopPolling(): void {
  if (timer === undefined) {
    return;
  }
  window.clearInterval(timer);
  timer = undefined;
}
</script>

<template>
  <section class="stack">
    <p class="back-link">
      <RouterLink :to="`/experiments/${route.params.experimentId as string}`">
        Back to eval results
      </RouterLink>
      <template v-if="run">
        · <RouterLink :to="caseLink">Compare this test case</RouterLink>
      </template>
    </p>
    <LoadingState v-if="loading" message="Loading run…" />
    <ErrorState v-else-if="error && !run" :message="error" @retry="load" />
    <template v-else-if="run">
      <PageHeader :title="run.taskName" :description="`${run.configurationLabel} · run details`">
        <template #actions>
          <StatusBadge :label="RUN_OUTCOME_LABELS[outcome]" :tone="RUN_OUTCOME_TONES[outcome]" />
        </template>
      </PageHeader>
      <p v-if="error" class="banner error">{{ error }}</p>

      <section class="panel stack">
        <h3>Run summary</h3>
        <dl class="facts">
          <dt>Status</dt>
          <dd>{{ run.status }}</dd>
          <dt>Duration</dt>
          <dd>{{ formatDuration(run.durationMs) }}</dd>
          <dt>Configuration</dt>
          <dd>
            {{ run.configurationLabel }}
            <span v-if="usage?.model" class="meta">
              {{ usage.provider ?? 'provider not reported' }} / {{ usage.model }}
            </span>
          </dd>
          <dt>Test case</dt>
          <dd>{{ run.taskName }}</dd>
          <dt>Evaluation</dt>
          <dd>
            {{
              evaluation
                ? `${formatScore(evaluation.score)} · ${evaluation.passed ? 'Passed' : 'Failed'}`
                : 'Not evaluated'
            }}
          </dd>
          <dt>Estimated cost</dt>
          <dd>{{ formatUsd(cost) }}</dd>
        </dl>
        <p v-if="run.error" class="banner error">{{ run.error }}</p>
      </section>

      <section class="panel stack">
        <div class="section-header">
          <h3>Final output</h3>
          <button
            v-if="run.finalOutput"
            class="button secondary small"
            type="button"
            :aria-expanded="outputExpanded"
            @click="outputExpanded = !outputExpanded"
          >
            {{ outputExpanded ? 'Collapse' : 'Expand' }}
          </button>
        </div>
        <pre v-if="run.finalOutput" class="output scroll" :class="{ expanded: outputExpanded }">{{
          run.finalOutput
        }}</pre>
        <p v-else class="muted">No output.</p>
      </section>

      <section v-if="run.structuredOutput" class="panel stack">
        <h3>Structured output and schema validation</h3>
        <dl class="facts">
          <dt>JSON extraction</dt>
          <dd>{{ run.structuredOutput.parsed ? 'Extracted' : 'Failed' }}</dd>
          <dt>Schema validation</dt>
          <dd>
            {{
              run.structuredOutput.schemaValid === null
                ? 'Not checked'
                : run.structuredOutput.schemaValid
                  ? 'Valid'
                  : 'Invalid'
            }}
          </dd>
        </dl>
        <p v-if="run.structuredOutput.parseError" class="banner error">
          {{ run.structuredOutput.parseError }}
        </p>
        <ul v-if="run.structuredOutput.validationErrors.length > 0">
          <li v-for="issue in run.structuredOutput.validationErrors" :key="issue">{{ issue }}</li>
        </ul>
        <pre v-if="run.structuredOutput.extracted !== null" class="output scroll">{{
          formatJson(run.structuredOutput.extracted)
        }}</pre>
      </section>

      <section class="panel stack">
        <h3>Evaluation results</h3>
        <template v-if="evaluation">
          <p>
            Score {{ formatScore(evaluation.score) }} ·
            {{ evaluation.passed ? 'Passed' : 'Failed' }}
            <span class="meta">Evaluated {{ formatTimestamp(evaluation.evaluatedAt) }}</span>
          </p>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th class="number">Weight</th>
                  <th>Result</th>
                  <th>Expected</th>
                  <th>Actual</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="criterion in evaluation.criterionResults" :key="criterion.id">
                  <td>
                    {{ criterion.id }}
                    <p class="meta">
                      {{ criterion.type }}{{ criterion.required ? ' · required' : '' }}
                    </p>
                  </td>
                  <td class="number">{{ criterion.weight }}</td>
                  <td>
                    <StatusBadge
                      :label="criterionLabel(criterion.passed, criterion.applicable)"
                      :tone="criterionTone(criterion.passed, criterion.applicable)"
                    />
                    <p class="meta">{{ criterion.explanation }}</p>
                  </td>
                  <td>{{ valueText(criterion.expected) }}</td>
                  <td>{{ valueText(criterion.actual) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else class="muted">No evaluation is stored for this run.</p>
      </section>

      <section class="panel stack">
        <h3>Usage and cost</h3>
        <p v-if="!usage" class="muted">No usage report.</p>
        <template v-else>
          <div class="metric-grid">
            <div class="metric">
              <div class="metric-label">Input tokens</div>
              <div class="metric-value">{{ formatTokens(usage.input_tokens) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Output tokens</div>
              <div class="metric-value">{{ formatTokens(usage.output_tokens) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Reasoning tokens</div>
              <div class="metric-value">{{ formatTokens(usage.reasoning_tokens) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Cached input tokens</div>
              <div class="metric-value">{{ formatTokens(usage.cache_read_tokens) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Total tokens</div>
              <div class="metric-value">{{ formatTokens(usage.total_tokens) }}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Estimated cost</div>
              <div class="metric-value">{{ formatUsd(cost) }}</div>
            </div>
          </div>
          <dl class="facts">
            <dt>Cost status</dt>
            <dd>{{ usage.cost_status ?? '—' }}</dd>
            <dt>Cost source</dt>
            <dd>{{ usage.cost_source ?? '—' }}</dd>
            <dt>Provider</dt>
            <dd>{{ usage.provider ?? '—' }}</dd>
            <dt>Model</dt>
            <dd>{{ usage.model ?? '—' }}</dd>
            <dt>Cache write tokens</dt>
            <dd>{{ formatTokens(usage.cache_write_tokens) }}</dd>
            <dt>API calls</dt>
            <dd>{{ formatTokens(usage.api_calls) }}</dd>
          </dl>
        </template>
      </section>

      <details class="disclosure">
        <summary>Technical details</summary>
        <div class="stack">
          <dl class="facts">
            <dt>Run ID</dt>
            <dd>{{ run.id }}</dd>
            <dt>Exit code</dt>
            <dd>{{ run.processExitCode ?? '—' }}</dd>
            <dt>Hermes profile</dt>
            <dd>{{ run.hermesProfile ?? '—' }}</dd>
            <dt>Hermes session</dt>
            <dd>{{ run.hermesSessionId ?? '—' }}</dd>
            <dt>Started</dt>
            <dd>{{ run.startedAt ? formatTimestamp(run.startedAt) : '—' }}</dd>
            <dt>Completed</dt>
            <dd>{{ run.completedAt ? formatTimestamp(run.completedAt) : '—' }}</dd>
            <template v-if="usage">
              <dt>Turn exit reason</dt>
              <dd>{{ usage.turn_exit_reason ?? '—' }}</dd>
              <dt>Completed / partial / interrupted</dt>
              <dd>
                {{ flag(usage.completed) }} / {{ flag(usage.partial) }} /
                {{ flag(usage.interrupted) }}
              </dd>
            </template>
          </dl>
          <div v-if="usage">
            <h4>Raw usage report</h4>
            <pre class="output scroll">{{ formatJson(usage) }}</pre>
          </div>
        </div>
      </details>
    </template>
  </section>
</template>
