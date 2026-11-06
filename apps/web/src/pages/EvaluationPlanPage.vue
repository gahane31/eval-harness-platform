<script setup lang="ts">
import type { SuiteDirectory } from '../api/task-suites';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { listAgentVersions } from '../api/agents';
import {
  createEvaluationPlan,
  getEvaluationPlan,
  updateEvaluationPlan,
} from '../api/evaluation-plans';
import { loadSuiteDirectory } from '../api/task-suites';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useToast } from '../components/ui/toast';
import { useUnsavedChangesGuard } from '../utils/unsaved-changes';
import { errorMessage } from '../utils/api-error';

interface DraftEntry {
  key: string;
  agentId: string;
  taskSuiteId: string;
  versionPolicy: 'LATEST_PUBLISHED' | 'PINNED';
  pinnedVersionId: string;
  enabled: boolean;
  threshold: string | number;
}

interface PublishedVersion {
  id: string;
  version: number;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const directory = ref<SuiteDirectory | null>(null);
const versions = ref<Record<string, PublishedVersion[]>>({});
const name = ref('');
const description = ref('');
const enabled = ref(true);
const entries = ref<DraftEntry[]>([blankEntry()]);
const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
let savedSnapshot = '';

const isNew = computed(() => route.name === 'plan-create');
const planId = computed(() =>
  typeof route.params.planId === 'string' ? route.params.planId : null,
);
const snapshot = computed(() =>
  JSON.stringify({
    name: name.value,
    description: description.value,
    enabled: enabled.value,
    entries: entries.value,
  }),
);
const unsaved = useUnsavedChangesGuard(() => snapshot.value !== savedSnapshot);

watch(
  () => route.fullPath,
  () => {
    void load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  formError.value = null;
  try {
    directory.value = await loadSuiteDirectory();
    if (isNew.value) {
      name.value = '';
      description.value = '';
      enabled.value = true;
      entries.value = [blankEntry()];
    } else if (planId.value) {
      const plan = (await getEvaluationPlan(planId.value)).data;
      name.value = plan.name;
      description.value = plan.description ?? '';
      enabled.value = plan.enabled;
      entries.value =
        plan.entries.length === 0
          ? [blankEntry()]
          : plan.entries.map((entry) => ({
              key: entry.id,
              agentId: entry.agentId,
              taskSuiteId: entry.taskSuiteId,
              versionPolicy: entry.versionPolicy,
              pinnedVersionId: entry.pinnedVersionId ?? '',
              enabled: entry.enabled,
              threshold:
                entry.passRateThreshold === null
                  ? ''
                  : String(Number((entry.passRateThreshold * 100).toFixed(2))),
            }));
      await Promise.all(entries.value.map((entry) => ensureVersions(entry.agentId)));
    }
    savedSnapshot = snapshot.value;
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load the evaluation plan.');
  } finally {
    loading.value = false;
  }
}

async function ensureVersions(agentId: string): Promise<void> {
  if (!agentId || versions.value[agentId]) {
    return;
  }
  const response = await listAgentVersions(agentId, 1, 100);
  versions.value = {
    ...versions.value,
    [agentId]: response.data.map((version) => ({ id: version.id, version: version.version })),
  };
}

function suitesFor(agentId: string) {
  return (directory.value?.suites ?? []).filter(
    (suite) => suite.agentId === agentId && suite.taskCount > 0,
  );
}

function onAgentChange(entry: DraftEntry): void {
  entry.taskSuiteId = '';
  entry.pinnedVersionId = '';
  void ensureVersions(entry.agentId).catch((caught: unknown) => {
    formError.value = errorMessage(caught, 'Unable to load published versions.');
  });
}

function addEntry(): void {
  entries.value = [...entries.value, blankEntry()];
}

function removeEntry(key: string): void {
  entries.value = entries.value.filter((entry) => entry.key !== key);
}

async function save(): Promise<void> {
  formError.value = null;
  const payloadEntries = [];
  const seen = new Set<string>();
  for (const entry of entries.value) {
    if (!entry.agentId && !entry.taskSuiteId && entries.value.length === 1 && !name.value.trim()) {
      continue;
    }
    if (!entry.agentId || !entry.taskSuiteId) {
      formError.value = 'Each entry needs an agent and a task suite.';
      return;
    }
    const key = `${entry.agentId}:${entry.taskSuiteId}`;
    if (seen.has(key)) {
      formError.value = 'Each agent and task suite can appear only once.';
      return;
    }
    seen.add(key);
    if (entry.versionPolicy === 'PINNED' && !entry.pinnedVersionId) {
      formError.value = 'Choose a published version to pin.';
      return;
    }
    let passRateThreshold: number | null = null;
    const thresholdText = String(entry.threshold ?? '').trim();
    if (thresholdText !== '') {
      const percent = Number(thresholdText);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        formError.value = 'Pass-rate threshold must be between 0 and 100.';
        return;
      }
      passRateThreshold = percent / 100;
    }
    payloadEntries.push({
      agentId: entry.agentId,
      taskSuiteId: entry.taskSuiteId,
      versionPolicy: entry.versionPolicy,
      pinnedVersionId: entry.versionPolicy === 'PINNED' ? entry.pinnedVersionId : null,
      enabled: entry.enabled,
      passRateThreshold,
    });
  }
  if (!name.value.trim()) {
    formError.value = 'Enter a plan name.';
    return;
  }
  const body = {
    name: name.value.trim(),
    description: description.value.trim() === '' ? null : description.value.trim(),
    enabled: enabled.value,
    entries: payloadEntries,
  };
  saving.value = true;
  try {
    if (isNew.value) {
      await createEvaluationPlan(body);
      savedSnapshot = snapshot.value;
      toast.success('Evaluation plan created.');
      await router.push('/');
      return;
    }
    if (!planId.value) {
      return;
    }
    await updateEvaluationPlan(planId.value, body);
    savedSnapshot = snapshot.value;
    toast.success('Evaluation plan saved.');
  } catch (caught) {
    formError.value = errorMessage(caught, 'Unable to save the evaluation plan.');
  } finally {
    saving.value = false;
  }
}

function blankEntry(): DraftEntry {
  return {
    key: crypto.randomUUID(),
    agentId: '',
    taskSuiteId: '',
    versionPolicy: 'LATEST_PUBLISHED',
    pinnedVersionId: '',
    enabled: true,
    threshold: '',
  };
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/">Back to dashboard</RouterLink></p>
    <PageHeader
      :title="isNew ? 'Create evaluation plan' : 'Edit evaluation plan'"
      description="Choose the agents, versions, and task suites that run together."
    />
    <LoadingState v-if="loading" message="Loading plan…" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <form v-else class="stack" @submit.prevent="save">
      <p v-if="formError" class="banner error">{{ formError }}</p>
      <div class="form-grid">
        <label>
          <span>Name</span>
          <input v-model="name" required maxlength="200" />
        </label>
        <label>
          <span>Description</span>
          <textarea v-model="description" maxlength="5000" />
        </label>
        <label class="choice">
          <input v-model="enabled" type="checkbox" />
          Plan enabled
        </label>
      </div>

      <section class="stack">
        <div class="section-header">
          <h3>Entries</h3>
          <button class="button secondary small" type="button" @click="addEntry">Add entry</button>
        </div>
        <p class="meta">
          Latest published is resolved when the batch runs. A pinned version stays on that published
          configuration.
        </p>
        <article v-for="(entry, index) in entries" :key="entry.key" class="panel stack">
          <div class="section-header">
            <h3>Entry {{ index + 1 }}</h3>
            <button class="button secondary small" type="button" @click="removeEntry(entry.key)">
              Remove
            </button>
          </div>
          <div class="plan-entry">
            <label>
              <span>Agent</span>
              <select v-model="entry.agentId" @change="onAgentChange(entry)">
                <option value="">Select an agent</option>
                <option v-for="agent in directory?.agents ?? []" :key="agent.id" :value="agent.id">
                  {{ agent.name }}
                </option>
              </select>
            </label>
            <label>
              <span>Task suite</span>
              <select v-model="entry.taskSuiteId" :disabled="!entry.agentId">
                <option value="">
                  {{
                    entry.agentId && suitesFor(entry.agentId).length === 0
                      ? 'No task suites'
                      : 'Select a task suite'
                  }}
                </option>
                <option
                  v-for="suite in suitesFor(entry.agentId)"
                  :key="suite.suiteId"
                  :value="suite.suiteId"
                >
                  {{ suite.suiteName }} ({{ suite.taskCount }} test cases)
                </option>
              </select>
            </label>
            <label>
              <span>Version</span>
              <select v-model="entry.versionPolicy">
                <option value="LATEST_PUBLISHED">Latest published</option>
                <option value="PINNED">Pinned version</option>
              </select>
            </label>
            <label v-if="entry.versionPolicy === 'PINNED'">
              <span>Published version</span>
              <select v-model="entry.pinnedVersionId" :disabled="!entry.agentId">
                <option value="">Select a version</option>
                <option
                  v-for="version in versions[entry.agentId] ?? []"
                  :key="version.id"
                  :value="version.id"
                >
                  Version {{ version.version }}
                </option>
              </select>
              <p v-if="entry.agentId && (versions[entry.agentId] ?? []).length === 0" class="meta">
                This agent has no published configuration.
              </p>
            </label>
            <label>
              <span>Minimum pass rate (%)</span>
              <input
                v-model="entry.threshold"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Optional"
              />
            </label>
            <label class="choice">
              <input v-model="entry.enabled" type="checkbox" />
              Entry enabled
            </label>
          </div>
        </article>
      </section>

      <div class="button-row">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : isNew ? 'Create plan' : 'Save plan' }}
        </button>
        <RouterLink class="button secondary" to="/">Cancel</RouterLink>
      </div>
    </form>

    <ConfirmDialog
      :open="unsaved.confirming.value"
      title="Discard unsaved changes?"
      message="This evaluation plan has changes that are not saved."
      confirm-label="Discard"
      tone="danger"
      @confirm="unsaved.leave"
      @cancel="unsaved.stay"
    />
  </section>
</template>
