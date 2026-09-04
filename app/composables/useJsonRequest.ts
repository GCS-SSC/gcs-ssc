/* eslint-disable jsdoc/require-jsdoc */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'

type JsonRequestMethod = 'PATCH' | 'POST' | 'PUT'

export const useJsonRequest = () => {
  const sendJson = async <T = unknown>(url: string, method: JsonRequestMethod, body?: unknown) => {
    const response = await fetch(getClientRequestUrl(url), {
      method,
      headers: body === undefined
        ? undefined
        : {
            'content-type': 'application/json'
          },
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return await response.json() as T
  }

  const saveJson = async (url: string, method: JsonRequestMethod, body: unknown) => {
    await sendJson(url, method, body)
  }

  return {
    saveJson,
    sendJson
  }
}
