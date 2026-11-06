<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: 'default' | 'danger';
  }>(),
  {
    confirmLabel: 'Confirm',
    tone: 'default',
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const cancelButton = ref<HTMLButtonElement | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void nextTick(() => {
        cancelButton.value?.focus();
      });
    }
  },
);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('cancel');
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @click.self="emit('cancel')" @keydown="onKeydown">
      <section class="dialog" role="dialog" aria-modal="true" :aria-label="title">
        <h3>{{ title }}</h3>
        <p>{{ message }}</p>
        <div class="button-row">
          <button ref="cancelButton" class="button secondary" type="button" @click="emit('cancel')">
            Cancel
          </button>
          <button
            class="button"
            :class="{ danger: tone === 'danger' }"
            type="button"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
