<script setup lang="ts">
import type { AgentResponse } from '../types';
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { listAllAgents } from '../api/agents';
import CreateAgentForm from '../components/agents/CreateAgentForm.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import ListPagination from '../components/ui/ListPagination.vue';
import SearchInput from '../components/ui/SearchInput.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';
import { formatTimestamp } from '../utils/format';

const PAGE_SIZE = 8;

const agents = ref<AgentResponse[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const creating = ref(false);
const query = ref('');
const status = ref<'all' | 'published' | 'draft'>('all');
const page = ref(1);
let loadGeneration = 0;

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return agents.value.filter((agent) => {
    if (status.value === 'published' && agent.publishedVersionCount === 0) {
      return false;
    }
    if (status.value === 'draft' && agent.publishedVersionCount > 0) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    const description = agent.description ?? '';
    return agent.name.toLowerCase().includes(needle) || description.toLowerCase().includes(needle);
  });
});

const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filtered.value.slice(start, start + PAGE_SIZE);
});

watch([query, status], () => {
  page.value = 1;
});

watch(filtered, (items) => {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (page.value > pages) {
    page.value = pages;
  }
});

onMounted(() => {
  void loadAgents();
});

async function loadAgents(): Promise<void> {
  const generation = loadGeneration + 1;
  loadGeneration = generation;
  loading.value = true;
  error.value = null;
  try {
    const items = await listAllAgents();
    if (generation !== loadGeneration) {
      return;
    }
    agents.value = items;
  } catch (caught) {
    if (generation !== loadGeneration) {
      return;
    }
    agents.value = [];
    error.value = errorMessage(caught, 'Unable to load agents.');
  } finally {
    if (generation === loadGeneration) {
      loading.value = false;
    }
  }
}

function onCreated(): void {
  void loadAgents();
}
</script>

<template>
  <section class="stack">
    <PageHeader
      title="Agents"
      description="Review Hermes profiles, draft models, and published configurations."
    >
      <template #actions>
        <button class="button secondary" type="button" @click="loadAgents">Refresh</button>
        <button class="button" type="button" @click="creating = true">Create agent</button>
      </template>
    </PageHeader>
    <CreateAgentForm v-model:open="creating" @created="onCreated" />
    <section class="panel">
      <div class="toolbar">
        <SearchInput v-model="query" label="Search" placeholder="Name or description" />
        <label class="filter-field">
          <span>Status</span>
          <select v-model="status">
            <option value="all">All agents</option>
            <option value="published">Has published versions</option>
            <option value="draft">Draft only</option>
          </select>
        </label>
      </div>
      <LoadingState v-if="loading" message="Loading agents…" />
      <ErrorState v-else-if="error" :message="error" @retry="loadAgents" />
      <EmptyState v-else-if="agents.length === 0" message="No agents yet.">
        <button class="button" type="button" @click="creating = true">Create agent</button>
      </EmptyState>
      <EmptyState v-else-if="filtered.length === 0" message="No agents match this search." />
      <template v-else>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Hermes profile</th>
                <th>Provider / model</th>
                <th>Published</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agent in pageItems" :key="agent.id">
                <td>
                  <RouterLink class="name-link" :to="`/agents/${agent.id}`">
                    {{ agent.name }}
                  </RouterLink>
                </td>
                <td>{{ agent.description || 'No description' }}</td>
                <td>{{ agent.draftConfig.profileId ?? 'Not recorded' }}</td>
                <td>
                  <StatusBadge label="Draft" tone="info" />
                  {{ agent.draftConfig.provider }} / {{ agent.draftConfig.model }}
                </td>
                <td>{{ agent.publishedVersionCount }}</td>
                <td>{{ formatTimestamp(agent.updatedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ListPagination
          :page="page"
          :page-size="PAGE_SIZE"
          :total="filtered.length"
          @update:page="page = $event"
        />
      </template>
    </section>
  </section>
</template>
