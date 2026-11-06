<script setup lang="ts">
defineProps<{
  label: string;
  placeholder?: string;
}>();

const model = defineModel<string>({ required: true });
</script>

<template>
  <label class="search-field">
    <span>{{ label }}</span>
    <input v-model="model" type="search" :placeholder="placeholder" />
  </label>
</template>
