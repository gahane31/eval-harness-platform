import type { App, InjectionKey, Ref } from 'vue';
import { inject, ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  to: string;
}

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  toasts: Ref<ToastItem[]>;
  push: (tone: ToastTone, message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

const toastKey: InjectionKey<ToastApi> = Symbol('toast');

export function installToasts(app: App<Element>): void {
  const toasts = ref<ToastItem[]>([]);
  const timers = new Map<number, number>();
  let nextId = 1;

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((item) => item.id !== id);
    const timer = timers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.delete(id);
    }
  }

  function push(tone: ToastTone, message: string, action?: ToastAction): void {
    const id = nextId;
    nextId += 1;
    toasts.value = [...toasts.value, { id, tone, message, action }];
    timers.set(
      id,
      window.setTimeout(
        () => {
          dismiss(id);
        },
        action ? 10000 : 5000,
      ),
    );
  }

  app.provide(toastKey, { toasts, push, dismiss });
}

function toastApi(): ToastApi {
  const api = inject(toastKey);
  if (!api) {
    throw new Error('Toast notifications are not available.');
  }
  return api;
}

export function useToastState(): ToastApi {
  return toastApi();
}

export function useToast(): {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
} {
  const api = toastApi();
  return {
    success: (message, action) => {
      api.push('success', message, action);
    },
    error: (message, action) => {
      api.push('error', message, action);
    },
    info: (message, action) => {
      api.push('info', message, action);
    },
  };
}
