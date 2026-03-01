import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        // Saat dev dengan `netlify dev`, proxy ke Netlify Functions di port 8888
        '/api': {
          target: 'http://localhost:8888/.netlify/functions',
          rewrite: (path) => path.replace(/^\/api/, '/api'),
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:8888/.netlify/functions',
          rewrite: (path) => path.replace(/^\/uploads/, '/uploads'),
          changeOrigin: true,
        },
      },
    },
  };
});
