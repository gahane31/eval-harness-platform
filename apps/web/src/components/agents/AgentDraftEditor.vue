<script setup lang="ts">
import type {
  AgentDraftConfig,
  AgentResponse,
  StoredAgentDraftConfig,
  ConfigurationValidation,
  RuntimeModel,
  RuntimeModelProvider,
  RuntimeProfile,
  RuntimeSkill,
  RuntimeToolset,
} from '../../types';
import { computed, onMounted, ref, watch } from 'vue';
import {
  getAgent,
  publishAgentVersion,
  saveAgentDraft,
  validateAgentDraft,
} from '../../api/agents';
import {
  listRuntimeModels,
  listRuntimeProfiles,
  listRuntimeSkills,
  listRuntimeToolsets,
} from '../../api/runtime';
import { errorMessage } from '../../utils/api-error';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import { useToast } from '../ui/toast';
import ProfileCapabilities from './ProfileCapabilities.vue';

const props = defineProps<{
  agent: AgentResponse;
}>();

const emit = defineEmits<{
  updated: [agent: AgentResponse];
  close: [];
}>();

const toast = useToast();
const confirmingClose = ref(false);

const draft = ref<StoredAgentDraftConfig>(cloneDraft(props.agent.draftConfig));
const profiles = ref<RuntimeProfile[]>([]);
const providers = ref<RuntimeModelProvider[]>([]);
const skills = ref<RuntimeSkill[]>([]);
const toolsets = ref<RuntimeToolset[]>([]);
const validation = ref<ConfigurationValidation | null>(null);
const loading = ref(true);
const catalogueError = ref<string | null>(null);
const skillDiscoveryFailed = ref(false);
const toolsetDiscoveryFailed = ref(false);
const modelDiscoveryFailed = ref(false);
const modelCatalogueReady = ref(false);
const actionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);
const saving = ref(false);
const validating = ref(false);
const publishing = ref(false);

const reportedProviders = computed(() => providers.value.map((item) => item.provider));
const providerChoices = computed(() =>
  draft.value.provider && !reportedProviders.value.includes(draft.value.provider)
    ? [draft.value.provider, ...reportedProviders.value]
    : reportedProviders.value,
);
const modelOptions = computed(
  () => providers.value.find((item) => item.provider === draft.value.provider)?.models ?? [],
);
const modelChoices = computed(() => {
  const reported = modelOptions.value.map((item) => ({ ...item, status: 'reported' as const }));
  if (!draft.value.model) {
    return reported;
  }
  if (!modelCatalogueReady.value || modelDiscoveryFailed.value) {
    return [
      {
        id: draft.value.model,
        name: draft.value.model,
        availability: 'unknown' as const,
        status: 'checking' as const,
        limitation: modelDiscoveryFailed.value
          ? 'Provider and model support could not be checked for this profile.'
          : 'Checking whether this profile configures the selected model.',
        reasoningOptions: undefined,
      },
    ];
  }
  if (!reported.some((item) => item.id === draft.value.model)) {
    return [
      {
        id: draft.value.model,
        name: draft.value.model,
        availability: 'unknown' as const,
        status: 'unconfigured' as const,
        limitation:
          'This model is not configured for the selected profile. Validation reports a blocking error.',
        reasoningOptions: undefined,
      },
      ...reported,
    ];
  }
  return reported;
});
const reasoningOptions = computed(
  () => modelChoices.value.find((item) => item.id === draft.value.model)?.reasoningOptions ?? [],
);
const profileChoices = computed(() => {
  const ids = profiles.value.map((item) => item.id);
  return draft.value.profileId && !ids.includes(draft.value.profileId)
    ? [draft.value.profileId, ...ids]
    : ids;
});
const dirty = computed(() => draftKey(draft.value) !== draftKey(props.agent.draftConfig));

watch(
  () => props.agent,
  (agent) => {
    draft.value = cloneDraft(agent.draftConfig);
  },
);

onMounted(() => {
  void loadProfiles();
});

async function loadProfiles(): Promise<void> {
  loading.value = true;
  catalogueError.value = null;
  try {
    const response = await listRuntimeProfiles();
    profiles.value = response.data.profiles;
    if (response.data.discoveryErrors.length > 0) {
      catalogueError.value = response.data.discoveryErrors.map((issue) => issue.message).join(' ');
    }
    if (draft.value.profileId) {
      await loadCatalogue(false);
    }
  } catch (caught) {
    catalogueError.value = errorMessage(caught, 'Unable to load Hermes profiles.');
  } finally {
    loading.value = false;
  }
}

async function loadCatalogue(refresh: boolean): Promise<void> {
  if (!draft.value.profileId) {
    return;
  }
  catalogueError.value = null;
  skillDiscoveryFailed.value = false;
  toolsetDiscoveryFailed.value = false;
  modelDiscoveryFailed.value = false;
  modelCatalogueReady.value = false;
  try {
    const [modelResponse, skillResponse, toolsetResponse] = await Promise.all([
      listRuntimeModels(draft.value.profileId, refresh),
      listRuntimeSkills(draft.value.profileId, refresh),
      listRuntimeToolsets(draft.value.profileId, refresh),
    ]);
    providers.value = modelResponse.data.providers;
    skills.value = skillResponse.data.skills;
    toolsets.value = toolsetResponse.data.toolsets;
    modelDiscoveryFailed.value = modelResponse.data.discoveryErrors.length > 0;
    modelCatalogueReady.value = true;
    skillDiscoveryFailed.value = skillResponse.data.discoveryErrors.length > 0;
    toolsetDiscoveryFailed.value = toolsetResponse.data.discoveryErrors.length > 0;
    const messages = [
      ...modelResponse.data.discoveryErrors,
      ...skillResponse.data.discoveryErrors,
      ...toolsetResponse.data.discoveryErrors,
    ].map((issue) => issue.message);
    catalogueError.value = messages.length > 0 ? messages.join(' ') : null;
  } catch (caught) {
    providers.value = [];
    skills.value = [];
    toolsets.value = [];
    modelDiscoveryFailed.value = true;
    skillDiscoveryFailed.value = true;
    toolsetDiscoveryFailed.value = true;
    catalogueError.value = errorMessage(
      caught,
      'Unable to discover capabilities for this profile.',
    );
  }
}

function selectProfile(event: Event): void {
  const profileId = (event.target as HTMLSelectElement).value;
  if (!profileId) {
    return;
  }
  draft.value = { ...draft.value, profileId };
  void loadCatalogue(false);
}

async function save(): Promise<void> {
  if (!draft.value.profileId) {
    return;
  }
  saving.value = true;
  actionError.value = null;
  actionMessage.value = null;
  const profileId = draft.value.profileId;
  const next: AgentDraftConfig = { ...cloneDraft(draft.value), profileId };
  try {
    const response = await saveAgentDraft(props.agent.id, next);
    draft.value = cloneDraft(response.data.draftConfig);
    actionMessage.value = 'Draft saved. This did not publish a version.';
    toast.success(actionMessage.value);
    emit('updated', response.data);
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to save the draft.');
    toast.error(actionError.value);
  } finally {
    saving.value = false;
  }
}

async function validate(): Promise<void> {
  if (dirty.value) {
    return;
  }
  validating.value = true;
  actionError.value = null;
  actionMessage.value = null;
  try {
    const response = await validateAgentDraft(props.agent.id);
    validation.value = response.data;
    actionMessage.value = response.data.valid
      ? 'Validation finished with no blocking errors.'
      : 'Validation found blocking errors. The draft was not changed.';
    if (response.data.valid) {
      toast.success(actionMessage.value);
    } else {
      toast.error(actionMessage.value);
    }
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to validate the draft.');
    toast.error(actionError.value);
  } finally {
    validating.value = false;
  }
}

async function publish(): Promise<void> {
  if (dirty.value) {
    return;
  }
  publishing.value = true;
  actionError.value = null;
  actionMessage.value = null;
  try {
    const response = await publishAgentVersion(props.agent.id);
    validation.value = {
      valid: true,
      errors: [],
      warnings: response.data.warnings,
    };
    actionMessage.value = response.data.reused
      ? `Reused version ${response.data.version}.`
      : `Published version ${response.data.version}.`;
    toast.success(actionMessage.value);
    const refreshed = await getAgent(props.agent.id);
    emit('updated', refreshed.data);
  } catch (caught) {
    actionError.value = errorMessage(caught, 'Unable to publish the configuration.');
    toast.error(actionError.value);
  } finally {
    publishing.value = false;
  }
}

function modelSuffix(item: {
  status: 'checking' | 'reported' | 'unconfigured';
  availability: RuntimeModel['availability'];
}): string {
  if (item.status === 'unconfigured') {
    return ' (not configured for this profile)';
  }
  if (item.status === 'checking') {
    return '';
  }
  return availabilityLabel(item.availability);
}

function availabilityLabel(availability: RuntimeModel['availability']): string {
  if (availability === 'unknown') {
    return ' (usability not verified)';
  }
  if (availability === 'unavailable') {
    return ' (unavailable)';
  }
  return '';
}

function requestClose(): void {
  if (dirty.value) {
    confirmingClose.value = true;
    return;
  }
  emit('close');
}

function confirmClose(): void {
  confirmingClose.value = false;
  emit('close');
}

function draftKey(value: StoredAgentDraftConfig): string {
  return JSON.stringify(cloneDraft(value));
}

function cloneDraft(value: StoredAgentDraftConfig): StoredAgentDraftConfig {
  return {
    ...(value.profileId ? { profileId: value.profileId } : {}),
    provider: value.provider,
    model: value.model,
    ...(value.reasoning ? { reasoning: value.reasoning } : {}),
    systemPrompt: value.systemPrompt,
    skills: [...value.skills],
    toolsets: [...value.toolsets],
    memory: { enabled: value.memory.enabled },
  };
}
</script>

<template>
  <form class="form-grid" @submit.prevent="save">
    <div class="panel-header">
      <div>
        <h3>Edit configuration</h3>
        <p class="muted">Changes stay on the draft until you publish a version.</p>
      </div>
      <button class="button secondary" type="button" @click="requestClose">Close</button>
    </div>
    <p v-if="loading" class="muted">Loading Hermes profiles…</p>
    <p v-if="catalogueError" class="banner error">{{ catalogueError }}</p>
    <p v-if="actionMessage" class="banner success">{{ actionMessage }}</p>
    <p v-if="actionError" class="banner error">{{ actionError }}</p>

    <label>
      <span>Profile stored with this draft</span>
      <select :value="draft.profileId ?? ''" @change="selectProfile">
        <option v-if="!draft.profileId" value="" disabled>Select a profile</option>
        <option v-for="id in profileChoices" :key="id" :value="id">
          {{ profiles.find((item) => item.id === id)?.name ?? id
          }}{{ profiles.find((item) => item.id === id)?.isDefault ? ' (default profile)' : '' }}
        </option>
      </select>
    </label>
    <button
      class="button secondary"
      type="button"
      :disabled="!draft.profileId"
      @click="loadCatalogue(true)"
    >
      Refresh this profile
    </button>

    <label>
      <span>Provider</span>
      <select v-model="draft.provider" :disabled="modelDiscoveryFailed">
        <option v-for="item in providerChoices" :key="item" :value="item">
          {{ item }}{{ reportedProviders.includes(item) ? '' : ' (not reported for this profile)' }}
        </option>
      </select>
    </label>
    <label>
      <span>Model</span>
      <select v-model="draft.model" :disabled="modelDiscoveryFailed">
        <option v-for="item in modelChoices" :key="item.id" :value="item.id">
          {{ item.name }}{{ modelSuffix(item) }}
        </option>
      </select>
    </label>
    <p v-for="item in modelChoices" :key="`${item.id}-limitation`" class="meta">
      {{ item.limitation }}
    </p>
    <label v-if="reasoningOptions.length > 0">
      <span>Reasoning</span>
      <select v-model="draft.reasoning">
        <option v-for="option in reasoningOptions" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
    </label>
    <p v-else-if="draft.reasoning" class="meta">
      Stored reasoning “{{ draft.reasoning }}” is kept, but this profile did not report reasoning
      options.
    </p>

    <label>
      <span>System prompt</span>
      <textarea v-model="draft.systemPrompt" />
    </label>

    <ProfileCapabilities
      :skills="skills"
      :toolsets="toolsets"
      :loading="loading"
      :skills-failed="skillDiscoveryFailed"
      :toolsets-failed="toolsetDiscoveryFailed"
    />

    <p v-if="!draft.profileId" class="meta">
      This draft has no stored profile. Select one and save it. An older draft is not assigned a
      profile automatically.
    </p>
    <p v-else-if="dirty" class="meta">
      Save the draft before validation or publishing. Those actions use the profile stored on the
      draft.
    </p>

    <div class="button-row">
      <button class="button" type="submit" :disabled="saving || !draft.profileId">
        {{ saving ? 'Saving…' : 'Save draft' }}
      </button>
      <button
        class="button secondary"
        type="button"
        :disabled="validating || !draft.profileId || dirty"
        @click="validate"
      >
        {{ validating ? 'Validating…' : 'Validate' }}
      </button>
      <button
        class="button secondary"
        type="button"
        :disabled="publishing || !draft.profileId || dirty"
        @click="publish"
      >
        {{ publishing ? 'Publishing…' : 'Publish version' }}
      </button>
    </div>

    <div v-if="validation" class="stack">
      <p :class="validation.valid ? 'banner success' : 'banner error'">
        {{ validation.valid ? 'No blocking errors.' : 'Blocking errors:' }}
      </p>
      <ul v-if="validation.errors.length > 0">
        <li v-for="issue in validation.errors" :key="`${issue.path}-${issue.message}`">
          {{ issue.path }} · {{ issue.code }} · {{ issue.message }}
        </li>
      </ul>
      <p v-if="validation.warnings.length > 0" class="banner warning">Warnings</p>
      <ul v-if="validation.warnings.length > 0">
        <li v-for="issue in validation.warnings" :key="`${issue.path}-${issue.message}`">
          {{ issue.path }} · {{ issue.code }} · {{ issue.message }}
        </li>
      </ul>
    </div>
  </form>
  <ConfirmDialog
    :open="confirmingClose"
    title="Discard draft changes"
    message="Unsaved configuration edits will be discarded. The stored draft stays as it is."
    confirm-label="Discard"
    tone="danger"
    @confirm="confirmClose"
    @cancel="confirmingClose = false"
  />
</template>
