import type { H3Event } from 'h3'
import { getEncryptedExtensionSecret } from '@gcs-ssc/extensions/server'
import { AuthoringProviderError, credentialKey, credentialSchema, extensionKey, requestOpenAiAuthoring as requestProvider } from '@gcs-ssc/gcs-file-authoring/server'
import { assertActiveAgencyProfile } from './agency-auth'
import { throwApiError } from './api-errors'
import { MultipartLimitError, MultipartParseError, readBoundedMultipartFormData } from './bounded-multipart'
import { isExtensionEnabledForAgency } from './extensions'

/**
 * Checks whether the owning Agency enabled AI authoring.
 * @param event - Authorized host request.
 * @param agencyId - Owning Agency ID.
 * @returns Whether the extension is enabled.
 */
export const isAuthoringGenerationEnabled = async (event: H3Event, agencyId: string) =>
  await isExtensionEnabledForAgency(event.context.$db, extensionKey, agencyId)

/**
 * Resolves encrypted OpenAI credentials after confirming Agency enablement.
 * @param event - Authorized host request.
 * @param agencyId - Owning Agency ID.
 * @returns Server-side credentials for the active Agency.
 */
export const getAuthoringCredentials = async (event: H3Event, agencyId: string) => {
  await assertActiveAgencyProfile(event, agencyId)
  if (!await isAuthoringGenerationEnabled(event, agencyId)) {
    return await throwApiError(event, { statusCode: 403, code: 'AUTHORING_DISABLED', key: 'apiErrors.extensions.agency_disabled' })
  }
  const rootKey = process.env.GCS_EXTENSION_SECRETS_KEY
  const credentials = rootKey
    ? await getEncryptedExtensionSecret(event.context.$db, {
        rootKey, extensionKey, ownerType: 'agency', ownerId: agencyId, secretKey: credentialKey
      })
    : null
  const parsed = credentialSchema.safeParse(credentials)
  if (!parsed.success) {
    return await throwApiError(event, { statusCode: 409, code: 'AUTHORING_CREDENTIALS_MISSING', key: 'authoring_generation.credentials_missing' })
  }
  return parsed.data
}

const maxFileBytes = 10 * 1024 * 1024

/**
 * Reads the sole multipart file without interpreting its contents.
 * @param event - Authorized host request.
 * @returns Source filename, type and bytes.
 */
export const readAuthoringFile = async (event: H3Event) => {
  event.context.auditRequestInputsRestricted = true
  try {
    const parts = await readBoundedMultipartFormData(event, { maxTotalBytes: maxFileBytes + 1024 * 1024, maxFileBytes, maxFiles: 1, maxFields: 0 })
    const file = parts?.find(part => part.name === 'file' && part.filename)
    if (file?.filename && file.data.byteLength > 0 && file.data.byteLength <= maxFileBytes) {
      return { name: file.filename, type: file.type ?? '', data: file.data }
    }
    if (file && file.data.byteLength > maxFileBytes) throw new MultipartLimitError()
  } catch (error) {
    if (error instanceof MultipartLimitError) return await throwApiError(event, {
      statusCode: 413, code: 'AUTHORING_FILE_TOO_LARGE', key: 'authoring_generation.file_too_large'
    })
    if (!(error instanceof MultipartParseError)) throw error
  }
  return await throwApiError(event, { statusCode: 400, code: 'AUTHORING_FILE_REQUIRED', key: 'authoring_generation.file_required' })
}

/**
 * Translates provider errors without exposing the provider response.
 * @param event - Authorized host request.
 * @param input - Provider request details.
 * @returns The decoded provider proposal for domain validation.
 */
export const requestAuthoringResult = async (event: H3Event, input: Parameters<typeof requestProvider>[0]) => {
  try {
    return await requestProvider(input)
  } catch (error) {
    if (!(error instanceof AuthoringProviderError)) throw error
    return await throwApiError(event, {
      statusCode: error.kind === 'rejected' ? 422 : 502,
      code: 'AUTHORING_PROVIDER_FAILED',
      key: error.kind === 'rejected' ? 'authoring_generation.file_rejected' : 'authoring_generation.provider_failed'
    })
  }
}
