<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useToast } from '../components/ui/toast';
import { activeEvals, startEvalMonitor, type MonitoredEval } from '../composables/eval-monitor';

const route = useRoute();
const toast = useToast();
const menu = ref<HTMLDetailsElement | null>(null);
const sections = [
  { path: '/agents', label: 'Agents' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/experiments', label: 'Evals' },
];

const stopMonitor = startEvalMonitor(notifyFinished);
onUnmounted(stopMonitor);

watch(
  () => route.fullPath,
  () => {
    if (menu.value) {
      menu.value.open = false;
    }
  },
);

function notifyFinished(item: MonitoredEval): void {
  const to = `/experiments/${item.id}`;
  if (item.execution.status === 'COMPLETED') {
    toast.success(`Eval completed: ${item.name}`, { label: 'View results', to });
  } else if (item.execution.status === 'FAILED') {
    toast.error(`Eval failed: ${item.name}`, { label: 'Open eval', to });
  } else {
    toast.info(`Eval cancelled: ${item.name}`, { label: 'Open eval', to });
  }
}

function progressText(item: MonitoredEval): string {
  const { completed, failed, planned } = item.execution;
  return `${completed + failed} of ${planned} executions`;
}

function progressPercent(item: MonitoredEval): number {
  const { completed, failed, planned } = item.execution;
  return planned > 0 ? Math.round(((completed + failed) / planned) * 100) : 0;
}

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">Local evaluation workspace</p>
        <h1>Agent Evaluation Platform</h1>
      </div>
      <nav aria-label="Primary">
        <RouterLink
          v-for="section in sections"
          :key="section.path"
          :to="section.path"
          :class="{ 'router-link-active': isActive(section.path) }"
          :aria-current="isActive(section.path) ? 'page' : undefined"
        >
          {{ section.label }}
        </RouterLink>
        <details v-if="activeEvals.length > 0" ref="menu" class="eval-indicator">
          <summary>
            <span class="pulse" aria-hidden="true"></span>
            {{ activeEvals.length }} {{ activeEvals.length === 1 ? 'eval' : 'evals' }} running
          </summary>
          <ul class="eval-indicator-menu">
            <li v-for="item in activeEvals" :key="item.id">
              <strong>{{ item.name }}</strong>
              <p class="meta">
                {{ item.execution.status === 'RUNNING' ? 'Running' : item.execution.status }} ·
                {{ progressText(item) }}
                <template v-if="item.execution.failed > 0">
                  · {{ item.execution.failed }} failed
                </template>
              </p>
              <div
                class="bar-track"
                role="progressbar"
                :aria-valuenow="progressPercent(item)"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="`${item.name} progress`"
              >
                <div class="bar-fill" :style="{ width: `${progressPercent(item)}%` }"></div>
              </div>
              <RouterLink :to="`/experiments/${item.id}`">Open eval</RouterLink>
            </li>
          </ul>
        </details>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
