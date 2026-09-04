// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import requireAuthorize from './eslint-rules/require-authorize.js'
// import validateAuthorizeParams from './eslint-rules/validate-authorize-params.js'
import jsdoc from 'eslint-plugin-jsdoc'
import preferArrow from 'eslint-plugin-prefer-arrow'

export default withNuxt(
  // 1. Global Ignores (Must be a standalone object)
  {
    ignores: [
      // Ignore all JSON files by default to stop .vscode/settings.json errors
      '**/*.json',
      // Un-ignore (!) your locale files so they CAN be linted
      '!i18n/locales/**/*.json',
      // Other ignores
      '.vscode/*',
      'data/*',
      'tests/*',
      'server/database/migrations/*',
      'extensions/*/client/worker.js',
      // The frozen whole-review analyzers have their own hostile contract fixtures.
      '.agents/skills/gcs-ssc/scripts/whole-review/**'
    ]
  },
  // @ts-expect-error - @intlify/eslint-plugin-vue-i18n rule types are plain strings, incompatible with withNuxt's RuleConfig<unknown[]>
  ...vueI18n.configs['flat/recommended'],
  // 2. Add the plugins and rules
  {
    plugins: {
      'jsdoc': jsdoc,
      'prefer-arrow': preferArrow
    },
    rules: {
      // Enforce arrow functions
      'prefer-arrow/prefer-arrow-functions': [
        'error',
        {
          disallowPrototype: true,
          singleReturnOnly: false,
          classPropertiesAllowed: false
        }
      ],
      // Enforce JSDoc presence
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true
          },
          // Contexts now correctly resides inside the options object
          contexts: [
            {
              context: 'ArrowFunctionExpression',
              minLineCount: 5
            },
            {
              context: 'FunctionDeclaration',
              minLineCount: 5
            }
          ]
        }
      ],
      // 1. Force JSDoc to include @param tags if the function has arguments
      'jsdoc/require-param': 'error',

      // 2. Force JSDoc to include @returns if the function has a return value
      'jsdoc/require-returns': 'error',

      // 3. Ensure the @param description is present
      'jsdoc/require-param-description': 'error',

      // 4. Existing logic for your custom tags
      'jsdoc/check-tag-names': [
        'error',
        {
          definedTags: ['remarks', 'example']
        }
      ]
    }
  },
  // 3. Add your custom local rules plugin
  {
    files: ['server/api/**/*.ts', 'server/api/**/*.js'],
    plugins: {
      local: {
        name: 'local',
        rules: {
          'require-authorize': requireAuthorize
          // 'validate-authorize-params': validateAuthorizeParams
        }
      }
    },
    rules: {
      'local/require-authorize': 'error'
      // 'local/validate-authorize-params': 'error'
    }
  },
  // Your custom configs here
  {
    rules: {
      'vue/max-attributes-per-line': 'off',
      'vue/html-closing-bracket-newline': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': false,
          'ts-check': false,
          'minimumDescriptionLength': 10
        }
      ],
      '@typescript-eslint/member-delimiter-style': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/arrow-parens': 'off',
      '@stylistic/member-delimiter-style': 'off',
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        {
          ignoreText: [
            ':',
            '(',
            ')',
            '.',
            '*',
            '+',
            '/',
            '%',
            '·',
            '#',
            '·',
            'EN',
            'FR',
            'GCS-SSC',
            'FSID',
            '01',
            '02',
            '12',
            '48',
            '85%',
            '+4%',
            '85'
          ]
        }
      ]
    },
    settings: {
      'vue-i18n': {
        localeDir: [
          {
            pattern: './i18n/locales/**/*.{json}',
            localeKey: 'file'
          }
        ]
      }
    }
  },
  // 4. SPECIFIC OVERRIDES FOR LOCALE FILES
  {
    // Apply these rules ONLY to files matching this pattern
    files: ['i18n/locales/**/*.json'],
    rules: {
      // Disable the rule you mentioned for these files
      '@intlify/vue-i18n/no-raw-text': 'off',

      // Note: Based on your previous error logs, you might also need these:
      '@intlify/vue-i18n/no-html-messages': 'off',
      '@intlify/vue-i18n/no-deprecated-modulo-syntax': 'off'
    }
  }
)
