import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/jobs': 'http://localhost:3000',
      '/ws': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/workflow': 'http://localhost:3000',
      '/shell': 'http://localhost:3000',
      '/approvals': 'http://localhost:3000',
      '/validation': 'http://localhost:3000',
      '/workspace': 'http://localhost:3000',
      '/repository': 'http://localhost:3000',
      '/context': 'http://localhost:3000',
      '/orchestrator': 'http://localhost:3000',
      '/git': 'http://localhost:3000',
      '/validation-engine': 'http://localhost:3000',
      '/deployment': 'http://localhost:3000',
      '/terminal': 'http://localhost:3000',
      '/repair': 'http://localhost:3000',
      '/memory': 'http://localhost:3000',
      '/system': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/github': 'http://localhost:3000',
      '/vps': 'http://localhost:3000',
      '/repos': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  }
});
