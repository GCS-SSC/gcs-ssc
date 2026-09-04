<script setup lang="ts">
import { appRouteLocations } from '~/utils/route-locations'
import { resolveAuthReturnTarget } from '~/utils/auth-return-target'

definePageMeta({
  layout: false,
  i18n: {
    paths: {
      en: '/login',
      fr: '/connexion'
    }
  }
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const toast = useToast()

const email = ref('')
const password = ref('')
const loading = ref(false)
const loginError = ref('')

/** Shows the same safe localized feedback for provider and transport failures. */
const showLoginError = () => {
  loginError.value = t('login.error_description')
  toast.add({
    title: t('login.error_title'),
    description: t('login.error_description'),
    color: 'error'
  })
}

if (import.meta.dev) {
  email.value = 'root@example.com'
  password.value = 'password123'
}

/**
 * Handles the login process via email and password.
 * Updates the loading state and provides user feedback on success or failure.
 */
const onLogin = async () => {
  if (loading.value) return
  loading.value = true
  loginError.value = ''
  try {
    const { error } = await authClient.signIn.email({
      email: email.value,
      password: password.value
    })

    if (error) {
      showLoginError()
    } else {
      const homePath = localePath(appRouteLocations.home())
      const target = resolveAuthReturnTarget(
        route.query.returnTo,
        homePath,
        ['/login', '/connexion', localePath(appRouteLocations.login())]
      )
      await navigateTo(target)
    }
  } catch {
    showLoginError()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-(--ui-bg)">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex flex-col items-center gap-2">
          <img src="/images/gcs-ssc-logo.svg" alt="GCS-SSC" aria-hidden="false" class="h-16 w-16">
          <h1 class="text-2xl font-black tracking-tighter">
            GCS-SSC
          </h1>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="onLogin">
        <UFormField :label="t('login.email')">
          <UInput v-model="email" type="email" autocomplete="username" :placeholder="t('login.email_placeholder')" :disabled="loading" />
        </UFormField>
        <UFormField :label="t('login.password')">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('login.password_placeholder')"
            :disabled="loading" />
        </UFormField>
        <p v-if="loginError" role="alert" aria-live="assertive" class="text-sm text-error">
          {{ loginError }}
        </p>
        <UButton type="submit" :label="t('login.login')" block size="lg" :loading="loading" :disabled="loading" />

        <USeparator :label="t('login.or')" />

        <UButton
          icon="i-simple-icons-github"
          :label="t('login.login_with_github')"
          :title="t('login.github_disabled_reason')"
          disabled
          block
          size="lg"
          color="neutral"
          variant="outline"
          :loading="loading" />
        <p class="text-muted text-xs">
          {{ t('login.github_disabled_reason') }}
        </p>
      </form>
    </UCard>
  </div>
</template>
