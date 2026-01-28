
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // 确保浏览器环境中 process.env 不会导致崩溃
    'process.env': {}
  }
});
