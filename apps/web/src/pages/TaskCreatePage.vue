<script setup lang="ts">
import type { TaskCreateRequest } from '../types';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { addTaskToSuite, loadSuiteDirectory, type SuiteDirectory } from '../api/task-suites';
import { createTask } from '../api/tasks';
import TaskForm from '../components/tasks/TaskForm.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useToast } from '../components/ui/toast';
import { errorMessage } from '../utils/api-error';
import { useUnsavedChangesGuard } from '../utils/unsaved-changes';

const router = useRouter();
const toast = useToast();
const directory = ref<SuiteDirectory>({ agents: [], suites: [] });
const directoryLoading = ref(true);
const directoryError = ref<string | null>(null);
const agentId = ref('');
const suiteId = ref('');
const saving = ref(false);
const saveError = ref<string | null>(null);
const formDirty = ref(false);
const finished = ref(false);

const agentSuites = computed(() =>
  directory.value.suites.filter((suite) => suite.agentId === agentId.value),
);

const unsaved = useUnsavedChangesGuard(
  () => !finished.value && (formDirty.value || agentId.value !== ''),
);

watch(agentId, () => {
  suiteId.value = agentSuites.value.length === 1 ? (agentSuites.value[0]?.suiteId ?? '') : '';
});

onMounted(() => {
  void loadDirectory();
});

async function loadDirectory(): Promise<void> {
  directoryLoading.value = true;
  directoryError.value = null;
  try {
    directory.value = await loadSuiteDirectory();
  } catch (caught) {
    directoryError.value = errorMessage(caught, 'Unable to load agents and task suites.');
  } finally {
    directoryLoading.value = false;
  }
}

async function create(payload: TaskCreateRequest): Promise<void> {
  saveError.value = null;
  const suite = agentSuites.value.find((entry) => entry.suiteId === suiteId.value);
  if (agentId.value !== '' && !suite) {
    saveError.value = 'Select a task suite for this agent, or choose no agent.';
    return;
  }
  saving.value = true;
  try {
    const response = await createTask(payload);
    finished.value = true;
    if (suite) {
      try {
        await addTaskToSuite(suite.agentId, suite.suiteId, response.data.id);
        toast.success(`Task created and added to ${suite.suiteName}.`);
      } catch (caught) {
        toast.error(
          `Task created, but it could not be added to ${suite.suiteName}: ${errorMessage(
            caught,
            'Unable to update the task suite.',
          )}`,
        );
      }
    } else {
      toast.success('Task created.');
    }
    await router.push(`/tasks/${response.data.id}`);
  } catch (caught) {
    finished.value = false;
    saveError.value = errorMessage(caught, 'Unable to create the task.');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  void router.push('/tasks');
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/tasks">Back to tasks</RouterLink></p>
    <PageHeader
      title="Create task"
      description="Define the input, expected outcome, scoring criteria, and optional response schema."
    />
    <section class="panel">
      <TaskForm
        :task="null"
        :saving="saving"
        :error="saveError"
        title="Task definition"
        submit-label="Create task"
        @submit="create"
        @cancel="cancel"
        @dirty="formDirty = $event"
      >
        <template #extra>
          <fieldset class="form-grid">
            <legend>Task suite (optional)</legend>
            <p v-if="directoryLoading" class="muted">Loading agents and task suites…</p>
            <p v-else-if="directoryError" class="banner error">
              {{ directoryError }}
              <button class="button secondary" type="button" @click="loadDirectory">Retry</button>
            </p>
            <template v-else>
              <label>
                <span>Agent</span>
                <select v-model="agentId">
                  <option value="">No agent (leave unassigned)</option>
                  <option v-for="agent in directory.agents" :key="agent.id" :value="agent.id">
                    {{ agent.name }}
                  </option>
                </select>
              </label>
              <template v-if="agentId">
                <label v-if="agentSuites.length > 0">
                  <span>Task suite</span>
                  <select v-model="suiteId" required>
                    <option value="" disabled>Select a task suite</option>
                    <option
                      v-for="suite in agentSuites"
                      :key="suite.suiteId"
                      :value="suite.suiteId"
                    >
                      {{ suite.suiteName }} ({{ suite.taskCount }}
                      {{ suite.taskCount === 1 ? 'task' : 'tasks' }})
                    </option>
                  </select>
                </label>
                <p v-else class="muted">
                  This agent has no task suites.
                  <RouterLink :to="{ path: `/agents/${agentId}`, query: { tab: 'suites' } }">
                    Create a suite for this agent
                  </RouterLink>
                  or choose no agent.
                </p>
              </template>
              <p class="muted">
                Tasks link to an agent through a task suite. Unassigned tasks can be added to a
                suite later.
              </p>
            </template>
          </fieldset>
        </template>
      </TaskForm>
    </section>
    <ConfirmDialog
      :open="unsaved.confirming.value"
      title="Discard this task?"
      message="The new task has not been created yet."
      confirm-label="Discard task"
      tone="danger"
      @confirm="unsaved.leave"
      @cancel="unsaved.stay"
    />
  </section>
</template>
