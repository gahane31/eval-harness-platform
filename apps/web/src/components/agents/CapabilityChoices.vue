<script setup lang="ts">
defineProps<{
  title: string;
  choices: Array<{
    id: string;
    name: string;
    description?: string;
    source?: string;
    installed?: boolean;
    available?: boolean;
    enabled: boolean;
    configurable: boolean;
    limitation?: string;
  }>;
  selected: string[];
  loading: boolean;
  error: string | null;
  discoveryFailed: boolean;
}>();

const emit = defineEmits<{
  toggle: [id: string, selected: boolean];
}>();

function onToggle(id: string, event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  emit('toggle', id, target.checked);
}
</script>

<template>
  <details class="disclosure">
    <summary>{{ title }} ({{ loading ? 'loading' : `${choices.length} reported` }})</summary>
    <div class="stack">
      <p class="banner warning">
        Hermes does not support changing {{ title.toLowerCase() }} configuration. Entries marked not
        configurable cannot be enabled. A stored selection can only be removed from the draft.
      </p>
      <p v-if="loading" class="muted">Loading {{ title.toLowerCase() }}…</p>
      <p v-else-if="error" class="banner error">{{ error }}</p>
      <p v-else-if="discoveryFailed" class="banner error">
        Discovery failed, so this list is not a confirmed empty catalogue.
      </p>
      <p v-else-if="choices.length === 0" class="muted">None were reported for this profile.</p>
      <div v-else class="stack">
        <label v-for="choice in choices" :key="choice.id" class="choice">
          <input
            type="checkbox"
            :checked="selected.includes(choice.id)"
            :disabled="!choice.configurable && !selected.includes(choice.id)"
            @change="onToggle(choice.id, $event)"
          />
          <span>
            <strong>{{ choice.name }}</strong>
            <span class="meta">
              {{ choice.id }}
              <template v-if="choice.source"> · origin {{ choice.source }}</template>
              <template v-if="choice.installed !== undefined">
                · {{ choice.installed ? 'listed for this profile' : 'not listed for this profile' }}
              </template>
              <template v-if="choice.available !== undefined">
                · {{ choice.available ? 'listed for this profile' : 'not listed for this profile' }}
              </template>
              · {{ choice.enabled ? 'enabled in this profile' : 'not enabled in this profile' }} ·
              {{ choice.configurable ? 'configurable' : 'not configurable' }}
            </span>
            <span v-if="choice.description">{{ choice.description }}</span>
            <span v-if="choice.limitation" class="meta">{{ choice.limitation }}</span>
            <span v-if="!choice.configurable" class="meta">
              {{
                selected.includes(choice.id)
                  ? 'Stored on the draft. Clearing it only removes that stored selection.'
                  : 'This checkbox cannot enable the capability.'
              }}
            </span>
          </span>
        </label>
      </div>
    </div>
  </details>
</template>
