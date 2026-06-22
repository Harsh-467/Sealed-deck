import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bind to 0.0.0.0 so the dev server is reachable over the VPN/LAN during the demo.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 5173 },
});
