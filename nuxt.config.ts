import lucideIcons from '@iconify-json/lucide/icons.json'

export default defineNuxtConfig({
  modules: ['./modules/gcs-extensions', '@nuxt/eslint', '@nuxt/ui', './modules/form-requirements', '@vueuse/nuxt', '@nuxtjs/i18n'],

  ssr: false,

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    databaseUrl: '',
    pgliteDataDir: './.data/pglite',
    postgresStatementTimeoutMs: 60_000,
    postgresLockTimeoutMs: 5_000,
    postgresIdleInTransactionSessionTimeoutMs: 60_000,
    postgresHealthQueryTimeoutMs: 2_000,
    githubClientId: '',
    githubClientSecret: '',
    authSecret: '',
    authUrl: '',
    authTrustedOrigins: '',
    authCookieCacheVersion: '1'
  },

  routeRules: {
    '/login': {
      redirect: '/en/login'
    },
    '/api/**': {
      cors: true
    }
  },

  sourcemap: process.env.NODE_ENV === 'production' || process.env.NUXT_DISABLE_SOURCEMAPS === 'true'
    ? false
    : undefined,
  future: {
    compatibilityVersion: 4
  },

  experimental: {
    scanPageMeta: true
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    experimental: { asyncContext: true }
  },

  vite: {
    // The extension's locally vendored ESM provider changes with its source checkout.
    // Serve its exports directly instead of retaining an obsolete dependency bundle.
    optimizeDeps: { exclude: ['@gcs-ssc/survey', '@gcs-ssc/survey/vue', '@gcs-ssc/survey/client'] },
    define: {
      'import.meta.env.VITE_GCS_DEMO': JSON.stringify(process.env.VITE_GCS_DEMO === 'true' ? 'true' : 'false')
    }
  },
  hooks: {
    /**
     * Allow explicit TypeScript imports used by extension workspaces.
     * @param root0 - Generated Nuxt type configurations.
     * @param root0.tsConfig - Application configuration.
     * @param root0.nodeTsConfig - Node configuration.
     * @param root0.sharedTsConfig - Shared configuration.
     */
    'prepare:types': ({ tsConfig, nodeTsConfig, sharedTsConfig }) => {
      for (const config of [tsConfig, nodeTsConfig, sharedTsConfig]) {
        config.compilerOptions ??= {}
        config.compilerOptions.allowImportingTsExtensions = true
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    customRoutes: 'meta',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' }
    ],
    langDir: 'locales',
    defaultLocale: 'en',
    strategy: 'prefix',
    experimental: {
      localeDetector: 'locale-detector.ts'
    }
  },

  icon: {
    provider: 'none',
    fallbackToApi: false,
    collections: ['lucide', 'simple-icons'],
    serverBundle: false,
    clientBundle: {
      // Persisted names also include legacy aliases; login uses the GitHub brand.
      icons: [
        ...Object.keys(lucideIcons.icons).map(name => `lucide:${name}`),
        ...Object.keys(lucideIcons.aliases).map(name => `lucide:${name}`),
        'simple-icons:github'
      ],
      scan: true,
      sizeLimitKb: 1024
    }
  }
})
