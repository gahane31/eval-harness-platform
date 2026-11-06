<script setup lang="ts">
import type { AgentDraftConfig, RuntimeModelProvider, RuntimeProfile } from '../../types';
import { ref, watch } from 'vue';
import { createAgent } from '../../api/agents';
import { listRuntimeModels, listRuntimeProfiles } from '../../api/runtime';
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
const profile = ref('');
const name = ref('');
const description = ref('');
const provider = ref('');
const model = ref('');
const systemPrompt = ref('');

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
    profile.value = response.data.activeProfile ?? response.data.profiles[0]?.id ?? '';
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load Hermes profiles.');
  } finally {
    loading.value = false;
  }
}

async function loadModels(selectedProfile: string): Promise<void> {
  providers.value = [];
  provider.value = '';
  model.value = '';
  try {
    const response = await listRuntimeModels(selectedProfile);
    if (response.data.discoveryErrors.length > 0) {
      error.value = response.data.discoveryErrors.map((issue) => issue.message).join(' ');
      return;
    }
    providers.value = response.data.providers;
    const first = response.data.providers[0];
    provider.value = first?.provider ?? '';
    model.value = first?.models[0]?.id ?? '';
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to load models for this profile.');
  }
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
    <p class="meta">
      Memory stays off. Hermes memory behavior is not verified, so there is no memory control here.
    </p>
    <div class="button-row">
      <button class="button" type="submit" :disabled="saving || !provider || !model">
        {{ saving ? 'Creating…' : 'Create agent' }}
      </button>
      <button class="button secondary" type="button" :disabled="saving" @click="cancel">
        Cancel
      </button>
    </div>
  </form>
</template>
