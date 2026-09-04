import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

interface OAuthClient {
  client_id?: string
  client_secret?: string
}

interface OAuthToken {
  access_token?: string
  refresh_token?: string
  [key: string]: unknown
}

const homeDirectory = process.env.HOME
if (!homeDirectory) throw new Error('HOME is not set')

const clientPath = `${homeDirectory}/.config/gcs-ssc/google-oauth-client.json`
const tokenPath = `${homeDirectory}/.config/gcs-ssc/google-sheets-token.json`
const clientDocument = JSON.parse(await readFile(clientPath, 'utf8')) as {
  installed?: OAuthClient
  web?: OAuthClient
}
const client = clientDocument.installed ?? clientDocument.web
if (!client?.client_id || !client.client_secret) {
  throw new Error(`${clientPath} must contain an installed or web OAuth client with client_id and client_secret`)
}

const state = randomBytes(32).toString('hex')
let resolveAuthorization: (code: string) => void
let rejectAuthorization: (error: Error) => void
const authorizationCode = new Promise<string>((resolve, reject) => {
  resolveAuthorization = resolve
  rejectAuthorization = reject
})

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (requestUrl.pathname !== '/oauth2/callback') {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const returnedState = requestUrl.searchParams.get('state')
  const code = requestUrl.searchParams.get('code')
  const oauthError = requestUrl.searchParams.get('error')
  if (returnedState !== state) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Authorization failed because the state value did not match. Return to the terminal.')
    rejectAuthorization(new Error('OAuth state mismatch'))
    return
  }
  if (oauthError || !code) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Google authorization was not completed. Return to the terminal.')
    rejectAuthorization(new Error(`Google authorization failed: ${oauthError ?? 'authorization code missing'}`))
    return
  }

  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Google Sheets authorization received. You can close this tab and return to the terminal.')
  resolveAuthorization(code)
})

server.listen(0, '127.0.0.1')
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve)
  server.once('error', reject)
})

const address = server.address()
if (!address || typeof address === 'string') throw new Error('Could not determine the OAuth callback port')
const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`
const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authorizationUrl.search = new URLSearchParams({
  access_type: 'offline',
  client_id: client.client_id,
  include_granted_scopes: 'true',
  prompt: 'consent',
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/spreadsheets',
  state
}).toString()

console.log('Open this link to authorize Google Sheets access:')
console.log(authorizationUrl.toString())
console.log('\nWaiting for the local callback...')

const timeout = setTimeout(() => {
  rejectAuthorization(new Error('Authorization timed out after 10 minutes'))
}, 10 * 60 * 1000)

try {
  const code = await authorizationCode
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  })
  if (!response.ok) throw new Error(`OAuth token exchange failed with HTTP ${response.status}`)
  const token = await response.json() as OAuthToken
  if (!token.access_token || !token.refresh_token) {
    throw new Error('OAuth token response did not include both access and refresh tokens')
  }

  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 })
  await writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 })
  console.log(`Authorization complete. Token saved securely to ${tokenPath}.`)
} finally {
  clearTimeout(timeout)
  server.close()
}
