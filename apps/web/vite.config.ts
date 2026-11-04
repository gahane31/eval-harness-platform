import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@eval/shared': path.resolve(rootDir, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
