import {
  existsSync,
  readFileSync,
} from 'node:fs'
import process from 'node:process'
import {
  fileURLToPath,
} from 'node:url'
import {
  parseEnv,
} from 'node:util'
import {
  defineConfig,
} from 'weapp-vite'
import {
  TDesignResolver,
} from 'weapp-vite/auto-import-components/resolvers'

export default defineConfig(({
  mode,
}) => {
  const base = parseEnv(readFileSync(new URL(`.env.${mode}`, import.meta.url), 'utf8'))
  const localFile = new URL(`.env.${mode}.local`, import.meta.url)
  const values = {
    ...base,
    ...(existsSync(localFile) ? parseEnv(readFileSync(localFile, 'utf8')) : {}),
    ...process.env,
  }
  const baseURL = values.APP_API_BASE_URL ?? ''
  const localDev = mode !== 'production'
    && /^http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?\//.test(baseURL)
  if (!/^https:\/\//.test(baseURL) && !localDev) {
    throw new Error('APP_API_BASE_URL 必须为 HTTPS URL（开发/测试可为本机或局域网 HTTP）')
  }
  const mock = values.APP_MOCK === 'true'
  if (mode === 'production' && mock) {
    throw new Error('生产构建禁止启用 Mock')
  }
  return {
    define: {
      __APP_CONFIG__: JSON.stringify({
        mode,
        baseURL,
        mock,
      }),
    },
    resolve: {
      alias: {
        '@/features/grain/service': fileURLToPath(new URL(mock ? './src/features/grain/service.ts' : './src/features/grain/unavailable.ts', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    weapp: {
      srcRoot: 'src',
      tailwindcss: {
        rem2rpx: true,
        cssEntries: ['src/app.css'],
      },
      autoImportComponents: {
        resolvers: [TDesignResolver()],
      },
      generate: {
        extensions: {
          js: 'ts',
          wxss: 'scss',
        },
        dirs: {
          component: 'src/components',
          page: 'src/pages',
        },
      },
    },
  }
})
