<script setup lang="ts">
import type { TaskSuiteResponse } from '../../types';
import type { TaskSuiteDetailView } from '../../api/task-suites';

interface AssignableTask {
  id: string;
  name: string;
  taskSuiteId: string | null;
}
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { listAllTasks } from '../../api/tasks';
import {
  createTaskSuite,
  deleteTaskSuite,
  getTaskSuite,
  listAllTaskSuites,
  replaceSuiteTasks,
  updateTaskSuite,
} from '../../api/task-suites';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import EmptyState from '../ui/EmptyState.vue';
import ErrorState from '../ui/ErrorState.vue';
import LoadingState from '../ui/LoadingState.vue';
import { useToast } from '../ui/toast';
import { errorMessage } from '../../utils/api-error';

const props = defineProps<{
  agentId: string;
  initialSuiteId?: string | null;
}>();

const toast = useToast();
const suites = ref<TaskSuiteResponse[]>([]);
const tasks = ref<AssignableTask[]>([]);
const selected = ref<TaskSuiteDetailView | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const creating = ref(false);
const editing = ref(false);
const confirmingDelete = ref(false);
const name = ref('');
const description = ref('');
const editName = ref('');
const editDescription = ref('');
const saving = ref(false);

function availableTasks(): AssignableTask[] {
  return tasks.value.filter((task) => task.taskSuiteId === null);
}

watch(
  () => props.agentId,
  () => {
    selected.value = null;
    creating.value = false;
    editing.value = false;
    void load();
  },
);

onMounted(async () => {
  await load();
  const suiteId = props.initialSuiteId;
  if (suiteId && !selected.value && suites.value.some((suite) => suite.id === suiteId)) {
    await openSuite(suiteId);
  }
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [suiteItems, taskItems] = await Promise.all([
      listAllTaskSuites(props.agentId),
      listAllTasks(),
    ]);
    suites.value = suiteItems;
    tasks.value = taskItems.map((task) => ({
      id: task.id,
      name: task.name,
      taskSuiteId: task.taskSuiteId,
    }));
    if (selected.value) {
      selected.value = (await getTaskSuite(props.agentId, selected.value.id)).data;
      if (!editing.value) {
        editName.value = selected.value.name;
        editDescription.value = selected.value.description ?? '';
      }
    }
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load task suites.');
  } finally {
    loading.value = false;
  }
}

async function createSuite(): Promise<void> {
  saving.value = true;
  actionError.value = null;
  try {
    const response = await createTaskSuite(props.agentId, {
      name: name.value,
      description: description.value.trim() ? description.value.trim() : null,
    });
    name.value = '';
    description.value = '';
    creating.value = false;
    editing.value = false;
    toast.success('Task suite created.');
    await openSuite(response.data.id);
    await load();
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to create the task suite.');
    toast.error(actionError.value);
  } finally {
    saving.value = false;
  }
}

function cancelCreate(): void {
  name.value = '';
  description.value = '';
  creating.value = false;
}

async function openSuite(suiteId: string): Promise<void> {
  actionError.value = null;
  try {
    const response = await getTaskSuite(props.agentId, suiteId);
    selected.value = response.data;
    editName.value = response.data.name;
    editDescription.value = response.data.description ?? '';
    editing.value = false;
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to open the task suite.');
    toast.error(actionError.value);
  }
}

function startEdit(): void {
  if (!selected.value) {
    return;
  }
  editName.value = selected.value.name;
  editDescription.value = selected.value.description ?? '';
  actionError.value = null;
  editing.value = true;
}

function cancelEdit(): void {
  if (!selected.value) {
    return;
  }
  editName.value = selected.value.name;
  editDescription.value = selected.value.description ?? '';
  actionError.value = null;
  editing.value = false;
}

async function saveSuite(): Promise<void> {
  if (!selected.value) {
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    const response = await updateTaskSuite(props.agentId, selected.value.id, {
      name: editName.value,
      description: editDescription.value.trim() ? editDescription.value.trim() : null,
    });
    selected.value = response.data;
    editing.value = false;
    toast.success('Task suite saved.');
    await load();
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to update the task suite.');
    toast.error(actionError.value);
  } finally {
    saving.value = false;
  }
}

async function removeSuite(): Promise<void> {
  if (!selected.value) {
    return;
  }
  confirmingDelete.value = false;
  saving.value = true;
  actionError.value = null;
  try {
    await deleteTaskSuite(props.agentId, selected.value.id);
    selected.value = null;
    editing.value = false;
    toast.success('Task suite deleted.');
    await load();
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to delete the task suite.');
    toast.error(actionError.value);
  } finally {
    saving.value = false;
  }
}

async function setMembership(taskIds: string[]): Promise<void> {
  if (!selected.value) {
    return;
  }
  saving.value = true;
  actionError.value = null;
  try {
    const response = await replaceSuiteTasks(props.agentId, selected.value.id, { taskIds });
    selected.value = response.data;
    tasks.value = (await listAllTasks()).map((task) => ({
      id: task.id,
      name: task.name,
      taskSuiteId: task.taskSuiteId,
    }));
    toast.success('Suite tasks updated.');
    await load();
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to update the tasks in this suite.');
    toast.error(actionError.value);
  } finally {
    saving.value = false;
  }
}

function removeTask(taskId: string): void {
  if (!selected.value) {
    return;
  }
  void setMembership(
    selected.value.tasks.filter((task) => task.id !== taskId).map((task) => task.id),
  );
}

function addTask(taskId: string): void {
  if (!selected.value || selected.value.tasks.some((task) => task.id === taskId)) {
    return;
  }
  void setMembership([...selected.value.tasks.map((task) => task.id), taskId]);
}
</script>

<template>
  <div class="stack">
    <div class="panel-header">
      <div>
        <h3>Task suites</h3>
        <p class="muted">Suites group existing tasks for this agent.</p>
      </div>
      <button v-if="!selected" class="button" type="button" @click="creating = true">
        Create suite
      </button>
    </div>
    <p v-if="actionError" class="banner error">{{ actionError }}</p>
    <LoadingState
      v-if="loading && suites.length === 0 && !selected"
      message="Loading task suites…"
    />
    <ErrorState v-else-if="error && !selected" :message="error" @retry="load" />
    <template v-else-if="!selected">
      <form v-if="creating" class="form-grid" @submit.prevent="createSuite">
        <label>
          <span>Suite name</span>
          <input v-model="name" required maxlength="200" />
        </label>
        <label>
          <span>Description</span>
          <input v-model="description" maxlength="5000" />
        </label>
        <div class="button-row">
          <button class="button" type="submit" :disabled="saving || !name.trim()">
            {{ saving ? 'Creating…' : 'Create suite' }}
          </button>
          <button class="button secondary" type="button" :disabled="saving" @click="cancelCreate">
            Cancel
          </button>
        </div>
      </form>
      <EmptyState
        v-if="!loading && suites.length === 0 && !creating"
        message="This agent has no task suites yet."
      >
        <button class="button" type="button" @click="creating = true">Create suite</button>
      </EmptyState>
      <ul v-else class="record-list">
        <li v-for="suite in suites" :key="suite.id" class="record">
          <button class="name-link" type="button" @click="openSuite(suite.id)">
            {{ suite.name }}
          </button>
          <p>{{ suite.description || 'No description' }}</p>
          <p class="meta">{{ suite.taskCount }} {{ suite.taskCount === 1 ? 'task' : 'tasks' }}</p>
        </li>
      </ul>
    </template>
    <section v-else class="stack">
      <div class="button-row">
        <button class="button secondary" type="button" @click="selected = null">
          Back to suites
        </button>
        <button v-if="!editing" class="button" type="button" @click="startEdit">Edit suite</button>
      </div>
      <template v-if="!editing">
        <dl class="facts">
          <dt>Name</dt>
          <dd>{{ selected.name }}</dd>
          <dt>Description</dt>
          <dd>{{ selected.description || 'No description' }}</dd>
          <dt>Tasks</dt>
          <dd>{{ selected.tasks.length }}</dd>
        </dl>
        <h4>Tasks in this suite</h4>
        <p v-if="selected.tasks.length === 0" class="muted">No tasks assigned.</p>
        <ul v-else class="record-list">
          <li v-for="task in selected.tasks" :key="task.id" class="record">
            <RouterLink class="name-link" :to="`/tasks/${task.id}`">{{ task.name }}</RouterLink>
            <p class="meta">Version {{ task.version }}</p>
          </li>
        </ul>
      </template>
      <template v-else>
        <form class="form-grid" @submit.prevent="saveSuite">
          <label>
            <span>Suite name</span>
            <input v-model="editName" required maxlength="200" />
          </label>
          <label>
            <span>Description</span>
            <input v-model="editDescription" maxlength="5000" />
          </label>
          <div class="button-row">
            <button class="button" type="submit" :disabled="saving">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button class="button secondary" type="button" :disabled="saving" @click="cancelEdit">
              Cancel
            </button>
            <button
              class="button danger"
              type="button"
              :disabled="saving"
              @click="confirmingDelete = true"
            >
              Delete suite
            </button>
          </div>
        </form>
        <p class="muted">Deleting a suite leaves its tasks available on their own.</p>
        <h4>Tasks in this suite</h4>
        <p v-if="selected.tasks.length === 0" class="muted">No tasks assigned.</p>
        <ul v-else class="record-list">
          <li v-for="task in selected.tasks" :key="task.id" class="record">
            <div class="panel-header">
              <div>
                <h3>{{ task.name }}</h3>
                <p class="meta">Version {{ task.version }}</p>
              </div>
              <button
                class="button secondary"
                type="button"
                :disabled="saving"
                @click="removeTask(task.id)"
              >
                Remove
              </button>
            </div>
          </li>
        </ul>
        <h4>Add an existing task</h4>
        <p v-if="availableTasks().length === 0" class="muted">No unassigned tasks are available.</p>
        <ul v-else class="record-list">
          <li v-for="task in availableTasks()" :key="task.id" class="record">
            <div class="panel-header">
              <h3>{{ task.name }}</h3>
              <button
                class="button secondary"
                type="button"
                :disabled="saving"
                @click="addTask(task.id)"
              >
                Add
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>
    <ConfirmDialog
      :open="confirmingDelete"
      title="Delete task suite"
      message="Deleting a suite leaves its tasks available on their own."
      confirm-label="Delete suite"
      tone="danger"
      @confirm="removeSuite"
      @cancel="confirmingDelete = false"
    />
  </div>
</template>
