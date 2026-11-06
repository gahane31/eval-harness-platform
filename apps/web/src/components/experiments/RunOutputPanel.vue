<script setup lang="ts">
import type { RunDetail } from '../../types';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { configurationName, type EvalConfigurationView } from '../../api/eval-results';
import type { RunEvaluationView } from '../../api/evaluations';
import StatusBadge from '../ui/StatusBadge.vue';
import {
  formatDuration,
  formatScore,
  formatUsd,
  RUN_OUTCOME_LABELS,
  RUN_OUTCOME_TONES,
  runCost,
  runOutcome,
} from '../../utils/eval-metrics';
import { formatJson } from '../../utils/format';

const props = defineProps<{
  title: string;
  experimentId: string;
  configuration: EvalConfigurationView;
  run: RunDetail | null;
  evaluation: RunEvaluationView | null;
}>();

const expanded = ref(false);
const outcome = computed(() => runOutcome(props.run ?? undefined, props.evaluation ?? undefined));
const cost = computed(() => runCost(props.run ?? undefined));
</script>

<template>
  <section class="panel stack" :aria-label="title">
    <div class="section-header">
      <div>
        <h3>{{ title }}</h3>
        <p class="meta">{{ configurationName(configuration) }}</p>
      </div>
      <StatusBadge :label="RUN_OUTCOME_LABELS[outcome]" :tone="RUN_OUTCOME_TONES[outcome]" />
    </div>
    <p v-if="!run" class="muted">No run exists for this configuration yet.</p>
    <template v-else>
      <dl class="facts">
        <dt>Run status</dt>
        <dd>{{ run.status }}</dd>
        <dt>Score</dt>
        <dd>{{ evaluation ? formatScore(evaluation.score) : 'Not evaluated' }}</dd>
        <dt>Duration</dt>
        <dd>{{ formatDuration(run.durationMs) }}</dd>
        <dt>Estimated cost</dt>
        <dd>
          {{ formatUsd(cost) }}
          <span v-if="cost !== null && run.usage?.cost_status" class="meta">
            {{ run.usage.cost_status }}
          </span>
        </dd>
      </dl>
      <p v-if="run.error" class="banner error">{{ run.error }}</p>
      <div>
        <div class="section-header">
          <h4>Final output</h4>
          <button
            v-if="run.finalOutput"
            class="button secondary small"
            type="button"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Collapse' : 'Expand' }}
          </button>
        </div>
        <pre v-if="run.finalOutput" class="output scroll" :class="{ expanded }">{{
          run.finalOutput
        }}</pre>
        <p v-else class="muted">No output.</p>
      </div>
      <div v-if="run.structuredOutput">
        <h4>Structured output</h4>
        <p class="meta">
          JSON {{ run.structuredOutput.parsed ? 'extracted' : 'not extracted' }} · Schema
          {{
            run.structuredOutput.schemaValid === null
              ? 'not checked'
              : run.structuredOutput.schemaValid
                ? 'valid'
                : 'invalid'
          }}
        </p>
        <p v-if="run.structuredOutput.parseError" class="banner error">
          {{ run.structuredOutput.parseError }}
        </p>
        <ul v-if="run.structuredOutput.validationErrors.length > 0">
          <li v-for="issue in run.structuredOutput.validationErrors" :key="issue">{{ issue }}</li>
        </ul>
        <pre
          v-if="run.structuredOutput.extracted !== null"
          class="output scroll"
          :class="{ expanded }"
          >{{ formatJson(run.structuredOutput.extracted) }}</pre>
      </div>
      <RouterLink class="name-link" :to="`/experiments/${experimentId}/runs/${run.id}`">
        Open run details
      </RouterLink>
    </template>
  </section>
</template>
