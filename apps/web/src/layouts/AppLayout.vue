<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Local evaluation workspace</p>
        <h1>Agent Evaluation Platform</h1>
      </div>
      <nav aria-label="Primary">
        <RouterLink to="/agents">Agents</RouterLink>
        <RouterLink to="/tasks">Tasks</RouterLink>
        <RouterLink to="/experiments">Experiments</RouterLink>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
