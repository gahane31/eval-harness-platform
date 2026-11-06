<script setup lang="ts">
import type { ExperimentCreateRequest } from '../types';
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { createExperiment } from '../api/experiments';
import ExperimentForm from '../components/experiments/ExperimentForm.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import { useToast } from '../components/ui/toast';
import { errorMessage } from '../utils/api-error';
import { useUnsavedChangesGuard } from '../utils/unsaved-changes';

const router = useRouter();
const toast = useToast();
const saving = ref(false);
const saveError = ref<string | null>(null);
const dirty = ref(false);
const finished = ref(false);

const unsaved = useUnsavedChangesGuard(() => dirty.value && !finished.value);

async function create(payload: ExperimentCreateRequest): Promise<void> {
  saving.value = true;
  saveError.value = null;
  try {
    const response = await createExperiment(payload);
    finished.value = true;
    toast.success('Eval created as a draft.');
    await router.push(`/experiments/${response.data.id}`);
  } catch (caught) {
    saveError.value = errorMessage(caught, 'Unable to create the eval.');
    toast.error(saveError.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/experiments">Back to evals</RouterLink></p>
    <PageHeader
      title="Create eval"
      description="Compare candidate configurations against a baseline on the same test cases."
    />
    <ExperimentForm
      :saving="saving"
      :error="saveError"
      @submit="create"
      @cancel="router.push('/experiments')"
      @dirty="dirty = $event"
    />
    <ConfirmDialog
      :open="unsaved.confirming.value"
      title="Discard this eval?"
      message="The eval has not been created yet."
      confirm-label="Discard eval"
      tone="danger"
      @confirm="unsaved.leave"
      @cancel="unsaved.stay"
    />
  </section>
</template>
