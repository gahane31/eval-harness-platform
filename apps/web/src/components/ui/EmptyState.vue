<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<template>
  <div class="status muted">
    <p>{{ message }}</p>
    <div v-if="$slots.default" class="button-row">
      <slot />
    </div>
  </div>
</template>
