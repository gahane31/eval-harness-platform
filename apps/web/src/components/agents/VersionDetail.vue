<script setup lang="ts">
import type { AgentConfigurationVersion } from '../../types';
import StatusBadge from '../ui/StatusBadge.vue';
import { formatTimestamp } from '../../utils/format';

defineProps<{
  version: AgentConfigurationVersion;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <article class="stack">
    <div class="panel-header">
      <div>
        <h3>Version {{ version.version }}</h3>
        <p class="muted">Published configurations cannot be edited.</p>
      </div>
      <div class="button-row">
        <StatusBadge label="Immutable" tone="neutral" />
        <button class="button secondary" type="button" @click="emit('close')">Close</button>
      </div>
    </div>
    <dl class="facts">
      <dt>Published</dt>
      <dd>{{ formatTimestamp(version.createdAt) }}</dd>
      <dt>Configuration hash</dt>
      <dd>
        <code>{{ version.configHash }}</code>
      </dd>
      <dt>Hermes profile</dt>
      <dd>{{ version.configSnapshot.profileId ?? 'Not recorded' }}</dd>
      <dt>Provider</dt>
      <dd>{{ version.configSnapshot.provider }}</dd>
      <dt>Model</dt>
      <dd>{{ version.configSnapshot.model }}</dd>
      <dt>Reasoning</dt>
      <dd>{{ version.configSnapshot.reasoning ?? 'Not set' }}</dd>
      <dt>Skills</dt>
      <dd>{{ version.configSnapshot.skills.join(', ') || 'None' }}</dd>
      <dt>Toolsets</dt>
      <dd>{{ version.configSnapshot.toolsets.join(', ') || 'None' }}</dd>
      <dt>Memory</dt>
      <dd>{{ version.configSnapshot.memory.enabled ? 'Enabled' : 'Disabled' }}</dd>
    </dl>
    <div>
      <p class="field-label">System prompt</p>
      <pre class="output">{{ version.configSnapshot.systemPrompt || 'No system prompt.' }}</pre>
    </div>
    <p v-if="version.warnings.length === 0" class="muted">
      No warnings were stored with this version.
    </p>
    <ul v-else>
      <li v-for="warning in version.warnings" :key="`${warning.path}-${warning.code}`">
        {{ warning.path }}: {{ warning.message }}
      </li>
    </ul>
  </article>
</template>
