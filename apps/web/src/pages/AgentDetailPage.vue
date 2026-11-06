<script setup lang="ts">
import type { AgentResponse } from '../types';
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getAgent } from '../api/agents';
import AgentDraftEditor from '../components/agents/AgentDraftEditor.vue';
import AgentOverview from '../components/agents/AgentOverview.vue';
import AgentTaskSuites from '../components/agents/AgentTaskSuites.vue';
import ConfigurationHistory from '../components/agents/ConfigurationHistory.vue';
import ConfigurationSummary from '../components/agents/ConfigurationSummary.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import LoadingState from '../components/ui/LoadingState.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import { errorMessage } from '../utils/api-error';

const route = useRoute();
const agent = ref<AgentResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const tab = ref<'overview' | 'configuration' | 'history' | 'suites'>(initialTab());
const editingConfiguration = ref(false);

function initialTab(): 'overview' | 'suites' {
  return route.query.tab === 'suites' ? 'suites' : 'overview';
}

function initialSuiteId(): string | null {
  return typeof route.query.suite === 'string' ? route.query.suite : null;
}

watch(
  () => route.params.agentId,
  () => {
    tab.value = initialTab();
    editingConfiguration.value = false;
    void load();
  },
);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  const agentId = route.params.agentId;
  if (typeof agentId !== 'string') {
    error.value = 'Agent not found.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const response = await getAgent(agentId);
    agent.value = response.data;
  } catch (caught) {
    agent.value = null;
    error.value = errorMessage(caught, 'Unable to load the agent.');
  } finally {
    loading.value = false;
  }
}

function replaceAgent(next: AgentResponse): void {
  agent.value = next;
}

function selectTab(next: 'overview' | 'configuration' | 'history' | 'suites'): void {
  tab.value = next;
  if (next !== 'configuration') {
    editingConfiguration.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <p class="back-link"><RouterLink to="/agents">Back to agents</RouterLink></p>
    <LoadingState v-if="loading" message="Loading agent…" />
    <ErrorState v-else-if="error" :message="error" @retry="load" />
    <template v-else-if="agent">
      <PageHeader
        :title="agent.name"
        description="Draft configuration is separate from published versions."
      >
        <template #actions>
          <StatusBadge
            :label="
              agent.publishedVersionCount > 0
                ? `${agent.publishedVersionCount} published`
                : 'Draft only'
            "
            :tone="agent.publishedVersionCount > 0 ? 'success' : 'info'"
          />
        </template>
      </PageHeader>
      <div class="tabs" role="tablist">
        <button type="button" :aria-selected="tab === 'overview'" @click="selectTab('overview')">
          Overview
        </button>
        <button
          type="button"
          :aria-selected="tab === 'configuration'"
          @click="selectTab('configuration')"
        >
          Configuration
        </button>
        <button type="button" :aria-selected="tab === 'history'" @click="selectTab('history')">
          Configuration history
        </button>
        <button type="button" :aria-selected="tab === 'suites'" @click="selectTab('suites')">
          Task suites
        </button>
      </div>
      <section class="panel">
        <AgentOverview
          v-if="tab === 'overview'"
          :key="agent.id"
          :agent="agent"
          @updated="replaceAgent"
        />
        <template v-else-if="tab === 'configuration'">
          <ConfigurationSummary
            v-if="!editingConfiguration"
            :agent="agent"
            @edit="editingConfiguration = true"
          />
          <AgentDraftEditor
            v-else
            :agent="agent"
            @updated="replaceAgent"
            @close="editingConfiguration = false"
          />
        </template>
        <ConfigurationHistory v-else-if="tab === 'history'" :agent-id="agent.id" />
        <AgentTaskSuites v-else :agent-id="agent.id" :initial-suite-id="initialSuiteId()" />
      </section>
    </template>
  </section>
</template>
