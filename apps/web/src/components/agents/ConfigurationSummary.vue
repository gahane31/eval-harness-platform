<script setup lang="ts">
import type {
  AgentConfigurationVersion,
  AgentResponse,
  RuntimeSkill,
  RuntimeToolset,
} from '../../types';
import { ref } from 'vue';
import { listAgentVersions } from '../../api/agents';
import { listRuntimeSkills, listRuntimeToolsets } from '../../api/runtime';
import ProfileCapabilities from './ProfileCapabilities.vue';
import StatusBadge from '../ui/StatusBadge.vue';
import { errorMessage } from '../../utils/api-error';
import { formatTimestamp } from '../../utils/format';

const props = defineProps<{
  agent: AgentResponse;
}>();

defineEmits<{
  edit: [];
}>();

const latest = ref<AgentConfigurationVersion | null>(null);
const historyError = ref<string | null>(null);
const historyLoading = ref(props.agent.publishedVersionCount > 0);
const skills = ref<RuntimeSkill[]>([]);
const toolsets = ref<RuntimeToolset[]>([]);
const catalogueLoading = ref(Boolean(props.agent.draftConfig.profileId));
const skillsFailed = ref(false);
const toolsetsFailed = ref(false);

if (props.agent.publishedVersionCount > 0) {
  void loadLatest();
}
if (props.agent.draftConfig.profileId) {
  void loadCatalogue();
}

async function loadLatest(): Promise<void> {
  historyLoading.value = true;
  historyError.value = null;
  try {
    const response = await listAgentVersions(props.agent.id, 1, 1);
    latest.value = response.data[0] ?? null;
  } catch (caught) {
    historyError.value = errorMessage(caught, 'Unable to load the latest published version.');
  } finally {
    historyLoading.value = false;
  }
}

async function loadCatalogue(): Promise<void> {
  const profileId = props.agent.draftConfig.profileId;
  if (!profileId) {
    catalogueLoading.value = false;
    return;
  }
  catalogueLoading.value = true;
  skillsFailed.value = false;
  toolsetsFailed.value = false;
  try {
    const [skillResponse, toolsetResponse] = await Promise.all([
      listRuntimeSkills(profileId),
      listRuntimeToolsets(profileId),
    ]);
    skills.value = skillResponse.data.skills;
    toolsets.value = toolsetResponse.data.toolsets;
    skillsFailed.value = skillResponse.data.discoveryErrors.length > 0;
    toolsetsFailed.value = toolsetResponse.data.discoveryErrors.length > 0;
  } catch {
    skillsFailed.value = true;
    toolsetsFailed.value = true;
  } finally {
    catalogueLoading.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <div class="panel-header">
      <div>
        <h3>Configuration</h3>
        <p class="muted">Read-only summary. Edit to change the draft.</p>
      </div>
      <button class="button" type="button" @click="$emit('edit')">Edit configuration</button>
    </div>

    <h3>Draft</h3>
    <dl class="facts">
      <dt>Hermes profile</dt>
      <dd>{{ agent.draftConfig.profileId ?? 'Not recorded' }}</dd>
      <dt>Provider</dt>
      <dd>
        <StatusBadge label="Draft" tone="info" />
        {{ agent.draftConfig.provider }}
      </dd>
      <dt>Model</dt>
      <dd>{{ agent.draftConfig.model }}</dd>
      <dt>Reasoning</dt>
      <dd>{{ agent.draftConfig.reasoning ?? 'Not set' }}</dd>
    </dl>
    <div>
      <p class="field-label">System prompt</p>
      <pre class="output">{{ agent.draftConfig.systemPrompt || 'No system prompt.' }}</pre>
    </div>

    <ProfileCapabilities
      v-if="agent.draftConfig.profileId"
      :skills="skills"
      :toolsets="toolsets"
      :loading="catalogueLoading"
      :skills-failed="skillsFailed"
      :toolsets-failed="toolsetsFailed"
    />
    <p v-else class="meta">
      This draft has no stored profile, so inherited capabilities are unknown.
    </p>

    <h3>Published</h3>
    <p v-if="agent.publishedVersionCount === 0" class="muted">No published configuration yet.</p>
    <p v-else-if="historyLoading" class="muted">Loading the latest published version…</p>
    <p v-else-if="historyError" class="banner error">{{ historyError }}</p>
    <dl v-else-if="latest" class="facts">
      <dt>Latest version</dt>
      <dd>{{ latest.version }}</dd>
      <dt>Provider / model</dt>
      <dd>{{ latest.configSnapshot.provider }} / {{ latest.configSnapshot.model }}</dd>
      <dt>Published</dt>
      <dd>{{ formatTimestamp(latest.createdAt) }}</dd>
      <dt>Versions</dt>
      <dd>{{ agent.publishedVersionCount }}</dd>
    </dl>
    <p v-if="agent.publishedVersionCount > 0" class="meta">
      Open Configuration history to view an immutable snapshot.
    </p>
  </section>
</template>
