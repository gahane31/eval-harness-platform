<script setup lang="ts">
import type { TaskSuiteDetailView } from '../../api/task-suites';
import type {
  AgentConfigurationVersion,
  AgentResponse,
  ExperimentResponse,
  TaskResponse,
} from '../../types';
import { computed, onMounted, ref, watch } from 'vue';
import { listAllAgents, listAgentVersions } from '../../api/agents';
import { getTaskSuite, listAllTaskSuites } from '../../api/task-suites';
import { listAllTasks } from '../../api/tasks';
import { errorMessage } from '../../utils/api-error';
import SearchInput from '../ui/SearchInput.vue';

interface VersionOption {
  id: string;
  version: number;
  label: string;
  detail: string;
}

const props = defineProps<{
  initial?: ExperimentResponse | null;
  saving: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  submit: [
    payload: {
      name: string;
      description: string | null;
      agentId: string;
      configurationIds: string[];
      taskSuiteIds: string[];
      taskIds: string[];
    },
  ];
  cancel: [];
  dirty: [dirty: boolean];
}>();

const initialConfigurations =
  props.initial?.configurations
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item) => item.agentConfigurationId) ?? [];

const agents = ref<AgentResponse[]>([]);
const versions = ref<VersionOption[]>([]);
const suites = ref<TaskSuiteDetailView[]>([]);
const tasks = ref<Array<{ id: string; name: string; description: string | null }>>([]);
const name = ref(props.initial?.name ?? '');
const description = ref(props.initial?.description ?? '');
const agentId = ref(props.initial?.agentId ?? '');
const baselineId = ref(initialConfigurations[0] ?? '');
const candidateIds = ref<string[]>(initialConfigurations.slice(1));
const taskSuiteIds = ref<string[]>(props.initial?.taskSuites.map((suite) => suite.id) ?? []);
const taskIds = ref<string[]>([]);
const expandedSuites = ref<string[]>([]);
const taskQuery = ref('');
const loading = ref(true);
const catalogueLoading = ref(false);
const catalogueError = ref<string | null>(null);
const formError = ref<string | null>(null);

const suiteByTaskId = computed(() => {
  const byTask = new Map<string, string>();
  for (const suite of suites.value) {
    if (taskSuiteIds.value.includes(suite.id)) {
      for (const task of suite.tasks) {
        if (!byTask.has(task.id)) {
          byTask.set(task.id, suite.name);
        }
      }
    }
  }
  return byTask;
});

const uniqueTaskCount = computed(() => {
  const ids = new Set<string>(suiteByTaskId.value.keys());
  for (const taskId of taskIds.value) {
    ids.add(taskId);
  }
  return ids.size;
});

const orderedConfigurationIds = computed(() => {
  if (!baselineId.value) {
    return [];
  }
  const candidates = versions.value
    .filter((version) => candidateIds.value.includes(version.id) && version.id !== baselineId.value)
    .map((version) => version.id);
  return [baselineId.value, ...candidates];
});

const plannedExecutionCount = computed(
  () => orderedConfigurationIds.value.length * uniqueTaskCount.value,
);

const baseline = computed(() => versions.value.find((version) => version.id === baselineId.value));
const candidates = computed(() =>
  orderedConfigurationIds.value
    .slice(1)
    .flatMap((id) => versions.value.filter((version) => version.id === id)),
);
const selectedSuites = computed(() =>
  suites.value.filter((suite) => taskSuiteIds.value.includes(suite.id)),
);
const individualCount = computed(
  () => taskIds.value.filter((taskId) => !suiteByTaskId.value.has(taskId)).length,
);
const visibleTasks = computed(() => {
  const needle = taskQuery.value.trim().toLowerCase();
  if (needle.length === 0) {
    return tasks.value;
  }
  return tasks.value.filter(
    (task) =>
      task.name.toLowerCase().includes(needle) ||
      (task.description ?? '').toLowerCase().includes(needle),
  );
});
const agentName = computed(
  () =>
    props.initial?.agentName ??
    agents.value.find((agent) => agent.id === agentId.value)?.name ??
    '',
);

const canSubmit = computed(
  () =>
    !props.saving &&
    name.value.trim().length > 0 &&
    agentId.value.length > 0 &&
    baselineId.value.length > 0 &&
    orderedConfigurationIds.value.length >= 1 &&
    uniqueTaskCount.value > 0,
);

const snapshot = computed(() =>
  JSON.stringify([
    name.value,
    description.value,
    agentId.value,
    orderedConfigurationIds.value,
    taskSuiteIds.value,
    taskIds.value.slice().sort(),
  ]),
);
let initialSnapshot = '';

watch(snapshot, (value) => {
  emit('dirty', initialSnapshot !== '' && value !== initialSnapshot);
});

watch(baselineId, (next) => {
  candidateIds.value = candidateIds.value.filter((id) => id !== next);
});

watch(agentId, (next, previous) => {
  if (previous && next !== previous) {
    baselineId.value = '';
    candidateIds.value = [];
    taskSuiteIds.value = [];
    taskIds.value = [];
    expandedSuites.value = [];
  }
  void loadCatalogue();
});

onMounted(() => {
  void loadAgents();
});

async function loadAgents(): Promise<void> {
  loading.value = true;
  catalogueError.value = null;
  try {
    if (!props.initial) {
      agents.value = await listAllAgents();
    }
    if (agentId.value) {
      await loadCatalogue();
    }
  } catch (caught) {
    catalogueError.value = errorMessage(caught, 'Unable to load agents.');
  } finally {
    loading.value = false;
    initialSnapshot = snapshot.value;
  }
}

function versionOption(version: AgentConfigurationVersion): VersionOption {
  const snapshotConfig = version.configSnapshot;
  return {
    id: version.id,
    version: version.version,
    label: `Version ${version.version}`,
    detail: `${snapshotConfig.provider} / ${snapshotConfig.model}${
      snapshotConfig.profileId ? ` · ${snapshotConfig.profileId}` : ''
    }`,
  };
}

async function loadCatalogue(): Promise<void> {
  if (!agentId.value) {
    return;
  }
  catalogueLoading.value = true;
  catalogueError.value = null;
  try {
    const [versionResponse, suiteSummaries, taskItems] = await Promise.all([
      listAgentVersions(agentId.value, 1, 100),
      listAllTaskSuites(agentId.value),
      listAllTasks(),
    ]);
    versions.value = versionResponse.data
      .map(versionOption)
      .sort((left, right) => right.version - left.version);
    tasks.value = taskItems.map((task: TaskResponse) => ({
      id: task.id,
      name: task.name,
      description: task.description,
    }));
    suites.value = await Promise.all(
      suiteSummaries.map(async (suite) => (await getTaskSuite(agentId.value, suite.id)).data),
    );
    if (!baselineId.value && versions.value.length === 1) {
      baselineId.value = versions.value[0]?.id ?? '';
    }
    if (props.initial && taskIds.value.length === 0) {
      const covered = suiteByTaskId.value;
      taskIds.value = props.initial.tasks
        .map((task) => task.taskId)
        .filter((taskId) => !covered.has(taskId));
    }
  } catch (caught) {
    versions.value = [];
    suites.value = [];
    tasks.value = [];
    catalogueError.value = errorMessage(caught, 'Unable to load configurations and test cases.');
  } finally {
    catalogueLoading.value = false;
  }
}

function toggle(list: string[], id: string, selected: boolean): string[] {
  return selected ? [...list, id] : list.filter((item) => item !== id);
}

function toggleExpanded(suiteId: string): void {
  expandedSuites.value = toggle(
    expandedSuites.value,
    suiteId,
    !expandedSuites.value.includes(suiteId),
  );
}

function submit(): void {
  formError.value = null;
  if (orderedConfigurationIds.value.length < 1) {
    formError.value = 'Select a baseline configuration.';
    return;
  }
  if (uniqueTaskCount.value === 0) {
    formError.value = 'Select a test suite or at least one test case.';
    return;
  }
  const covered = suiteByTaskId.value;
  emit('submit', {
    name: name.value.trim(),
    description: description.value.trim() ? description.value.trim() : null,
    agentId: agentId.value,
    configurationIds: orderedConfigurationIds.value,
    taskSuiteIds: taskSuiteIds.value,
    taskIds: taskIds.value.filter((taskId) => !covered.has(taskId)),
  });
}
</script>

<template>
  <form class="eval-form" @submit.prevent="submit">
    <div class="stack">
      <p v-if="catalogueError" class="banner error">{{ catalogueError }}</p>
      <section class="panel stack">
        <h3>1. Basic information</h3>
        <label>
          <span>Eval name</span>
          <input v-model="name" required maxlength="200" />
        </label>
        <label>
          <span>Description</span>
          <input v-model="description" maxlength="5000" />
        </label>
        <label v-if="!initial">
          <span>Agent</span>
          <select v-model="agentId" required :disabled="loading">
            <option value="" disabled>{{ loading ? 'Loading agents…' : 'Select an agent' }}</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </option>
          </select>
        </label>
        <p v-else class="meta">Agent: {{ initial.agentName }}</p>
      </section>

      <section class="panel stack">
        <h3>2. Configurations</h3>
        <p class="muted">
          Choose one published baseline to run. Add a candidate only when you want to compare
          another published configuration with that baseline.
        </p>
        <p v-if="!agentId" class="muted">Select an agent first.</p>
        <p v-else-if="catalogueLoading" class="muted">Loading published configurations…</p>
        <p v-else-if="versions.length === 0" class="muted">
          This agent has no published configurations.
        </p>
        <div v-if="agentId && versions.length > 0" class="choice-columns">
          <fieldset class="choice-group">
            <legend>Baseline</legend>
            <label v-for="version in versions" :key="version.id" class="choice">
              <input v-model="baselineId" type="radio" name="baseline" :value="version.id" />
              <span>
                {{ version.label }}
                <span class="meta">{{ version.detail }}</span>
              </span>
            </label>
          </fieldset>
          <fieldset class="choice-group">
            <legend>Candidates</legend>
            <p v-if="!baselineId" class="muted">Choose a baseline first.</p>
            <p
              v-else-if="versions.filter((item) => item.id !== baselineId).length === 0"
              class="muted"
            >
              No other published configuration. This eval runs the baseline only.
            </p>
            <template v-else>
              <label
                v-for="version in versions.filter((item) => item.id !== baselineId)"
                :key="version.id"
                class="choice"
              >
                <input
                  type="checkbox"
                  :checked="candidateIds.includes(version.id)"
                  @change="
                    candidateIds = toggle(
                      candidateIds,
                      version.id,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                />
                <span>
                  {{ version.label }}
                  <span class="meta">{{ version.detail }}</span>
                </span>
              </label>
            </template>
          </fieldset>
        </div>
      </section>

      <section class="panel stack">
        <h3>3. Test coverage</h3>
        <p v-if="!agentId" class="muted">Select an agent first.</p>
        <template v-else-if="!catalogueLoading">
          <h4>Test suites</h4>
          <p v-if="suites.length === 0" class="muted">This agent has no test suites.</p>
          <ul v-else class="suite-list">
            <li v-for="suite in suites" :key="suite.id">
              <div class="suite-row">
                <label class="choice">
                  <input
                    type="checkbox"
                    :checked="taskSuiteIds.includes(suite.id)"
                    @change="
                      taskSuiteIds = toggle(
                        taskSuiteIds,
                        suite.id,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  <span>
                    {{ suite.name }}
                    <span class="meta">
                      {{ suite.tasks.length }}
                      {{ suite.tasks.length === 1 ? 'test case' : 'test cases' }}
                    </span>
                  </span>
                </label>
                <button
                  class="button secondary small"
                  type="button"
                  :aria-expanded="expandedSuites.includes(suite.id)"
                  @click="toggleExpanded(suite.id)"
                >
                  {{ expandedSuites.includes(suite.id) ? 'Hide test cases' : 'Show test cases' }}
                </button>
              </div>
              <ul v-if="expandedSuites.includes(suite.id)" class="suite-tasks">
                <li v-for="task in suite.tasks" :key="task.id">
                  {{ task.name }} <span class="meta">v{{ task.version }}</span>
                </li>
                <li v-if="suite.tasks.length === 0" class="muted">This suite has no test cases.</li>
              </ul>
            </li>
          </ul>
          <h4>Individual test cases</h4>
          <SearchInput
            v-model="taskQuery"
            label="Search test cases"
            placeholder="Name or description"
          />
          <div class="choice-scroll">
            <p v-if="visibleTasks.length === 0" class="muted">No test cases match this search.</p>
            <label v-for="task in visibleTasks" :key="task.id" class="choice">
              <input
                type="checkbox"
                :checked="suiteByTaskId.has(task.id) || taskIds.includes(task.id)"
                :disabled="suiteByTaskId.has(task.id)"
                @change="
                  taskIds = toggle(taskIds, task.id, ($event.target as HTMLInputElement).checked)
                "
              />
              <span>
                {{ task.name }}
                <span v-if="suiteByTaskId.has(task.id)" class="meta">
                  Included through {{ suiteByTaskId.get(task.id) }}
                </span>
              </span>
            </label>
          </div>
        </template>
      </section>
    </div>

    <aside class="panel eval-summary" aria-label="Eval summary">
      <h3>4. Summary</h3>
      <dl class="summary-list">
        <dt>Agent</dt>
        <dd>{{ agentName || '—' }}</dd>
        <dt>Baseline</dt>
        <dd>{{ baseline ? baseline.label : '—' }}</dd>
        <dt>Candidates</dt>
        <dd>
          <template v-if="candidates.length === 0"
            >None. This eval runs the baseline only.</template
          >
          <template v-else>
            {{ candidates.length }}
            <span class="meta">{{ candidates.map((item) => item.label).join(', ') }}</span>
          </template>
        </dd>
        <dt>Test suites</dt>
        <dd>
          {{ selectedSuites.length }}
          <span v-if="selectedSuites.length > 0" class="meta">
            {{ selectedSuites.map((suite) => suite.name).join(', ') }}
          </span>
        </dd>
        <dt>Individual test cases</dt>
        <dd>{{ individualCount }}</dd>
        <dt>Unique test cases</dt>
        <dd>{{ uniqueTaskCount }}</dd>
        <dt>Planned executions</dt>
        <dd>
          <strong>{{ plannedExecutionCount }}</strong>
          <span class="meta">
            {{ orderedConfigurationIds.length }} configurations × {{ uniqueTaskCount }} test cases
          </span>
        </dd>
      </dl>
      <p class="muted">Creating saves a draft. Runs start only when you choose Start eval.</p>
      <p v-if="formError || error" class="banner error">{{ formError || error }}</p>
      <div class="button-row">
        <button class="button" type="submit" :disabled="!canSubmit">
          {{ saving ? 'Saving…' : initial ? 'Save draft' : 'Create eval' }}
        </button>
        <button class="button secondary" type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </aside>
  </form>
</template>
