<script setup lang="ts">
import type { ExperimentResponse, RunDetail, RunSummary } from '../types';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  configurationName,
  findRunEvaluation,
  loadConfigurationVersions,
  orderedConfigurations,
  type EvalConfigurationView,
} from '../api/eval-results';
import type { CriterionResultView, RunEvaluationView } from '../api/evaluations';
import { getRun, listRuns } from '../api/execution';
import { getExperiment } from '../api/experiments';
import RunOutputPanel from '../components/experiments/RunOutputPanel.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';
import {
  CASE_OUTCOME_LABELS,
  CASE_OUTCOME_TONES,
  caseOutcome,
  formatScore,
  formatSignedScore,
} from '../utils/eval-metrics';
import { formatJson } from '../utils/format';

interface Side {
  configuration: EvalConfigurationView;
  summary: RunSummary | undefined;
  run: RunDetail | null;
  evaluation: RunEvaluationView | null;
}

interface Loaded {
  experiment: ExperimentResponse;
  configurations: EvalConfigurationView[];
  baseline: Side | null;
  candidate: Side | null;
}

const route = useRoute();
const router = useRouter();
const data = shallowRef<Loaded | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
let generation = 0;

const task = computed(
  () => data.value?.experiment.tasks.find((item) => item.id === route.params.caseId) ?? null,
);
const candidates = computed(() => data.value?.configurations.slice(1) ?? []);
const outcome = computed(() => {
  const loaded = data.value;
  if (!loaded?.baseline || !loaded.candidate) {
    return null;
  }
  return caseOutcome(
    { run: loaded.baseline.summary, evaluation: loaded.baseline.evaluation ?? undefined },
    { run: loaded.candidate.summary, evaluation: loaded.candidate.evaluation ?? undefined },
  );
});
const difference = computed(() => {
  const base = data.value?.baseline?.evaluation;
  const next = data.value?.candidate?.evaluation;
  return base && next ? next.score - base.score : null;
});

const criterionRows = computed(() => {
  const loaded = data.value;
  const current = task.value;
  if (!loaded || !current) {
    return [];
  }
  const baselineResults = new Map(
    (loaded.baseline?.evaluation?.criterionResults ?? []).map((item) => [item.id, item]),
  );
  const candidateResults = new Map(
    (loaded.candidate?.evaluation?.criterionResults ?? []).map((item) => [item.id, item]),
  );
  return current.taskSnapshot.scoringCriteria.map((criterion) => {
    const left = baselineResults.get(criterion.id);
    const right = candidateResults.get(criterion.id);
    return {
      id: criterion.id,
      type: criterion.type,
      weight: criterion.weight,
      required: criterion.required,
      expected: left?.expected ?? right?.expected ?? null,
      baseline: left,
      candidate: right,
      change: criterionChange(left, right),
    };
  });
});

watch(
  () => [route.params.experimentId, route.params.caseId, route.query.candidate],
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  const experimentId = route.params.experimentId;
  const caseId = route.params.caseId;
  if (typeof experimentId !== 'string' || typeof caseId !== 'string') {
    error.value = 'Test case not found.';
    loading.value = false;
    return;
  }
  const current = ++generation;
  loading.value = data.value === null;
  error.value = null;
  try {
    const [experiment, runs] = await Promise.all([
      getExperiment(experimentId),
      listRuns(experimentId),
    ]);
    if (!experiment.data.tasks.some((item) => item.id === caseId)) {
      throw new Error('This test case is not part of the eval.');
    }
    const versions = await loadConfigurationVersions(experiment.data);
    const configurations = orderedConfigurations(experiment.data, versions);
    const requested = route.query.candidate;
    const candidate =
      configurations.slice(1).find((item) => item.id === requested) ?? configurations[1] ?? null;
    const [baselineSide, candidateSide] = await Promise.all([
      loadSide(configurations[0] ?? null, runs.data, caseId),
      loadSide(candidate, runs.data, caseId),
    ]);
    if (current !== generation) {
      return;
    }
    data.value = {
      experiment: experiment.data,
      configurations,
      baseline: baselineSide,
      candidate: candidateSide,
    };
  } catch (caught) {
    if (current !== generation) {
      return;
    }
    data.value = null;
    error.value = errorMessage(caught, 'Unable to load the test case comparison.');
  } finally {
    if (current === generation) {
      loading.value = false;
    }
  }
}

async function loadSide(
  configuration: EvalConfigurationView | null,
  runs: RunSummary[],
  caseId: string,
): Promise<Side | null> {
  if (!configuration) {
    return null;
  }
  const summary = runs.find(
    (run) => run.experimentTaskId === caseId && run.experimentConfigurationId === configuration.id,
  );
  if (!summary) {
    return { configuration, summary, run: null, evaluation: null };
  }
  const [run, evaluation] = await Promise.all([
    getRun(summary.id),
    summary.status === 'COMPLETED' ? findRunEvaluation(summary.id) : Promise.resolve(null),
  ]);
  return { configuration, summary, run: run.data, evaluation };
}

function criterionChange(
  left: CriterionResultView | undefined,
  right: CriterionResultView | undefined,
): 'regressed' | 'improved' | 'unchanged' | null {
  if (!left || !right || left.passed === null || right.passed === null) {
    return null;
  }
  if (left.passed === right.passed) {
    return 'unchanged';
  }
  return right.passed ? 'improved' : 'regressed';
}

function resultLabel(result: CriterionResultView | undefined): string {
  if (!result) {
    return 'Not evaluated';
  }
  if (!result.applicable || result.passed === null) {
    return 'Not applicable';
  }
  return result.passed ? 'Passed' : 'Failed';
}

function resultTone(result: CriterionResultView | undefined) {
  if (!result || !result.applicable || result.passed === null) {
    return 'neutral' as const;
  }
  return result.passed ? ('success' as const) : ('danger' as const);
}

function valueText(value: unknown): string {
  if (value === undefined) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function selectCandidate(candidateId: string): void {
  void router.replace({ query: { ...route.query, candidate: candidateId } });
}
</script>

<template>
  <section class="stack">
    <p class="back-link">
      <RouterLink
        :to="{
          path: `/experiments/${route.params.experimentId as string}`,
          query: route.query.candidate ? { candidate: route.query.candidate } : {},
        }"
      >
        Back to eval results
      </RouterLink>
    </p>
    <LoadingState v-if="loading" message="Loading test case comparison…" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <template v-else-if="data && task">
      <PageHeader
        :title="task.taskSnapshot.name"
        :description="task.taskSnapshot.description ?? undefined"
      >
        <template #actions>
          <StatusBadge
            v-if="outcome"
            :label="CASE_OUTCOME_LABELS[outcome]"
            :tone="CASE_OUTCOME_TONES[outcome]"
          />
          <span v-if="difference !== null" class="badge">
            Score {{ formatSignedScore(difference) }}
          </span>
        </template>
      </PageHeader>

      <section class="panel stack">
        <div class="section-header">
          <h3>Test case</h3>
          <label v-if="candidates.length > 1" class="filter-field">
            <span>Candidate</span>
            <select
              :value="data.candidate?.configuration.id ?? ''"
              @change="selectCandidate(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
                {{ configurationName(candidate) }}
              </option>
            </select>
          </label>
        </div>
        <p class="muted">
          From the snapshot saved with this eval (test case version
          {{ task.taskSnapshot.version }}). Later edits to the test case do not change it.
        </p>
        <dl class="facts">
          <dt>Eval</dt>
          <dd>{{ data.experiment.name }}</dd>
          <dt>Test case version</dt>
          <dd>{{ task.taskSnapshot.version }}</dd>
        </dl>
        <div>
          <h4>Input</h4>
          <pre class="output scroll">{{ task.taskSnapshot.input }}</pre>
        </div>
        <div>
          <h4>Expected outcome</h4>
          <pre class="output scroll">{{ formatJson(task.taskSnapshot.expectedOutcome) }}</pre>
        </div>
        <details v-if="task.taskSnapshot.outputSchema" class="disclosure">
          <summary>Response schema</summary>
          <pre class="output scroll">{{ formatJson(task.taskSnapshot.outputSchema) }}</pre>
        </details>
      </section>

      <section class="panel stack">
        <h3>Criterion results</h3>
        <p v-if="criterionRows.length === 0" class="muted">
          This test case has no scoring criteria.
        </p>
        <div v-else class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th class="number">Weight</th>
                <th>Expected</th>
                <th>Baseline</th>
                <th v-if="data.candidate">Candidate</th>
                <th v-if="data.candidate">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in criterionRows"
                :key="row.id"
                :class="{ 'regressed-row': row.change === 'regressed' }"
              >
                <td>
                  {{ row.id }}
                  <p class="meta">{{ row.type }}{{ row.required ? ' · required' : '' }}</p>
                </td>
                <td class="number">{{ row.weight }}</td>
                <td>{{ valueText(row.expected) }}</td>
                <td>
                  <StatusBadge
                    :label="resultLabel(row.baseline)"
                    :tone="resultTone(row.baseline)"
                  />
                  <p class="meta">Actual: {{ valueText(row.baseline?.actual) }}</p>
                  <p v-if="row.baseline" class="meta">{{ row.baseline.explanation }}</p>
                </td>
                <td v-if="data.candidate">
                  <StatusBadge
                    :label="resultLabel(row.candidate)"
                    :tone="resultTone(row.candidate)"
                  />
                  <p class="meta">Actual: {{ valueText(row.candidate?.actual) }}</p>
                  <p v-if="row.candidate" class="meta">{{ row.candidate.explanation }}</p>
                </td>
                <td v-if="data.candidate">
                  <StatusBadge
                    v-if="row.change"
                    :label="CASE_OUTCOME_LABELS[row.change]"
                    :tone="CASE_OUTCOME_TONES[row.change]"
                  />
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="meta">
          Scores: baseline {{ formatScore(data.baseline?.evaluation?.score) }}
          <template v-if="data.candidate">
            · candidate {{ formatScore(data.candidate.evaluation?.score) }}
          </template>
        </p>
      </section>

      <div class="side-by-side">
        <RunOutputPanel
          v-if="data.baseline"
          title="Baseline"
          :experiment-id="data.experiment.id"
          :configuration="data.baseline.configuration"
          :run="data.baseline.run"
          :evaluation="data.baseline.evaluation"
        />
        <RunOutputPanel
          v-if="data.candidate"
          title="Candidate"
          :experiment-id="data.experiment.id"
          :configuration="data.candidate.configuration"
          :run="data.candidate.run"
          :evaluation="data.candidate.evaluation"
        />
      </div>
    </template>
  </section>
</template>
