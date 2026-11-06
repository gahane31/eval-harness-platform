<script setup lang="ts">
import type {
  AgentDraftConfig,
  RuntimeModelProvider,
  RuntimeProfile,
  RuntimeSkill,
  RuntimeToolset,
} from '../../types';
import { computed, ref, watch } from 'vue';
import { createAgent } from '../../api/agents';
import {
  listRuntimeModels,
  listRuntimeProfiles,
  listRuntimeSkills,
  listRuntimeToolsets,
} from '../../api/runtime';
import ProfileCapabilities from './ProfileCapabilities.vue';
import { useToast } from '../ui/toast';
import { errorMessage } from '../../utils/api-error';

const emit = defineEmits<{
  created: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const toast = useToast();
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const profiles = ref<RuntimeProfile[]>([]);
const providers = ref<RuntimeModelProvider[]>([]);
const skills = ref<RuntimeSkill[]>([]);
const toolsets = ref<RuntimeToolset[]>([]);
const skillsFailed = ref(false);
const toolsetsFailed = ref(false);
const capabilitiesLoading = ref(false);
const profile = ref('');
const name = ref('');
const description = ref('');
const provider = ref('');
const model = ref('');
const systemPrompt = ref('');
const canCreate = computed(
  () =>
    name.value.trim().length > 0 &&
    profile.value.length > 0 &&
    provider.value.length > 0 &&
    model.value.length > 0 &&
    !error.value,
);

watch(open, (isOpen) => {
  if (isOpen) {
    void loadProfiles();
  }
});

watch(profile, (next) => {
  if (next) {
    void loadModels(next);
  }
});

async function loadProfiles(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const response = await listRuntimeProfiles();
    if (response.data.discoveryErrors.length > 0) {
      profiles.value = response.data.profiles;
      error.value = response.data.discoveryErrors.map((issue) => issue.message).join(' ');
    } else {
      profiles.value = response.data.profiles;
    }
    profile.value = preferredProfile(response.data.profiles, response.data.activeProfile);
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load Hermes profiles.');
  } finally {
    loading.value = false;
  }
}

async function loadModels(selectedProfile: string): Promise<void> {
  providers.value = [];
  skills.value = [];
  toolsets.value = [];
  provider.value = '';
  model.value = '';
  error.value = null;
  skillsFailed.value = false;
  toolsetsFailed.value = false;
  capabilitiesLoading.value = true;
  try {
    const [models, skillCatalogue, toolsetCatalogue] = await Promise.all([
      listRuntimeModels(selectedProfile),
      listRuntimeSkills(selectedProfile),
      listRuntimeToolsets(selectedProfile),
    ]);
    skills.value = skillCatalogue.data.skills;
    toolsets.value = toolsetCatalogue.data.toolsets;
    skillsFailed.value = skillCatalogue.data.discoveryErrors.length > 0;
    toolsetsFailed.value = toolsetCatalogue.data.discoveryErrors.length > 0;
    if (models.data.discoveryErrors.length > 0) {
      error.value = models.data.discoveryErrors.map((issue) => issue.message).join(' ');
      return;
    }
    providers.value = models.data.providers;
    const first = models.data.providers[0];
    provider.value = first?.provider ?? '';
    model.value = first?.models[0]?.id ?? '';
    if (!provider.value || !model.value) {
      error.value = 'This profile does not report a provider and model. Choose another profile.';
    }
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load models for this profile.');
  } finally {
    capabilitiesLoading.value = false;
  }
}

function preferredProfile(list: RuntimeProfile[], activeProfile: string | undefined): string {
  if (list.some((item) => item.id === 'eval-base')) {
    return 'eval-base';
  }
  if (activeProfile && list.some((item) => item.id === activeProfile)) {
    return activeProfile;
  }
  return list[0]?.id ?? '';
}

async function submit(): Promise<void> {
  saving.value = true;
  error.value = null;
  const draft: AgentDraftConfig = {
    provider: provider.value,
    model: model.value,
    systemPrompt: systemPrompt.value,
    skills: [],
    toolsets: [],
    profileId: profile.value,
    memory: { enabled: false },
  };
  try {
    await createAgent({
      name: name.value,
      description: description.value.trim() ? description.value.trim() : null,
      draftConfig: draft,
    });
    open.value = false;
    name.value = '';
    description.value = '';
    systemPrompt.value = '';
    toast.success('Agent created.');
    emit('created');
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to create the agent.');
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  name.value = '';
  description.value = '';
  systemPrompt.value = '';
  error.value = null;
  open.value = false;
}
</script>

<template>
  <form v-if="open" class="form-grid panel" @submit.prevent="submit">
    <p v-if="loading" class="muted">Loading Hermes profiles…</p>
    <p v-if="error" class="banner error">{{ error }}</p>
    <label>
      <span>Name</span>
      <input v-model="name" required maxlength="200" />
    </label>
    <label>
      <span>Description</span>
      <input v-model="description" maxlength="5000" />
    </label>
    <label>
      <span>Hermes profile stored with this agent</span>
      <select v-model="profile" required>
        <option v-for="item in profiles" :key="item.id" :value="item.id">
          {{ item.name }}{{ item.isDefault ? ' (default)' : '' }}
        </option>
      </select>
    </label>
    <label>
      <span>Provider</span>
      <select v-model="provider" required>
        <option v-for="item in providers" :key="item.provider" :value="item.provider">
          {{ item.provider }}
        </option>
      </select>
    </label>
    <label>
      <span>Model</span>
      <select v-model="model" required>
        <option
          v-for="item in providers.find((entry) => entry.provider === provider)?.models ?? []"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name
          }}{{
            item.availability === 'unknown'
              ? ' (usability not verified)'
              : item.availability === 'unavailable'
                ? ' (unavailable)'
                : ''
          }}
        </option>
      </select>
    </label>
    <p
      v-for="item in providers.find((entry) => entry.provider === provider)?.models ?? []"
      :key="`${item.id}-note`"
      class="meta"
    >
      {{ item.limitation }}
    </p>
    <label>
      <span>System prompt</span>
      <textarea v-model="systemPrompt" />
    </label>
    <ProfileCapabilities
      :skills="skills"
      :toolsets="toolsets"
      :loading="capabilitiesLoading"
      :skills-failed="skillsFailed"
      :toolsets-failed="toolsetsFailed"
    />
    <div class="button-row">
      <button class="button" type="submit" :disabled="saving || loading || !canCreate">
        {{ saving ? 'Creating…' : 'Create agent' }}
      </button>
      <button class="button secondary" type="button" :disabled="saving" @click="cancel">
        Cancel
      </button>
    </div>
  </form>
</template>
