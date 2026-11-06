<script setup lang="ts">
defineProps<{
  message: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="status error">
    <p>{{ message }}</p>
    <button class="button secondary" type="button" @click="emit('retry')">Try again</button>
  </div>
</template>
