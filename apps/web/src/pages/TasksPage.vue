<script setup lang="ts">
import type { TaskResponse } from '../types';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { loadSuiteDirectory, type SuiteDirectory } from '../api/task-suites';
import { listAllTasks } from '../api/tasks';
import EmptyState from '../components/ui/EmptyState.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import ListPagination from '../components/ui/ListPagination.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SearchInput from '../components/ui/SearchInput.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';
import { formatTimestamp } from '../utils/format';

const PAGE_SIZE = 8;
const UNASSIGNED = 'unassigned';
const ALL = 'all';

const tasks = ref<TaskResponse[]>([]);
const directory = ref<SuiteDirectory>({ agents: [], suites: [] });
const loading = ref(true);
const error = ref<string | null>(null);
const query = ref('');
const agentFilter = ref(ALL);
const suiteFilter = ref(ALL);
const tagFilter = ref(ALL);
const schemaFilter = ref<'all' | 'with' | 'without'>('all');
const page = ref(1);
let loadGeneration = 0;

const suitesById = computed(
  () => new Map(directory.value.suites.map((suite) => [suite.suiteId, suite])),
);

const suiteOptions = computed(() =>
  agentFilter.value === ALL || agentFilter.value === UNASSIGNED
    ? directory.value.suites
    : directory.value.suites.filter((suite) => suite.agentId === agentFilter.value),
);

const tagOptions = computed(() =>
  [...new Set(tasks.value.flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b)),
);

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return tasks.value.filter((task) => {
    const suite = task.taskSuiteId ? suitesById.value.get(task.taskSuiteId) : undefined;
    if (agentFilter.value === UNASSIGNED && task.taskSuiteId !== null) {
      return false;
    }
    if (
      agentFilter.value !== ALL &&
      agentFilter.value !== UNASSIGNED &&
      suite?.agentId !== agentFilter.value
    ) {
      return false;
    }
    if (suiteFilter.value === UNASSIGNED && task.taskSuiteId !== null) {
      return false;
    }
    if (
      suiteFilter.value !== ALL &&
      suiteFilter.value !== UNASSIGNED &&
      task.taskSuiteId !== suiteFilter.value
    ) {
      return false;
    }
    if (tagFilter.value !== ALL && !task.tags.includes(tagFilter.value)) {
      return false;
    }
    if (schemaFilter.value === 'with' && task.outputSchema === null) {
      return false;
    }
    if (schemaFilter.value === 'without' && task.outputSchema !== null) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    const description = task.description ?? '';
    return task.name.toLowerCase().includes(needle) || description.toLowerCase().includes(needle);
  });
});

const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

const hasActiveFilters = computed(
  () =>
    query.value.trim().length > 0 ||
    agentFilter.value !== ALL ||
    suiteFilter.value !== ALL ||
    tagFilter.value !== ALL ||
    schemaFilter.value !== 'all',
);

watch(agentFilter, (agentId) => {
  if (agentId === UNASSIGNED) {
    suiteFilter.value = ALL;
    return;
  }
  if (
    suiteFilter.value !== ALL &&
    suiteFilter.value !== UNASSIGNED &&
    !suiteOptions.value.some((suite) => suite.suiteId === suiteFilter.value)
  ) {
    suiteFilter.value = ALL;
  }
});

watch([query, agentFilter, suiteFilter, tagFilter, schemaFilter], () => {
  page.value = 1;
});

watch(filtered, (items) => {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (page.value > pages) {
    page.value = pages;
  }
});

onMounted(() => {
  void loadTasks();
});

async function loadTasks(): Promise<void> {
  const generation = loadGeneration + 1;
  loadGeneration = generation;
  loading.value = true;
  error.value = null;
  try {
    const [taskItems, suiteDirectory] = await Promise.all([listAllTasks(), loadSuiteDirectory()]);
    if (generation !== loadGeneration) {
      return;
    }
    tasks.value = taskItems;
    directory.value = suiteDirectory;
    if (tagFilter.value !== ALL && !tagOptions.value.includes(tagFilter.value)) {
      tagFilter.value = ALL;
    }
  } catch (caught) {
    if (generation !== loadGeneration) {
      return;
    }
    tasks.value = [];
    error.value = errorMessage(caught, 'Unable to load tasks.');
  } finally {
    if (generation === loadGeneration) {
      loading.value = false;
    }
  }
}

function clearFilters(): void {
  query.value = '';
  agentFilter.value = ALL;
  suiteFilter.value = ALL;
  tagFilter.value = ALL;
  schemaFilter.value = 'all';
}
</script>

<template>
  <section class="stack">
    <PageHeader
      title="Tasks"
      description="Manage reusable evaluation tasks and their expected outcomes and scoring criteria."
    >
      <template #actions>
        <button class="button secondary" type="button" @click="loadTasks">Refresh</button>
        <RouterLink class="button" to="/tasks/new">Create task</RouterLink>
      </template>
    </PageHeader>
    <section class="panel">
      <div class="toolbar filter-grid">
        <SearchInput v-model="query" label="Search" placeholder="Name or description" />
        <label class="filter-field">
          <span>Agent</span>
          <select v-model="agentFilter">
            <option :value="ALL">All agents</option>
            <option :value="UNASSIGNED">Unassigned</option>
            <option v-for="agent in directory.agents" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </option>
          </select>
        </label>
        <label class="filter-field">
          <span>Task suite</span>
          <select v-model="suiteFilter" :disabled="agentFilter === UNASSIGNED">
            <option :value="ALL">All suites</option>
            <option :value="UNASSIGNED">Unassigned</option>
            <option v-for="suite in suiteOptions" :key="suite.suiteId" :value="suite.suiteId">
              {{ suite.suiteName }}
            </option>
          </select>
        </label>
        <label class="filter-field">
          <span>Tag</span>
          <select v-model="tagFilter">
            <option :value="ALL">All tags</option>
            <option v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</option>
          </select>
        </label>
        <label class="filter-field">
          <span>Response schema</span>
          <select v-model="schemaFilter">
            <option value="all">All</option>
            <option value="with">Has schema</option>
            <option value="without">No schema</option>
          </select>
        </label>
      </div>
      <LoadingState v-if="loading" message="Loading tasks…" />
      <ErrorState v-else-if="error" :message="error" @retry="loadTasks" />
      <EmptyState v-else-if="tasks.length === 0" message="No tasks yet.">
        <RouterLink class="button" to="/tasks/new">Create task</RouterLink>
      </EmptyState>
      <EmptyState v-else-if="filtered.length === 0" message="No tasks match these filters.">
        <button
          v-if="hasActiveFilters"
          class="button secondary"
          type="button"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </EmptyState>
      <template v-else>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Agent</th>
                <th>Task suite</th>
                <th>Version</th>
                <th>Response schema</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in pageItems" :key="task.id">
                <td>
                  <RouterLink class="name-link" :to="`/tasks/${task.id}`">
                    {{ task.name }}
                  </RouterLink>
                  <p v-if="task.description" class="meta">{{ task.description }}</p>
                </td>
                <template v-if="task.taskSuiteId && suitesById.get(task.taskSuiteId)">
                  <td>
                    <RouterLink
                      class="name-link"
                      :to="`/agents/${suitesById.get(task.taskSuiteId)?.agentId}`"
                    >
                      {{ suitesById.get(task.taskSuiteId)?.agentName }}
                    </RouterLink>
                  </td>
                  <td>
                    <RouterLink
                      class="name-link"
                      :to="{
                        path: `/agents/${suitesById.get(task.taskSuiteId)?.agentId}`,
                        query: { tab: 'suites', suite: task.taskSuiteId },
                      }"
                    >
                      {{ suitesById.get(task.taskSuiteId)?.suiteName }}
                    </RouterLink>
                  </td>
                </template>
                <template v-else>
                  <td class="muted">Unassigned</td>
                  <td><StatusBadge label="Unassigned" tone="neutral" /></td>
                </template>
                <td>v{{ task.version }}</td>
                <td>
                  <StatusBadge v-if="task.outputSchema !== null" label="Schema" tone="info" />
                  <span v-else class="muted">None</span>
                </td>
                <td>{{ formatTimestamp(task.updatedAt) }}</td>
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
