<script setup lang="ts">
import type { ExperimentUpdateRequest, RunSummary } from '../types';
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  configurationName,
  createEvalResultsLoader,
  type EvalConfigurationView,
  type EvalResults,
} from '../api/eval-results';
import { evaluateExperiment } from '../api/evaluations';
import type { RunEvaluationView } from '../api/evaluations';
import { startExperiment } from '../api/execution';
import { updateExperiment } from '../api/experiments';
import ExperimentForm from '../components/experiments/ExperimentForm.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SearchInput from '../components/ui/SearchInput.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { useToast } from '../components/ui/toast';
import { latestExecution, trackEval } from '../composables/eval-monitor';
import { errorMessage } from '../utils/api-error';
import {
  averageDuration,
  CASE_OUTCOME_LABELS,
  CASE_OUTCOME_TONES,
  caseOutcome,
  EVAL_STATUS_LABELS,
  EVAL_STATUS_TONES,
  EXECUTION_FAILURE_STATUSES,
  formatDuration,
  formatPoints,
  formatRate,
  formatScore,
  formatSignedScore,
  formatUsd,
  pairedComparison,
  RUN_OUTCOME_LABELS,
  RUN_OUTCOME_TONES,
  runOutcome,
  summarizeCost,
  type CaseOutcome,
  type CostSummary,
  type RunOutcome,
} from '../utils/eval-metrics';
import { formatTimestamp } from '../utils/format';
import { useUnsavedChangesGuard } from '../utils/unsaved-changes';

type CaseFilter = 'all' | CaseOutcome | 'failed';

interface CaseRow {
  experimentTaskId: string;
  name: string;
  version: number;
  baselineRun: RunSummary | undefined;
  baselineEvaluation: RunEvaluationView | undefined;
  candidateRun: RunSummary | undefined;
  candidateEvaluation: RunEvaluationView | undefined;
  baselineOutcome: RunOutcome;
  candidateOutcome: RunOutcome | null;
  outcome: CaseOutcome | null;
  difference: number | null;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const loader = createEvalResultsLoader();
const results = shallowRef<EvalResults | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const editing = ref(false);
const editDirty = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const starting = ref(false);
const confirmingStart = ref(false);
const evaluating = ref(false);
const caseQuery = ref('');
const caseFilter = ref<CaseFilter>('all');
let generation = 0;

const unsaved = useUnsavedChangesGuard(() => editing.value && editDirty.value);

const experiment = computed(() => results.value?.experiment ?? null);
const configurations = computed(() => results.value?.configurations ?? []);
const baseline = computed(() => configurations.value[0] ?? null);
const candidates = computed(() => configurations.value.slice(1));
const selectedCandidateId = computed(() => {
  const requested = route.query.candidate;
  const match = candidates.value.find((item) => item.id === requested);
  return match?.id ?? candidates.value[0]?.id ?? null;
});
const selectedCandidate = computed(
  () => candidates.value.find((item) => item.id === selectedCandidateId.value) ?? null,
);
const isDraft = computed(() => experiment.value?.status === 'DRAFT');
const hasRuns = computed(() => (results.value?.runs.length ?? 0) > 0);

const runIndex = computed(() => {
  const index = new Map<string, RunSummary>();
  for (const run of results.value?.runs ?? []) {
    index.set(`${run.experimentTaskId}:${run.experimentConfigurationId}`, run);
  }
  return index;
});

const lastEvaluated = computed(() => {
  let latest: string | null = null;
  for (const evaluation of results.value?.evaluations.values() ?? []) {
    if (latest === null || evaluation.evaluatedAt > latest) {
      latest = evaluation.evaluatedAt;
    }
  }
  return latest;
});

function runFor(taskId: string, configuration: EvalConfigurationView | null) {
  if (!configuration) {
    return undefined;
  }
  return runIndex.value.get(`${taskId}:${configuration.id}`);
}

function evaluationFor(run: RunSummary | undefined) {
  return run ? results.value?.evaluations.get(run.id) : undefined;
}

function buildRows(candidate: EvalConfigurationView | null): CaseRow[] {
  const current = results.value;
  if (!current) {
    return [];
  }
  return current.experiment.tasks
    .slice()
    .sort((left, right) => left.executionOrder - right.executionOrder)
    .map((task) => {
      const baselineRun = runFor(task.id, baseline.value);
      const baselineEvaluation = evaluationFor(baselineRun);
      const candidateRun = candidate ? runFor(task.id, candidate) : undefined;
      const candidateEvaluation = evaluationFor(candidateRun);
      const outcome = candidate
        ? caseOutcome(
            { run: baselineRun, evaluation: baselineEvaluation },
            { run: candidateRun, evaluation: candidateEvaluation },
          )
        : null;
      return {
        experimentTaskId: task.id,
        name: task.taskSnapshot.name,
        version: task.taskSnapshot.version,
        baselineRun,
        baselineEvaluation,
        candidateRun,
        candidateEvaluation,
        baselineOutcome: runOutcome(baselineRun, baselineEvaluation),
        candidateOutcome: candidate ? runOutcome(candidateRun, candidateEvaluation) : null,
        outcome,
        difference:
          baselineEvaluation && candidateEvaluation
            ? candidateEvaluation.score - baselineEvaluation.score
            : null,
      };
    });
}

const configurationRows = computed(() => {
  const current = results.value;
  if (!current) {
    return [];
  }
  const taskCount = current.experiment.tasks.length;
  return configurations.value.map((configuration) => {
    const stats = current.comparison.configurations.find(
      (item) => item.experimentConfigurationId === configuration.id,
    );
    const runs = current.runs.filter((run) => run.experimentConfigurationId === configuration.id);
    const executionFailures = runs.filter((run) => EXECUTION_FAILURE_STATUSES.has(run.status));
    const notEvaluated = runs.filter(
      (run) => run.status === 'COMPLETED' && !current.evaluations.has(run.id),
    );
    const cost = summarizeCost(
      runs.map((run) => current.details.get(run.id)),
      taskCount,
    );
    return {
      configuration,
      averageScore: stats?.averageScore ?? null,
      passRate: stats?.passRate ?? null,
      passed: stats?.passedEvaluations ?? 0,
      failed: stats?.failedEvaluations ?? 0,
      evaluated: stats?.evaluatedRuns ?? 0,
      executionFailures: executionFailures.length,
      notEvaluated: notEvaluated.length,
      pending:
        taskCount -
        runs.filter((run) => run.status !== 'QUEUED' && run.status !== 'RUNNING').length,
      cost,
      duration: averageDuration(runs),
    };
  });
});

const baselineRow = computed(() => configurationRows.value[0] ?? null);

const candidateSummaries = computed(() =>
  candidates.value.map((candidate) => {
    const rows = buildRows(candidate);
    const pairs = rows.flatMap((row) =>
      row.baselineEvaluation && row.candidateEvaluation
        ? [{ baseline: row.baselineEvaluation, candidate: row.candidateEvaluation }]
        : [],
    );
    const counts: Record<CaseOutcome, number> = {
      improved: 0,
      regressed: 0,
      unchanged: 0,
      not_evaluated: 0,
      execution_failed: 0,
      pending: 0,
    };
    for (const row of rows) {
      if (row.outcome) {
        counts[row.outcome] += 1;
      }
    }
    const paired = pairedComparison(pairs);
    const candidateRow = configurationRows.value.find(
      (row) => row.configuration.id === candidate.id,
    );
    const costChange = costDifference(baselineRow.value?.cost, candidateRow?.cost);
    return {
      candidate,
      paired,
      counts,
      total: rows.length,
      costChange,
      tradeOff: tradeOffSentence(candidate, paired.passRateDelta, paired.pairs, costChange),
    };
  }),
);

const costChanges = computed(
  () =>
    new Map(candidateSummaries.value.map((summary) => [summary.candidate.id, summary.costChange])),
);

const caseRows = computed(() => buildRows(selectedCandidate.value));

const visibleCaseRows = computed(() => {
  const needle = caseQuery.value.trim().toLowerCase();
  return caseRows.value.filter((row) => {
    if (needle.length > 0 && !row.name.toLowerCase().includes(needle)) {
      return false;
    }
    switch (caseFilter.value) {
      case 'all':
        return true;
      case 'failed':
        return (row.candidateOutcome ?? row.baselineOutcome) === 'failed';
      default:
        if (!selectedCandidate.value) {
          return (
            (caseFilter.value === 'not_evaluated' && row.baselineOutcome === 'not_evaluated') ||
            (caseFilter.value === 'execution_failed' &&
              row.baselineOutcome === 'execution_failed') ||
            (caseFilter.value === 'pending' && row.baselineOutcome === 'pending')
          );
        }
        return row.outcome === caseFilter.value;
    }
  });
});

const caseFilterOptions = computed<Array<{ value: CaseFilter; label: string }>>(() =>
  selectedCandidate.value
    ? [
        { value: 'all', label: 'All' },
        { value: 'improved', label: 'Improved' },
        { value: 'regressed', label: 'Regressed' },
        { value: 'unchanged', label: 'Unchanged' },
        { value: 'failed', label: 'Failed (candidate)' },
        { value: 'not_evaluated', label: 'Not evaluated' },
        { value: 'execution_failed', label: 'Execution failed' },
      ]
    : [
        { value: 'all', label: 'All' },
        { value: 'failed', label: 'Failed' },
        { value: 'not_evaluated', label: 'Not evaluated' },
        { value: 'execution_failed', label: 'Execution failed' },
      ],
);

const progress = computed(() => {
  const execution = results.value?.execution;
  if (!execution || execution.planned === 0) {
    return null;
  }
  const done = execution.completed + execution.failed;
  return {
    done,
    planned: execution.planned,
    percent: Math.round((done / execution.planned) * 100),
  };
});

watch(
  () => route.params.experimentId,
  () => {
    editing.value = false;
    results.value = null;
    void load();
  },
);

watch(
  () => {
    const id = route.params.experimentId;
    const execution = typeof id === 'string' ? latestExecution(id) : undefined;
    return execution ? `${execution.status}:${execution.completed}:${execution.failed}` : null;
  },
  (next, previous) => {
    if (next !== null && previous !== null && !loading.value) {
      void refresh();
    }
  },
);

onMounted(() => {
  void load();
});

onUnmounted(() => {
  generation += 1;
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  await refresh(true);
  loading.value = false;
}

async function refresh(initial = false): Promise<void> {
  const experimentId = route.params.experimentId;
  if (typeof experimentId !== 'string') {
    error.value = 'Eval not found.';
    return;
  }
  const current = ++generation;
  try {
    const next = await loader.load(experimentId);
    if (current !== generation) {
      return;
    }
    results.value = next;
    error.value = null;
    if (next.execution.status === 'RUNNING') {
      trackEval(next.experiment.id, next.experiment.name, next.execution);
    }
  } catch (caught) {
    if (current !== generation) {
      return;
    }
    if (initial) {
      results.value = null;
    }
    error.value = errorMessage(caught, 'Unable to load the eval.');
  }
}

function selectCandidate(candidateId: string): void {
  void router.replace({ query: { ...route.query, candidate: candidateId } });
}

async function start(): Promise<void> {
  confirmingStart.value = false;
  if (!experiment.value || starting.value) {
    return;
  }
  const { id, name } = experiment.value;
  starting.value = true;
  try {
    const started = await startExperiment(id);
    trackEval(id, name, started.data);
    toast.success('Eval started successfully.');
    await refresh();
  } catch (caught) {
    toast.error(errorMessage(caught, 'Unable to start the eval.'));
  } finally {
    starting.value = false;
  }
}

async function evaluate(): Promise<void> {
  if (!experiment.value) {
    return;
  }
  evaluating.value = true;
  try {
    const summary = (await evaluateExperiment(experiment.value.id)).data;
    loader.forgetEvaluations();
    await refresh();
    toast.success(
      `Evaluation updated: ${summary.evaluatedRuns} evaluated, ${summary.notEvaluated} not yet evaluated.`,
    );
  } catch (caught) {
    toast.error(errorMessage(caught, 'Unable to evaluate the runs.'));
  } finally {
    evaluating.value = false;
  }
}

async function saveDraft(payload: ExperimentUpdateRequest & { agentId: string }): Promise<void> {
  if (!experiment.value) {
    return;
  }
  saving.value = true;
  saveError.value = null;
  const { agentId: _agentId, ...body } = payload;
  try {
    await updateExperiment(experiment.value.id, body);
    editDirty.value = false;
    editing.value = false;
    toast.success('Draft saved.');
    await refresh();
  } catch (caught) {
    saveError.value = errorMessage(caught, 'Unable to save the draft.');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}

function closeEditor(): void {
  editing.value = false;
  editDirty.value = false;
  saveError.value = null;
}

function openCase(experimentTaskId: string): void {
  void router.push(caseLink(experimentTaskId));
}

function caseLink(experimentTaskId: string) {
  return {
    path: `/experiments/${route.params.experimentId as string}/cases/${experimentTaskId}`,
    query: selectedCandidateId.value ? { candidate: selectedCandidateId.value } : {},
  };
}

function costDifference(base: CostSummary | undefined, candidate: CostSummary | undefined) {
  if (!base || !candidate || !base.complete || !candidate.complete) {
    return null;
  }
  if (base.total === null || candidate.total === null) {
    return null;
  }
  const absolute = candidate.total - base.total;
  return {
    absolute,
    relative: base.total > 0 ? absolute / base.total : null,
  };
}

function tradeOffSentence(
  candidate: EvalConfigurationView,
  passRateDelta: number | null,
  pairs: number,
  costChange: { absolute: number; relative: number | null } | null,
): string | null {
  if (passRateDelta === null) {
    return null;
  }
  const points = Math.round(passRateDelta * 100);
  const quality =
    points > 0
      ? `raises the pass rate by ${points} percentage points`
      : points < 0
        ? `lowers the pass rate by ${Math.abs(points)} percentage points`
        : 'keeps the same pass rate';
  const scope = `across ${pairs} test ${pairs === 1 ? 'case' : 'cases'} evaluated for both`;
  if (!costChange || costChange.relative === null) {
    return `${candidate.label} ${quality} ${scope}. Cost cannot be compared because cost data is incomplete.`;
  }
  const percent = Math.round(costChange.relative * 100);
  const cost =
    percent > 0
      ? `costs ${percent}% more`
      : percent < 0
        ? `costs ${Math.abs(percent)}% less`
        : 'costs about the same';
  return `${candidate.label} ${quality} ${scope} and ${cost} than the baseline (estimated).`;
}

function costText(cost: CostSummary): string {
  return formatUsd(cost.total);
}

function costCoverage(cost: CostSummary): string {
  if (cost.total === null) {
    return cost.expectedRuns > 0 ? 'No run reported a cost.' : '';
  }
  const kind = cost.allActual ? 'Reported actual cost' : 'Estimated';
  const sources = cost.sources.length > 0 ? ` · ${cost.sources.join(', ')}` : '';
  return cost.complete
    ? `${kind}${sources}`
    : `${kind} · incomplete: ${cost.costedRuns} of ${cost.expectedRuns} runs${sources}`;
}

function perCase(cost: CostSummary): string {
  if (!cost.complete || cost.total === null || cost.expectedRuns === 0) {
    return '—';
  }
  return formatUsd(cost.total / cost.expectedRuns);
}

function perPassed(cost: CostSummary, passed: number): string {
  if (!cost.complete || cost.total === null || passed === 0) {
    return '—';
  }
  return formatUsd(cost.total / passed);
}

function signedUsd(value: number): string {
  if (value === 0) {
    return formatUsd(0);
  }
  return `${value > 0 ? '+' : '−'}${formatUsd(Math.abs(value))}`;
}

function formatPercentChange(relative: number): string {
  const percent = Math.round(relative * 100);
  if (percent === 0) {
    return 'About the same';
  }
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`;
}

function deltaClass(value: number | null, higherIsBetter = true): string {
  if (value === null || Math.abs(value) < 1e-9) {
    return '';
  }
  return value > 0 === higherIsBetter ? 'positive' : 'negative';
}

function scoreCell(evaluation: RunEvaluationView | undefined, outcome: RunOutcome): string {
  if (evaluation) {
    return formatScore(evaluation.score);
  }
  return RUN_OUTCOME_LABELS[outcome];
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/experiments">Back to evals</RouterLink></p>
    <LoadingState v-if="loading" message="Loading eval…" />
    <ErrorState v-else-if="error && !experiment" :message="error" @retry="load" />
    <template v-else-if="experiment && results">
      <PageHeader :title="experiment.name" :description="experiment.description ?? undefined">
        <template #actions>
          <button class="button secondary" type="button" @click="refresh()">Refresh</button>
          <button
            v-if="isDraft"
            class="button secondary"
            type="button"
            :disabled="editing"
            @click="editing = true"
          >
            Edit draft
          </button>
          <button
            v-if="isDraft"
            class="button"
            type="button"
            :disabled="starting || editing"
            @click="confirmingStart = true"
          >
            {{ starting ? 'Starting…' : 'Start eval' }}
          </button>
          <button
            v-if="!isDraft"
            class="button"
            type="button"
            :disabled="evaluating || experiment.status === 'RUNNING'"
            @click="evaluate"
          >
            {{ evaluating ? 'Evaluating…' : 'Evaluate runs' }}
          </button>
        </template>
      </PageHeader>
      <p v-if="error" class="banner error">{{ error }}</p>

      <section class="panel">
        <dl class="facts">
          <dt>Agent</dt>
          <dd>
            <RouterLink class="name-link" :to="`/agents/${experiment.agentId}`">
              {{ experiment.agentName }}
            </RouterLink>
          </dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge
              :label="EVAL_STATUS_LABELS[experiment.status] ?? experiment.status"
              :tone="EVAL_STATUS_TONES[experiment.status] ?? 'neutral'"
            />
            <span v-if="progress && !isDraft" class="meta">
              {{ progress.done }} of {{ progress.planned }} runs finished
            </span>
          </dd>
          <dt>Baseline configuration</dt>
          <dd>
            <template v-if="baseline">
              {{ configurationName(baseline) }}
              <StatusBadge label="Baseline" tone="info" />
            </template>
            <template v-else>—</template>
          </dd>
          <dt>Candidate configurations</dt>
          <dd>
            <span v-if="candidates.length === 0" class="muted">
              None. This eval measures the baseline only.
            </span>
            <template v-else>
              {{ candidates.map(configurationName).join(', ') }}
            </template>
          </dd>
          <dt>Test cases</dt>
          <dd>
            {{ experiment.uniqueTaskCount }}
            <span v-if="experiment.taskSuites.length > 0" class="meta">
              Suites: {{ experiment.taskSuites.map((suite) => suite.name).join(', ') }}
            </span>
          </dd>
          <dt>Planned executions</dt>
          <dd>{{ experiment.plannedExecutionCount }}</dd>
          <dt>Last executed</dt>
          <dd>
            {{
              results.execution.completedAt || results.execution.startedAt
                ? formatTimestamp(
                    results.execution.completedAt ?? results.execution.startedAt ?? '',
                  )
                : 'Not run yet'
            }}
          </dd>
          <dt>Last evaluated</dt>
          <dd>{{ lastEvaluated ? formatTimestamp(lastEvaluated) : 'Not evaluated yet' }}</dd>
        </dl>
        <div
          v-if="experiment.status === 'RUNNING' && progress"
          class="bar-track"
          aria-hidden="true"
        >
          <div class="bar-fill" :style="{ width: `${progress.percent}%` }" />
        </div>
      </section>

      <section v-if="editing" class="stack">
        <div class="section-header">
          <h3>Edit draft</h3>
        </div>
        <ExperimentForm
          :initial="experiment"
          :saving="saving"
          :error="saveError"
          @submit="saveDraft"
          @cancel="closeEditor"
          @dirty="editDirty = $event"
        />
      </section>

      <section v-if="isDraft && !editing" class="panel stack">
        <h3>Ready to run</h3>
        <p class="muted">
          Start eval runs every configuration against every test case, one at a time. Completed runs
          are then evaluated against the saved test case snapshots.
        </p>
        <details class="disclosure">
          <summary>Test cases in this eval ({{ experiment.tasks.length }})</summary>
          <ul class="stack">
            <li v-for="task in experiment.tasks" :key="task.id">
              {{ task.taskSnapshot.name }}
              <span class="meta">v{{ task.taskSnapshot.version }}</span>
            </li>
          </ul>
        </details>
      </section>

      <template v-if="!isDraft">
        <section v-if="candidates.length === 0 && baseline && baselineRow" class="panel stack">
          <h3>Evaluation summary</h3>
          <p>
            Baseline evaluation. This evaluation measures one agent configuration against the
            selected test suite. No candidate configuration was included.
          </p>
          <dl class="facts">
            <dt>Configuration</dt>
            <dd>{{ configurationName(baseline) }}</dd>
            <dt>Average score</dt>
            <dd>{{ formatScore(baselineRow.averageScore) }}</dd>
            <dt>Pass rate</dt>
            <dd>{{ formatRate(baselineRow.passRate) }}</dd>
            <dt>Test cases</dt>
            <dd>
              {{ baselineRow.passed }} passed · {{ baselineRow.failed }} failed evaluation ·
              {{ baselineRow.executionFailures }} execution failed
            </dd>
          </dl>
        </section>

        <section v-else class="panel stack">
          <div class="section-header">
            <h3>Comparison with baseline</h3>
            <p class="muted">
              Differences use test cases evaluated for both configurations. Pass-rate changes are in
              percentage points.
            </p>
          </div>
          <div class="stack">
            <article
              v-for="summary in candidateSummaries"
              :key="summary.candidate.id"
              class="record stack"
            >
              <div class="section-header">
                <h4>
                  {{ configurationName(summary.candidate) }}
                  <span class="muted">vs baseline {{ baseline?.label }}</span>
                </h4>
                <button
                  v-if="candidates.length > 1 && summary.candidate.id !== selectedCandidateId"
                  class="button secondary small"
                  type="button"
                  @click="selectCandidate(summary.candidate.id)"
                >
                  Show in test case table
                </button>
              </div>
              <div class="metric-grid">
                <div class="metric">
                  <div class="metric-label">Average score change</div>
                  <div class="metric-value" :class="deltaClass(summary.paired.scoreDelta)">
                    {{ formatSignedScore(summary.paired.scoreDelta) }}
                  </div>
                </div>
                <div class="metric">
                  <div class="metric-label">Pass-rate change</div>
                  <div class="metric-value" :class="deltaClass(summary.paired.passRateDelta)">
                    {{ formatPoints(summary.paired.passRateDelta) }}
                  </div>
                  <div v-if="summary.paired.pairs > 0" class="meta">
                    {{ formatRate(summary.paired.baselinePassRate) }} →
                    {{ formatRate(summary.paired.candidatePassRate) }}
                  </div>
                </div>
                <div class="metric">
                  <div class="metric-label">Improved</div>
                  <div class="metric-value positive">{{ summary.counts.improved }}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Regressed</div>
                  <div class="metric-value negative">{{ summary.counts.regressed }}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Unchanged</div>
                  <div class="metric-value">{{ summary.counts.unchanged }}</div>
                </div>
              </div>
              <p class="meta">
                Compared {{ summary.paired.pairs }} of {{ summary.total }} test cases.
                <template v-if="summary.counts.not_evaluated > 0">
                  {{ summary.counts.not_evaluated }} not evaluated.
                </template>
                <template v-if="summary.counts.execution_failed > 0">
                  {{ summary.counts.execution_failed }} with an execution failure.
                </template>
                <template v-if="summary.counts.pending > 0">
                  {{ summary.counts.pending }} still pending.
                </template>
              </p>
              <p v-if="summary.tradeOff">{{ summary.tradeOff }}</p>
            </article>
          </div>
        </section>

        <section class="panel stack">
          <div class="section-header">
            <h3>{{ candidates.length === 0 ? 'Test cases' : 'Test case comparison' }}</h3>
            <label v-if="candidates.length > 1" class="filter-field">
              <span>Candidate</span>
              <select
                :value="selectedCandidateId ?? ''"
                @change="selectCandidate(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
                  {{ configurationName(candidate) }}
                </option>
              </select>
            </label>
          </div>
          <div class="toolbar">
            <SearchInput v-model="caseQuery" label="Search" placeholder="Test case name" />
            <label class="filter-field">
              <span>Result</span>
              <select v-model="caseFilter">
                <option
                  v-for="option in caseFilterOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
          <EmptyState v-if="!hasRuns" message="No runs yet. Results appear as runs complete." />
          <EmptyState
            v-else-if="visibleCaseRows.length === 0"
            message="No test cases match these filters."
          />
          <div v-else class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Test case</th>
                  <th class="number">Baseline ({{ baseline?.label }})</th>
                  <template v-if="selectedCandidate">
                    <th class="number">Candidate ({{ selectedCandidate.label }})</th>
                    <th class="number">Difference</th>
                  </template>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in visibleCaseRows"
                  :key="row.experimentTaskId"
                  class="clickable"
                  @click="openCase(row.experimentTaskId)"
                >
                  <td>
                    <RouterLink class="name-link" :to="caseLink(row.experimentTaskId)" @click.stop>
                      {{ row.name }}
                    </RouterLink>
                    <p class="meta">Test case v{{ row.version }}</p>
                  </td>
                  <td class="number">
                    {{ scoreCell(row.baselineEvaluation, row.baselineOutcome) }}
                    <p v-if="row.baselineEvaluation" class="meta">
                      {{ row.baselineEvaluation.passed ? 'Passed' : 'Failed' }}
                    </p>
                  </td>
                  <template v-if="selectedCandidate">
                    <td class="number">
                      {{ scoreCell(row.candidateEvaluation, row.candidateOutcome ?? 'pending') }}
                      <p v-if="row.candidateEvaluation" class="meta">
                        {{ row.candidateEvaluation.passed ? 'Passed' : 'Failed' }}
                      </p>
                    </td>
                    <td class="number">
                      <span class="delta" :class="deltaClass(row.difference)">
                        {{ formatSignedScore(row.difference) }}
                      </span>
                    </td>
                  </template>
                  <td>
                    <StatusBadge
                      v-if="row.outcome"
                      :label="CASE_OUTCOME_LABELS[row.outcome]"
                      :tone="CASE_OUTCOME_TONES[row.outcome]"
                    />
                    <StatusBadge
                      v-else
                      :label="RUN_OUTCOME_LABELS[row.baselineOutcome]"
                      :tone="RUN_OUTCOME_TONES[row.baselineOutcome]"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel stack">
          <div class="section-header">
            <h3>Results by configuration</h3>
            <p class="muted">
              Scores and pass rates use evaluated runs only. Execution failures are counted
              separately from failed evaluations.
            </p>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Configuration</th>
                  <th class="number">Avg score</th>
                  <th class="number">Pass rate</th>
                  <th class="number">Passed</th>
                  <th class="number">Failed evaluation</th>
                  <th class="number">Execution failed</th>
                  <th class="number">Not evaluated</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in configurationRows" :key="row.configuration.id">
                  <td>
                    {{ configurationName(row.configuration) }}
                    <p class="meta">
                      <StatusBadge
                        :label="row.configuration.role === 'baseline' ? 'Baseline' : 'Candidate'"
                        :tone="row.configuration.role === 'baseline' ? 'info' : 'neutral'"
                      />
                    </p>
                  </td>
                  <td class="number">
                    {{ formatScore(row.averageScore) }}
                    <div v-if="row.averageScore !== null" class="bar-track" aria-hidden="true">
                      <div
                        class="bar-fill"
                        :class="{ baseline: row.configuration.role === 'baseline' }"
                        :style="{ width: `${row.averageScore * 100}%` }"
                      />
                    </div>
                  </td>
                  <td class="number">
                    {{ formatRate(row.passRate) }}
                    <div v-if="row.passRate !== null" class="bar-track" aria-hidden="true">
                      <div
                        class="bar-fill"
                        :class="{ baseline: row.configuration.role === 'baseline' }"
                        :style="{ width: `${row.passRate * 100}%` }"
                      />
                    </div>
                  </td>
                  <td class="number">{{ row.passed }}</td>
                  <td class="number">{{ row.failed }}</td>
                  <td class="number">{{ row.executionFailures }}</td>
                  <td class="number">
                    {{ row.notEvaluated }}
                    <p v-if="row.pending > 0" class="meta">{{ row.pending }} pending</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel stack">
          <div class="section-header">
            <h3>Cost and duration</h3>
            <p class="muted">
              Costs are summed from the cost each run reported. They are estimates unless every run
              reported an actual cost. Missing costs are never counted as zero.
            </p>
          </div>
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Configuration</th>
                  <th class="number">Total cost</th>
                  <th class="number">Vs baseline</th>
                  <th class="number">Per test case</th>
                  <th class="number">Per passed test case</th>
                  <th class="number">Avg duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in configurationRows" :key="row.configuration.id">
                  <td>
                    {{ configurationName(row.configuration) }}
                    <p class="meta">
                      {{ row.configuration.role === 'baseline' ? 'Baseline' : 'Candidate' }}
                    </p>
                  </td>
                  <td class="number">
                    {{ costText(row.cost) }}
                    <p class="meta">{{ costCoverage(row.cost) }}</p>
                  </td>
                  <td class="number">
                    <template v-if="row.configuration.role === 'baseline'">—</template>
                    <template v-else-if="costChanges.get(row.configuration.id)">
                      <span
                        class="delta"
                        :class="
                          deltaClass(costChanges.get(row.configuration.id)?.absolute ?? null, false)
                        "
                      >
                        {{ signedUsd(costChanges.get(row.configuration.id)?.absolute ?? 0) }}
                      </span>
                      <p
                        v-if="(costChanges.get(row.configuration.id)?.relative ?? null) !== null"
                        class="meta"
                      >
                        {{
                          formatPercentChange(costChanges.get(row.configuration.id)?.relative ?? 0)
                        }}
                      </p>
                    </template>
                    <span v-else class="muted">Not comparable</span>
                  </td>
                  <td class="number">{{ perCase(row.cost) }}</td>
                  <td class="number">{{ perPassed(row.cost, row.passed) }}</td>
                  <td class="number">
                    {{ row.duration ? formatDuration(row.duration.average) : '—' }}
                    <p v-if="row.duration" class="meta">{{ row.duration.count }} completed runs</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <details class="disclosure">
          <summary>Execution details ({{ results.runs.length }} runs)</summary>
          <div class="stack">
            <p class="meta">
              Planned {{ results.execution.planned }} · Completed
              {{ results.execution.completed }} · Failed {{ results.execution.failed }} · Pending
              {{ results.execution.pending }}
            </p>
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Test case</th>
                    <th>Configuration</th>
                    <th>Status</th>
                    <th class="number">Duration</th>
                    <th class="number">Exit code</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in results.runs" :key="run.id">
                    <td>
                      <RouterLink
                        class="name-link"
                        :to="`/experiments/${experiment.id}/runs/${run.id}`"
                      >
                        {{ run.taskName }}
                      </RouterLink>
                    </td>
                    <td>{{ run.configurationLabel }}</td>
                    <td>{{ run.status }}</td>
                    <td class="number">{{ formatDuration(run.durationMs) }}</td>
                    <td class="number">{{ run.processExitCode ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </template>
    </template>
    <ConfirmDialog
      :open="confirmingStart"
      title="Start eval?"
      :message="`This runs ${experiment?.plannedExecutionCount ?? 0} executions with the selected configurations. Provider usage may incur cost.`"
      confirm-label="Start eval"
      @confirm="start"
      @cancel="confirmingStart = false"
    />
    <ConfirmDialog
      :open="unsaved.confirming.value"
      title="Discard draft changes?"
      message="Your changes to this draft have not been saved."
      confirm-label="Discard changes"
      tone="danger"
      @confirm="unsaved.leave"
      @cancel="unsaved.stay"
    />
  </section>
</template>
