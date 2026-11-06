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
const skillsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const toolsetsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const skillsError = ref<string | null>(null);
const toolsetsError = ref<string | null>(null);

if (props.agent.publishedVersionCount > 0) {
  void loadLatest();
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

async function loadSkills(): Promise<void> {
  const profileId = props.agent.draftConfig.profileId;
  if (!profileId || skillsState.value === 'loading' || skillsState.value === 'ready') {
    return;
  }
  skillsState.value = 'loading';
  skillsError.value = null;
  try {
    const response = await listRuntimeSkills(profileId);
    skills.value = response.data.skills;
    if (response.data.discoveryErrors.length > 0) {
      skillsError.value = response.data.discoveryErrors.map((issue) => issue.message).join(' ');
    }
    skillsState.value = 'ready';
  } catch (caught) {
    skillsState.value = 'error';
    skillsError.value = errorMessage(caught, 'Unable to load skills for this profile.');
  }
}

async function loadToolsets(): Promise<void> {
  const profileId = props.agent.draftConfig.profileId;
  if (!profileId || toolsetsState.value === 'loading' || toolsetsState.value === 'ready') {
    return;
  }
  toolsetsState.value = 'loading';
  toolsetsError.value = null;
  try {
    const response = await listRuntimeToolsets(profileId);
    toolsets.value = response.data.toolsets;
    if (response.data.discoveryErrors.length > 0) {
      toolsetsError.value = response.data.discoveryErrors.map((issue) => issue.message).join(' ');
    }
    toolsetsState.value = 'ready';
  } catch (caught) {
    toolsetsState.value = 'error';
    toolsetsError.value = errorMessage(caught, 'Unable to load toolsets for this profile.');
  }
}

function onSkillsToggle(event: Event): void {
  const details = event.currentTarget;
  if (details instanceof HTMLDetailsElement && details.open) {
    void loadSkills();
  }
}

function onToolsetsToggle(event: Event): void {
  const details = event.currentTarget;
  if (details instanceof HTMLDetailsElement && details.open) {
    void loadToolsets();
  }
}

function skillLabel(id: string): string {
  return skills.value.find((skill) => skill.id === id)?.name ?? id;
}

function toolsetLabel(id: string): string {
  return toolsets.value.find((toolset) => toolset.id === id)?.name ?? id;
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

    <details class="disclosure" @toggle="onSkillsToggle">
      <summary>Skills ({{ agent.draftConfig.skills.length }} stored)</summary>
      <div class="stack">
        <p class="banner warning">
          Hermes cannot change skill configuration. Stored identifiers are shown for this draft.
          Reported skills that are not configurable cannot be enabled.
        </p>
        <p v-if="!agent.draftConfig.profileId" class="meta">
          This draft has no stored profile, so the skill catalogue cannot be loaded.
        </p>
        <p v-else-if="skillsState === 'loading'" class="muted">Loading reported skills…</p>
        <p v-else-if="skillsError" class="banner error">{{ skillsError }}</p>
        <p v-else-if="skillsState === 'ready'" class="meta">
          {{ skills.length }} reported for this profile. Configurable:
          {{ skills.filter((skill) => skill.configurable).length }}.
        </p>
        <p v-if="agent.draftConfig.skills.length === 0" class="muted">No skills are stored.</p>
        <ul v-else class="record-list">
          <li v-for="id in agent.draftConfig.skills" :key="id" class="record">
            <strong>{{ skillLabel(id) }}</strong>
            <p class="meta">{{ id }} · stored on the draft</p>
          </li>
        </ul>
      </div>
    </details>

    <details class="disclosure" @toggle="onToolsetsToggle">
      <summary>Toolsets ({{ agent.draftConfig.toolsets.length }} stored)</summary>
      <div class="stack">
        <p class="banner warning">
          Hermes cannot change toolset configuration. Stored identifiers are shown for this draft.
          Reported toolsets that are not configurable cannot be enabled.
        </p>
        <p v-if="!agent.draftConfig.profileId" class="meta">
          This draft has no stored profile, so the toolset catalogue cannot be loaded.
        </p>
        <p v-else-if="toolsetsState === 'loading'" class="muted">Loading reported toolsets…</p>
        <p v-else-if="toolsetsError" class="banner error">{{ toolsetsError }}</p>
        <p v-else-if="toolsetsState === 'ready'" class="meta">
          {{ toolsets.length }} reported for this profile. Configurable:
          {{ toolsets.filter((toolset) => toolset.configurable).length }}.
        </p>
        <p v-if="agent.draftConfig.toolsets.length === 0" class="muted">No toolsets are stored.</p>
        <ul v-else class="record-list">
          <li v-for="id in agent.draftConfig.toolsets" :key="id" class="record">
            <strong>{{ toolsetLabel(id) }}</strong>
            <p class="meta">{{ id }} · stored on the draft</p>
          </li>
        </ul>
      </div>
    </details>

    <p class="banner warning">
      Stored memory.enabled is {{ agent.draftConfig.memory.enabled ? 'true' : 'false' }}. Hermes
      memory behavior was not verified, so this screen does not offer a memory control.
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
