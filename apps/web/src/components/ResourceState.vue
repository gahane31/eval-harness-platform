<script setup lang="ts">
defineProps<{
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyMessage: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div v-if="loading" class="status">Loading…</div>
  <div v-else-if="error" class="status error">
    <p>{{ error }}</p>
    <button class="button secondary" type="button" @click="emit('retry')">Try again</button>
  </div>
  <div v-else-if="empty" class="status muted">{{ emptyMessage }}</div>
  <slot v-else />
</template>
