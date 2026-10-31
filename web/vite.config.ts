import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { appConfig } from './src/config/app.config';

function normalizeBasePath(value: string): string {
  const segment = value.trim().replace(/^\/+|\/+$/g, '');
  return segment ? '/' + segment + '/' : '/';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8100';
  return {
    base: normalizeBasePath(env.VITE_BASE_PATH || '/'),
    plugins: [
      {
        name: 'inject-default-theme',
        enforce: 'pre',
        transformIndexHtml: (html) => html.replace('%APP_DEFAULT_THEME%', appConfig.defaultTheme),
      },
      react(),
    ],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0' },
  };
});
