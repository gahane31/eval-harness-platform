<script setup lang="ts">
withDefaults(
  defineProps<{
    message?: string;
  }>(),
  { message: 'Loading…' },
);
</script>

<template>
  <div class="status" role="status">{{ message }}</div>
</template>
