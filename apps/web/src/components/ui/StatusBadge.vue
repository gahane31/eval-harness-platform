<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  }>(),
  { tone: 'neutral' },
);
</script>

<template>
  <span class="badge" :class="tone">{{ label }}</span>
</template>
