<script setup lang="ts">
import type { AgentResponse } from '../types';
import { onMounted, ref } from 'vue';
import { listAgents } from '../api/agents';
import { ApiError } from '../api/client';
import ResourceState from '../components/ResourceState.vue';
import { formatTimestamp } from '../utils/format';

const agents = ref<AgentResponse[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadAgents(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const response = await listAgents();
    agents.value = response.data;
  } catch (caught) {
    agents.value = [];
    error.value = caught instanceof ApiError ? caught.message : 'Unable to load agents.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadAgents();
});
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>Agents</h2>
        <p class="muted">Current draft configurations.</p>
      </div>
      <button class="button secondary" type="button" @click="loadAgents">Refresh</button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      :empty="agents.length === 0"
      empty-message="No agents yet."
      @retry="loadAgents"
    >
      <ul class="record-list">
        <li v-for="agent in agents" :key="agent.id" class="record">
          <h3>{{ agent.name }}</h3>
          <p>{{ agent.description || 'No description' }}</p>
          <p class="meta">
            {{ agent.draftConfig.provider }} / {{ agent.draftConfig.model }} · Updated
            {{ formatTimestamp(agent.updatedAt) }}
          </p>
        </li>
      </ul>
    </ResourceState>
  </section>
</template>
