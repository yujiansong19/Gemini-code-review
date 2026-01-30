
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // 加载当前环境下的变量
  // Use node:process to ensure cwd() is available and correctly typed in the Node environment
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 将环境变量注入到 process.env.API_KEY 中
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
    server: {
      port: 5173,
      strictPort: true,
    }
  };
});
