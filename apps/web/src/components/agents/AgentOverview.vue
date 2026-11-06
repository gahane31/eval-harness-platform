<script setup lang="ts">
import type { AgentResponse } from '../../types';
import { ref, watch } from 'vue';
import { updateAgent } from '../../api/agents';
import { useToast } from '../ui/toast';
import { errorMessage } from '../../utils/api-error';
import { formatTimestamp } from '../../utils/format';

const props = defineProps<{
  agent: AgentResponse;
}>();

const emit = defineEmits<{
  updated: [agent: AgentResponse];
}>();

const toast = useToast();
const editing = ref(false);
const name = ref(props.agent.name);
const description = ref(props.agent.description ?? '');
const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.agent,
  (agent) => {
    if (!editing.value) {
      name.value = agent.name;
      description.value = agent.description ?? '';
    }
  },
);

function startEdit(): void {
  name.value = props.agent.name;
  description.value = props.agent.description ?? '';
  error.value = null;
  editing.value = true;
}

function cancel(): void {
  name.value = props.agent.name;
  description.value = props.agent.description ?? '';
  error.value = null;
  editing.value = false;
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const response = await updateAgent(props.agent.id, {
      name: name.value,
      description: description.value.trim() ? description.value.trim() : null,
    });
    editing.value = false;
    toast.success('Agent details saved.');
    emit('updated', response.data);
  } catch (caught) {
    error.value = errorMessage(caught, 'Unable to save the agent.');
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <div class="panel-header">
      <h3>Overview</h3>
      <button v-if="!editing" class="button" type="button" @click="startEdit">Edit details</button>
    </div>
    <p v-if="error" class="banner error">{{ error }}</p>
    <form v-if="editing" class="form-grid" @submit.prevent="save">
      <label>
        <span>Name</span>
        <input v-model="name" required maxlength="200" />
      </label>
      <label>
        <span>Description</span>
        <input v-model="description" maxlength="5000" />
      </label>
      <div class="button-row">
        <button class="button" type="submit" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button class="button secondary" type="button" :disabled="saving" @click="cancel">
          Cancel
        </button>
      </div>
    </form>
    <dl v-else class="facts">
      <dt>Name</dt>
      <dd>{{ agent.name }}</dd>
      <dt>Description</dt>
      <dd>{{ agent.description || 'No description' }}</dd>
      <dt>Hermes profile</dt>
      <dd>{{ agent.draftConfig.profileId ?? 'Not recorded' }}</dd>
      <dt>Draft provider</dt>
      <dd>{{ agent.draftConfig.provider }}</dd>
      <dt>Draft model</dt>
      <dd>{{ agent.draftConfig.model }}</dd>
      <dt>Published configurations</dt>
      <dd>{{ agent.publishedVersionCount }}</dd>
      <dt>Created</dt>
      <dd>{{ formatTimestamp(agent.createdAt) }}</dd>
      <dt>Updated</dt>
      <dd>{{ formatTimestamp(agent.updatedAt) }}</dd>
    </dl>
  </section>
</template>
