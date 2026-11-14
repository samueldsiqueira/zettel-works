import { defineConfig } from 'vite';

// Cliente em client/, build em dist/ (servido pelo servidor Node em produção).
export default defineConfig({
  root: 'client',
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
    proxy: { '/ws': { target: 'ws://localhost:3001', ws: true } },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
