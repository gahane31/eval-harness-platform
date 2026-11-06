<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
}>();

const emit = defineEmits<{
  'update:page': [page: number];
}>();

const totalPages = computed(() =>
  props.total === 0 ? 0 : Math.ceil(props.total / props.pageSize),
);
const start = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const end = computed(() => Math.min(props.page * props.pageSize, props.total));

function go(next: number): void {
  if (next < 1 || next > totalPages.value || next === props.page) {
    return;
  }
  emit('update:page', next);
}
</script>

<template>
  <nav class="pagination" aria-label="Pagination">
    <p class="meta">{{ start }}–{{ end }} of {{ total }}</p>
    <div class="button-row">
      <button class="button secondary" type="button" :disabled="page <= 1" @click="go(page - 1)">
        Previous
      </button>
      <span class="meta">Page {{ page }} of {{ totalPages }}</span>
      <button
        class="button secondary"
        type="button"
        :disabled="page >= totalPages"
        @click="go(page + 1)"
      >
        Next
      </button>
    </div>
  </nav>
</template>
