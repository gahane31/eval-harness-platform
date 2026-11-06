<script setup lang="ts">
import type { ExperimentResponse } from '../types';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { loadEvalListMetrics, loadEvalRunDetails, type EvalListMetrics } from '../api/eval-results';
import { listAllExperiments } from '../api/experiments';
import EmptyState from '../components/ui/EmptyState.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import ListPagination from '../components/ui/ListPagination.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SearchInput from '../components/ui/SearchInput.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';
import {
  EVAL_STATUS_LABELS,
  EVAL_STATUS_TONES,
  formatRate,
  formatScore,
  formatUsd,
  summarizeCost,
  type CostSummary,
} from '../utils/eval-metrics';
import { formatTimestamp } from '../utils/format';

const PAGE_SIZE = 8;
const ALL = 'all';
const STATUS_ORDER: Record<string, number> = {
  COMPLETED: 0,
  RUNNING: 1,
  DRAFT: 2,
  FAILED: 3,
  CANCELLED: 4,
};

const evals = shallowRef<ExperimentResponse[]>([]);
const metrics = ref(new Map<string, EvalListMetrics>());
const costs = ref(new Map<string, CostSummary | 'loading' | 'error'>());
const loading = ref(true);
const error = ref<string | null>(null);
const query = ref('');
const agentFilter = ref(ALL);
const statusFilter = ref(ALL);
const page = ref(1);
let loadGeneration = 0;

const agentOptions = computed(() => {
  const byId = new Map<string, string>();
  for (const item of evals.value) {
    byId.set(item.agentId, item.agentName);
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
});

const sorted = computed(() =>
  evals.value.slice().sort((left, right) => {
    const leftResults = hasResults(left) ? 0 : 1;
    const rightResults = hasResults(right) ? 0 : 1;
    if (leftResults !== rightResults) {
      return leftResults - rightResults;
    }
    const statusDifference = (STATUS_ORDER[left.status] ?? 9) - (STATUS_ORDER[right.status] ?? 9);
    if (statusDifference !== 0) {
      return statusDifference;
    }
    return lastActivity(right).localeCompare(lastActivity(left));
  }),
);

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return sorted.value.filter((item) => {
    if (agentFilter.value !== ALL && item.agentId !== agentFilter.value) {
      return false;
    }
    if (statusFilter.value !== ALL && item.status !== statusFilter.value) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(needle) ||
      (item.description ?? '').toLowerCase().includes(needle)
    );
  });
});

const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

watch([query, agentFilter, statusFilter], () => {
  page.value = 1;
});

watch(filtered, (items) => {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (page.value > pages) {
    page.value = pages;
  }
});

watch(pageItems, (items) => {
  void loadCosts(items);
});

onMounted(() => {
  void load();
});

function hasResults(item: ExperimentResponse): boolean {
  return (metrics.value.get(item.id)?.summary?.evaluatedRuns ?? 0) > 0;
}

function lastActivity(item: ExperimentResponse): string {
  const execution = metrics.value.get(item.id)?.execution;
  return execution?.completedAt ?? execution?.startedAt ?? item.createdAt;
}

function lastExecuted(item: ExperimentResponse): string | null {
  const execution = metrics.value.get(item.id)?.execution;
  return execution?.completedAt ?? execution?.startedAt ?? null;
}

function costLabel(item: ExperimentResponse): string {
  const cost = costs.value.get(item.id);
  if (item.status === 'DRAFT') {
    return '—';
  }
  if (cost === undefined || cost === 'loading') {
    return 'Loading…';
  }
  if (cost === 'error') {
    return 'Cost unavailable';
  }
  return formatUsd(cost.total);
}

function costNote(item: ExperimentResponse): string | null {
  const cost = costs.value.get(item.id);
  if (typeof cost !== 'object' || cost.total === null) {
    return null;
  }
  const kind = cost.allActual ? 'Reported' : 'Estimated';
  return cost.complete ? kind : `${kind} · ${cost.costedRuns} of ${cost.expectedRuns} runs`;
}

async function load(): Promise<void> {
  const generation = loadGeneration + 1;
  loadGeneration = generation;
  loading.value = true;
  error.value = null;
  try {
    const items = await listAllExperiments();
    const listMetrics = await loadEvalListMetrics(items);
    if (generation !== loadGeneration) {
      return;
    }
    evals.value = items;
    metrics.value = listMetrics;
    costs.value = new Map();
  } catch (caught) {
    if (generation !== loadGeneration) {
      return;
    }
    evals.value = [];
    error.value = errorMessage(caught, 'Unable to load evals.');
  } finally {
    if (generation === loadGeneration) {
      loading.value = false;
    }
  }
}

async function loadCosts(items: ExperimentResponse[]): Promise<void> {
  const pending = items.filter((item) => item.status !== 'DRAFT' && !costs.value.has(item.id));
  for (const item of pending) {
    costs.value.set(item.id, 'loading');
  }
  await Promise.all(
    pending.map(async (item) => {
      try {
        const details = await loadEvalRunDetails(item.id);
        costs.value.set(item.id, summarizeCost(details, item.plannedExecutionCount));
      } catch {
        costs.value.set(item.id, 'error');
      }
    }),
  );
}
</script>

<template>
  <section class="stack">
    <PageHeader
      title="Evals"
      description="Evaluate agent configurations against consistent test cases and compare quality, performance and cost."
    >
      <template #actions>
        <button class="button secondary" type="button" @click="load">Refresh</button>
        <RouterLink class="button" to="/experiments/new">Create eval</RouterLink>
      </template>
    </PageHeader>
    <section class="panel">
      <div class="toolbar">
        <SearchInput v-model="query" label="Search" placeholder="Eval name or description" />
        <label class="filter-field">
          <span>Agent</span>
          <select v-model="agentFilter">
            <option :value="ALL">All agents</option>
            <option v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </option>
          </select>
        </label>
        <label class="filter-field">
          <span>Status</span>
          <select v-model="statusFilter">
            <option :value="ALL">All statuses</option>
            <option v-for="(label, status) in EVAL_STATUS_LABELS" :key="status" :value="status">
              {{ label }}
            </option>
          </select>
        </label>
      </div>
      <LoadingState v-if="loading" message="Loading evals…" />
      <ErrorState v-else-if="error" :message="error" @retry="load" />
      <EmptyState
        v-else-if="evals.length === 0"
        message="No evals yet. Create an eval to compare published agent configurations on the same test cases."
      >
        <RouterLink class="button" to="/experiments/new">Create eval</RouterLink>
      </EmptyState>
      <EmptyState v-else-if="filtered.length === 0" message="No evals match these filters." />
      <template v-else>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Eval</th>
                <th>Configurations</th>
                <th>Test cases</th>
                <th>Status</th>
                <th>Avg score</th>
                <th>Pass rate</th>
                <th>Est. cost</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pageItems" :key="item.id">
                <td>
                  <RouterLink class="name-link" :to="`/experiments/${item.id}`">
                    {{ item.name }}
                  </RouterLink>
                  <p class="meta">{{ item.agentName }}</p>
                </td>
                <td>
                  Baseline {{ item.configurations[0]?.label ?? '—' }}
                  <p class="meta">
                    {{ Math.max(item.configurationCount - 1, 0) }}
                    {{ item.configurationCount - 1 === 1 ? 'candidate' : 'candidates' }}
                  </p>
                </td>
                <td>{{ item.uniqueTaskCount }}</td>
                <td>
                  <StatusBadge
                    :label="EVAL_STATUS_LABELS[item.status] ?? item.status"
                    :tone="EVAL_STATUS_TONES[item.status] ?? 'neutral'"
                  />
                  <p
                    v-if="item.status !== 'DRAFT' && !hasResults(item) && item.status !== 'RUNNING'"
                    class="meta"
                  >
                    Not evaluated
                  </p>
                  <p v-if="item.status === 'RUNNING'" class="meta">
                    {{ metrics.get(item.id)?.execution?.completed ?? 0 }} of
                    {{ item.plannedExecutionCount }} runs
                  </p>
                </td>
                <td>
                  {{
                    hasResults(item)
                      ? formatScore(metrics.get(item.id)?.summary?.averageScore)
                      : '—'
                  }}
                </td>
                <td>
                  {{ hasResults(item) ? formatRate(metrics.get(item.id)?.summary?.passRate) : '—' }}
                </td>
                <td>
                  {{ costLabel(item) }}
                  <p v-if="costNote(item)" class="meta">{{ costNote(item) }}</p>
                </td>
                <td>
                  {{ lastExecuted(item) ? formatTimestamp(lastExecuted(item) ?? '') : 'Not run' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ListPagination
          :page="page"
          :page-size="PAGE_SIZE"
          :total="filtered.length"
          @update:page="page = $event"
        />
      </template>
    </section>
  </section>
</template>
