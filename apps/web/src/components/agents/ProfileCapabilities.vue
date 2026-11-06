<script setup lang="ts">
import type { RuntimeSkill, RuntimeToolset } from '../../types';
import { computed } from 'vue';

const props = defineProps<{
  skills: RuntimeSkill[];
  toolsets: RuntimeToolset[];
  loading: boolean;
  skillsFailed: boolean;
  toolsetsFailed: boolean;
}>();

const enabledSkills = computed(() =>
  props.skills.filter((skill) => skill.installed && skill.enabled),
);
const enabledToolsets = computed(() =>
  props.toolsets.filter(
    (toolset) => toolset.available && toolset.enabled && toolset.id !== 'memory',
  ),
);
const memoryStatus = computed(() => {
  if (props.loading || props.toolsetsFailed) {
    return 'Unknown';
  }
  const memory = props.toolsets.find((toolset) => toolset.id === 'memory');
  if (!memory) {
    return 'Unknown';
  }
  return memory.enabled ? 'Enabled' : 'Disabled';
});
</script>

<template>
  <section class="stack">
    <h4>Inherited from Hermes profile</h4>
    <p class="meta">
      Skills, toolsets, and memory follow the selected profile. This screen does not change them.
    </p>
    <dl class="facts">
      <dt>Memory</dt>
      <dd>{{ memoryStatus }}</dd>
      <dt>Skills</dt>
      <dd>
        <template v-if="loading">Loading…</template>
        <template v-else-if="skillsFailed">Unknown</template>
        <template v-else-if="enabledSkills.length === 0">None</template>
        <template v-else>{{ enabledSkills.map((skill) => skill.name).join(', ') }}</template>
      </dd>
      <dt>Toolsets</dt>
      <dd>
        <template v-if="loading">Loading…</template>
        <template v-else-if="toolsetsFailed">Unknown</template>
        <template v-else-if="enabledToolsets.length === 0">None</template>
        <template v-else>{{ enabledToolsets.map((toolset) => toolset.name).join(', ') }}</template>
      </dd>
    </dl>
  </section>
</template>
