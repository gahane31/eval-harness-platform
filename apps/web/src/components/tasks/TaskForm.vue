<script setup lang="ts">
import type { TaskCreateRequest, TaskResponse } from '../../types';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  task: TaskResponse | null;
  saving: boolean;
  error: string | null;
  title?: string;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  submit: [payload: TaskCreateRequest];
  cancel: [];
  dirty: [dirty: boolean];
}>();

const name = ref('');
const description = ref('');
const input = ref('');
const expectedOutcome = ref('null');
const scoringCriteria = ref('[]');
const outputSchema = ref('');
const tags = ref('');
const formError = ref<string | null>(null);
const initialSnapshot = ref('');

const snapshot = computed(() =>
  JSON.stringify([
    name.value,
    description.value,
    input.value,
    expectedOutcome.value,
    scoringCriteria.value,
    outputSchema.value,
    tags.value,
  ]),
);

watch(
  () => props.task,
  (task) => {
    formError.value = null;
    name.value = task?.name ?? '';
    description.value = task?.description ?? '';
    input.value = task?.input ?? '';
    expectedOutcome.value = task ? JSON.stringify(task.expectedOutcome, null, 2) : 'null';
    scoringCriteria.value = task ? JSON.stringify(task.scoringCriteria, null, 2) : '[]';
    outputSchema.value = task?.outputSchema ? JSON.stringify(task.outputSchema, null, 2) : '';
    tags.value = task?.tags.join(', ') ?? '';
    initialSnapshot.value = snapshot.value;
  },
  { immediate: true },
);

watch(
  () => snapshot.value !== initialSnapshot.value,
  (dirty) => {
    emit('dirty', dirty);
  },
);

function submit(): void {
  formError.value = null;
  const outcome = parseJsonField(expectedOutcome.value, 'Expected outcome');
  const criteria = parseJsonField(scoringCriteria.value, 'Scoring criteria');
  const schemaText = outputSchema.value.trim();
  const schema = schemaText.length === 0 ? null : parseJsonField(schemaText, 'Response schema');
  if (outcome === undefined || criteria === undefined || schema === undefined) {
    return;
  }
  emit('submit', {
    name: name.value.trim(),
    description: description.value.trim() || null,
    input: input.value,
    expectedOutcome: outcome as TaskCreateRequest['expectedOutcome'],
    scoringCriteria: criteria as TaskCreateRequest['scoringCriteria'],
    outputSchema: schema as TaskCreateRequest['outputSchema'],
    tags: tags.value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
  });
}

function parseJsonField(text: string, label: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    formError.value = `${label} is not valid JSON.`;
    return undefined;
  }
}
</script>

<template>
  <form class="form-grid" @submit.prevent="submit">
    <h3>{{ title ?? (task ? 'Edit task' : 'New task') }}</h3>
    <p v-if="formError || error" class="banner error">{{ formError || error }}</p>
    <label>
      <span>Name</span>
      <input v-model="name" required />
    </label>
    <label>
      <span>Description</span>
      <input v-model="description" />
    </label>
    <label>
      <span>Input</span>
      <textarea v-model="input" rows="4" required />
    </label>
    <label>
      <span>Expected outcome (JSON)</span>
      <textarea v-model="expectedOutcome" rows="4" spellcheck="false" />
    </label>
    <label>
      <span>Scoring criteria (JSON)</span>
      <textarea v-model="scoringCriteria" rows="6" spellcheck="false" />
    </label>
    <label>
      <span>Response Schema (JSON Schema)</span>
      <textarea v-model="outputSchema" rows="10" spellcheck="false" />
    </label>
    <p class="muted">Leave the response schema empty when structured output is not required.</p>
    <label>
      <span>Tags</span>
      <input v-model="tags" placeholder="comma-separated" />
    </label>
    <slot name="extra" />
    <div class="button-row">
      <button class="button" type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : (submitLabel ?? 'Save task') }}
      </button>
      <button class="button secondary" type="button" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>
