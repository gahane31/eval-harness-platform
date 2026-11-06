import { onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

export function useUnsavedChangesGuard(hasUnsavedChanges: () => boolean) {
  const confirming = ref(false);
  let resolveLeave: ((leave: boolean) => void) | null = null;

  function guard(): boolean | Promise<boolean> {
    if (!hasUnsavedChanges()) {
      return true;
    }
    confirming.value = true;
    return new Promise<boolean>((resolve) => {
      resolveLeave = resolve;
    });
  }

  function settle(leave: boolean): void {
    confirming.value = false;
    resolveLeave?.(leave);
    resolveLeave = null;
  }

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (hasUnsavedChanges()) {
      event.preventDefault();
    }
  }

  onBeforeRouteLeave(guard);
  onBeforeRouteUpdate(guard);
  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
  });

  return {
    confirming,
    leave: () => {
      settle(true);
    },
    stay: () => {
      settle(false);
    },
  };
}
