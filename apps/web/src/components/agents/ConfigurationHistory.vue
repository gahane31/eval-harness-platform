<script setup lang="ts">
import type { AgentConfigurationVersion } from '../../types';
import { onMounted, ref, watch } from 'vue';
import { getAgentVersion, listAgentVersions } from '../../api/agents';
import EmptyState from '../ui/EmptyState.vue';
import ErrorState from '../ui/ErrorState.vue';
import LoadingState from '../ui/LoadingState.vue';
import ListPagination from '../ui/ListPagination.vue';
import { useToast } from '../ui/toast';
import { errorMessage } from '../../utils/api-error';
import { formatTimestamp } from '../../utils/format';
import VersionDetail from './VersionDetail.vue';

const PAGE_SIZE = 10;

const props = defineProps<{
  agentId: string;
}>();

const toast = useToast();
const versions = ref<AgentConfigurationVersion[]>([]);
const selected = ref<AgentConfigurationVersion | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const page = ref(1);
const total = ref(0);

watch(
  () => props.agentId,
  () => {
    page.value = 1;
    void load();
  },
);

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  selected.value = null;
  try {
    const response = await listAgentVersions(props.agentId, page.value, PAGE_SIZE);
    versions.value = response.data;
    total.value = response.meta.total;
  } catch (caught) {
    versions.value = [];
    total.value = 0;
    error.value = errorMessage(caught, 'Unable to load configuration history.');
  } finally {
    loading.value = false;
  }
}

function changePage(next: number): void {
  page.value = next;
  void load();
}

async function openVersion(versionId: string): Promise<void> {
  error.value = null;
  try {
    const response = await getAgentVersion(versionId);
    selected.value = response.data;
  } catch (caught) {
    const message = errorMessage(caught, 'Unable to load that version.');
    error.value = message;
    toast.error(message);
  }
}

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
</script>

<template>
  <section class="stack">
    <div class="panel-header">
      <div>
        <h3>Configuration history</h3>
        <p class="muted">Published versions are immutable.</p>
      </div>
      <button class="button secondary" type="button" @click="load">Refresh</button>
    </div>
    <LoadingState v-if="loading" message="Loading history…" />
    <ErrorState v-else-if="error && versions.length === 0" :message="error" @retry="load" />
    <EmptyState v-else-if="versions.length === 0" message="No published versions yet." />
    <template v-else>
      <p v-if="error" class="banner error">{{ error }}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Identifier</th>
              <th>Provider / model</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="version in versions"
              :key="version.id"
              :class="{ 'selected-row': selected?.id === version.id }"
            >
              <td>{{ version.version }}</td>
              <td>
                <code :title="version.configHash">{{ shortHash(version.configHash) }}</code>
              </td>
              <td>{{ version.configSnapshot.provider }} / {{ version.configSnapshot.model }}</td>
              <td>{{ formatTimestamp(version.createdAt) }}</td>
              <td>
                <button class="button secondary" type="button" @click="openVersion(version.id)">
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPagination
        :page="page"
        :page-size="PAGE_SIZE"
        :total="total"
        @update:page="changePage"
      />
    </template>
    <VersionDetail v-if="selected" :version="selected" @close="selected = null" />
  </section>
</template>
