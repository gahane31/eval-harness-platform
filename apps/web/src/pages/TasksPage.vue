<script setup lang="ts">
import type { TaskResponse } from '../types';
import { onMounted, ref } from 'vue';
import { ApiError } from '../api/client';
import { listTasks } from '../api/tasks';
import ResourceState from '../components/ResourceState.vue';
import { formatTimestamp } from '../utils/format';

const tasks = ref<TaskResponse[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadTasks(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const response = await listTasks();
    tasks.value = response.data;
  } catch (caught) {
    tasks.value = [];
    error.value = caught instanceof ApiError ? caught.message : 'Unable to load tasks.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadTasks();
});
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>Tasks</h2>
        <p class="muted">Inputs, expected outcomes, and scoring criteria.</p>
      </div>
      <button class="button secondary" type="button" @click="loadTasks">Refresh</button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      :empty="tasks.length === 0"
      empty-message="No tasks yet."
      @retry="loadTasks"
    >
      <ul class="record-list">
        <li v-for="task in tasks" :key="task.id" class="record">
          <h3>{{ task.name }}</h3>
          <p>{{ task.description || 'No description' }}</p>
          <div v-if="task.tags.length > 0" class="tags">
            <span v-for="tag in task.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
          <p class="meta">
            Version {{ task.version }} · Updated {{ formatTimestamp(task.updatedAt) }}
          </p>
        </li>
      </ul>
    </ResourceState>
  </section>
</template>
