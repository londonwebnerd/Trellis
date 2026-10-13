/**
 * Vite config.
 *
 * In development, Vite serves the React app on :5173 and forwards API and
 * upload requests to the Express server on :3001, so both behave like a
 * single origin (cookies just work).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
    },
  },
  build: {
    outDir: 'dist',
    // The editor (dnd-kit + forms) is lazy-loaded, so visitors only download
    // the small public bundle. See src/App.jsx.
    chunkSizeWarningLimit: 300,
  },
});
