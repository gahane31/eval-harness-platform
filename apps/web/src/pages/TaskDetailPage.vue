<script setup lang="ts">
import type { TaskCreateRequest, TaskResponse } from '../types';
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { loadSuiteDirectory, type SuiteDirectoryEntry } from '../api/task-suites';
import { getTask, updateTask } from '../api/tasks';
import TaskForm from '../components/tasks/TaskForm.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { useToast } from '../components/ui/toast';
import { errorMessage } from '../utils/api-error';
import { formatJson, formatTimestamp } from '../utils/format';
import { useUnsavedChangesGuard } from '../utils/unsaved-changes';

const route = useRoute();
const toast = useToast();
const task = ref<TaskResponse | null>(null);
const suite = ref<SuiteDirectoryEntry | null>(null);
const suiteError = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const editing = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);
const formDirty = ref(false);

const unsaved = useUnsavedChangesGuard(() => editing.value && formDirty.value);

watch(
  () => route.params.taskId,
  () => {
    closeEditor();
    void load();
  },
);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  const taskId = route.params.taskId;
  if (typeof taskId !== 'string') {
    error.value = 'Task not found.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const response = await getTask(taskId);
    task.value = response.data;
    await loadAssociation(response.data.taskSuiteId);
  } catch (caught) {
    task.value = null;
    error.value = errorMessage(caught, 'Unable to load the task.');
  } finally {
    loading.value = false;
  }
}

async function loadAssociation(taskSuiteId: string | null): Promise<void> {
  suite.value = null;
  suiteError.value = null;
  if (taskSuiteId === null) {
    return;
  }
  try {
    const directory = await loadSuiteDirectory();
    suite.value = directory.suites.find((entry) => entry.suiteId === taskSuiteId) ?? null;
    if (!suite.value) {
      suiteError.value = 'The assigned task suite could not be found.';
    }
  } catch (caught) {
    suiteError.value = errorMessage(caught, 'Unable to load the task suite.');
  }
}

function startEdit(): void {
  saveError.value = null;
  formDirty.value = false;
  editing.value = true;
}

function closeEditor(): void {
  editing.value = false;
  formDirty.value = false;
  saveError.value = null;
}

async function save(payload: TaskCreateRequest): Promise<void> {
  if (!task.value) {
    return;
  }
  const previousVersion = task.value.version;
  saving.value = true;
  saveError.value = null;
  try {
    const response = await updateTask(task.value.id, payload);
    task.value = response.data;
    closeEditor();
    toast.success(
      response.data.version === previousVersion
        ? 'Task saved.'
        : `Task saved as version ${response.data.version}.`,
    );
  } catch (caught) {
    saveError.value = errorMessage(caught, 'Unable to save the task.');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/tasks">Back to tasks</RouterLink></p>
    <LoadingState v-if="loading" message="Loading task…" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <template v-else-if="task">
      <PageHeader :title="task.name" :description="task.description || 'No description'">
        <template #actions>
          <StatusBadge :label="`Version ${task.version}`" tone="info" />
          <button v-if="!editing" class="button" type="button" @click="startEdit">Edit task</button>
        </template>
      </PageHeader>
      <section class="panel">
        <h3>Basic information</h3>
        <dl class="facts">
          <dt>Name</dt>
          <dd>{{ task.name }}</dd>
          <dt>Description</dt>
          <dd>{{ task.description || 'No description' }}</dd>
          <dt>Agent</dt>
          <dd>
            <RouterLink v-if="suite" class="name-link" :to="`/agents/${suite.agentId}`">
              {{ suite.agentName }}
            </RouterLink>
            <span v-else-if="task.taskSuiteId" class="muted">{{ suiteError }}</span>
            <span v-else class="muted">Unassigned</span>
          </dd>
          <dt>Task suite</dt>
          <dd>
            <RouterLink
              v-if="suite"
              class="name-link"
              :to="{
                path: `/agents/${suite.agentId}`,
                query: { tab: 'suites', suite: suite.suiteId },
              }"
            >
              {{ suite.suiteName }}
            </RouterLink>
            <span v-else-if="task.taskSuiteId" class="muted">{{ suiteError }}</span>
            <StatusBadge v-else label="Unassigned" tone="neutral" />
          </dd>
          <dt>Version</dt>
          <dd>{{ task.version }}</dd>
          <dt>Tags</dt>
          <dd>
            <span v-if="task.tags.length > 0" class="tags">
              <span v-for="tag in task.tags" :key="tag" class="tag">{{ tag }}</span>
            </span>
            <span v-else class="muted">No tags</span>
          </dd>
          <dt>Created</dt>
          <dd>{{ formatTimestamp(task.createdAt) }}</dd>
          <dt>Updated</dt>
          <dd>{{ formatTimestamp(task.updatedAt) }}</dd>
        </dl>
        <p v-if="!task.taskSuiteId" class="muted">
          Add this task to a suite from an agent's Task suites tab.
        </p>
      </section>
      <section v-if="editing" class="panel">
        <p class="muted">
          Changing the input, expected outcome, scoring criteria, or response schema creates a new
          task version. Evals keep the task snapshot they captured.
        </p>
        <TaskForm
          :task="task"
          :saving="saving"
          :error="saveError"
          @submit="save"
          @cancel="closeEditor"
          @dirty="formDirty = $event"
        />
      </section>
      <section v-else class="panel stack">
        <h3>Definition</h3>
        <div>
          <h4>Input</h4>
          <pre class="output">{{ task.input }}</pre>
        </div>
        <div>
          <h4>Expected outcome</h4>
          <pre class="output">{{ formatJson(task.expectedOutcome) }}</pre>
        </div>
        <div>
          <h4>Scoring criteria</h4>
          <p v-if="task.scoringCriteria.length === 0" class="muted">No scoring criteria.</p>
          <div v-else class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Weight</th>
                  <th>Required</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="criterion in task.scoringCriteria" :key="criterion.id">
                  <td>{{ criterion.id }}</td>
                  <td>{{ criterion.type }}</td>
                  <td>{{ criterion.weight }}</td>
                  <td>{{ criterion.required ? 'Yes' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <details class="disclosure">
            <summary>Scoring criteria JSON</summary>
            <pre class="output">{{ formatJson(task.scoringCriteria) }}</pre>
          </details>
        </div>
        <div>
          <h4>Response schema</h4>
          <pre v-if="task.outputSchema !== null" class="output">{{
            formatJson(task.outputSchema)
          }}</pre>
          <p v-else class="muted">No response schema. Structured output is not required.</p>
        </div>
      </section>
    </template>
    <ConfirmDialog
      :open="unsaved.confirming.value"
      title="Discard unsaved changes?"
      message="Your edits to this task have not been saved."
      confirm-label="Discard changes"
      tone="danger"
      @confirm="unsaved.leave"
      @cancel="unsaved.stay"
    />
  </section>
</template>
