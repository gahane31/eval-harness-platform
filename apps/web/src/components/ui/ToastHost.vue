<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useToastState } from './toast';

const { toasts, dismiss } = useToastState();
</script>

<template>
  <div class="toast-region" aria-live="polite">
    <article v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.tone">
      <p>{{ toast.message }}</p>
      <div class="toast-actions">
        <RouterLink
          v-if="toast.action"
          class="toast-action"
          :to="toast.action.to"
          @click="dismiss(toast.id)"
        >
          {{ toast.action.label }}
        </RouterLink>
        <button class="toast-dismiss" type="button" @click="dismiss(toast.id)">Dismiss</button>
      </div>
    </article>
  </div>
</template>
