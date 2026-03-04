/**
 * Dropbox API client — thin wrapper for file operations.
 *
 * Uses the Dropbox HTTP API directly (no SDK needed).
 * Token refresh is handled automatically.
 *
 * Required env vars: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
 * Optional: DROPBOX_NOTES_PATH (default: /[md notes]/ongoing)
 */

import { config } from '../config.js'
import { bot as log } from '../helpers/logger.js'

const API = 'https://api.dropboxapi.com/2'
const CONTENT_API = 'https://content.dropboxapi.com/2'

/**
 * JSON.stringify with non-ASCII chars escaped to \uXXXX.
 * Required for the Dropbox-API-Arg HTTP header (must be ASCII-only).
 */
function asciiJson(obj) {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, (ch) =>
    '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
  )
}

let accessToken = null
let tokenExpiresAt = 0

/**
 * Get a valid access token, refreshing if needed.
 */
async function getToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken
  }

  log.info('Refreshing Dropbox access token')

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.dropboxRefreshToken,
      client_id: config.dropboxAppKey,
      client_secret: config.dropboxAppSecret,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dropbox token refresh failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  accessToken = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000

  return accessToken
}

/**
 * Make an RPC-style Dropbox API call.
 */
async function rpc(endpoint, body) {
  const token = await getToken()
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dropbox API ${endpoint} failed (${res.status}): ${text}`)
  }

  return res.json()
}

/**
 * List .md files in the notes folder.
 */
export async function dbxListFiles() {
  const data = await rpc('/files/list_folder', {
    path: config.dropboxNotesPath,
    limit: 100,
  })

  return data.entries
    .filter(e => e['.tag'] === 'file' && e.name.endsWith('.md'))
    .map(e => e.name)
}

/**
 * Download a file's content as text.
 */
export async function dbxReadFile(filename) {
  const token = await getToken()
  const path = `${config.dropboxNotesPath}/${filename}`

  const res = await fetch(`${CONTENT_API}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': asciiJson({ path }),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dropbox download "${filename}" failed (${res.status}): ${text}`)
  }

  return res.text()
}

/**
 * Upload content to a file (overwrite mode).
 * Used for append: download → append → upload.
 */
async function dbxUpload(filename, content) {
  const token = await getToken()
  const path = `${config.dropboxNotesPath}/${filename}`

  const res = await fetch(`${CONTENT_API}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': asciiJson({
        path,
        mode: 'overwrite',
        mute: true,
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: Buffer.from(content, 'utf-8'),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dropbox upload "${filename}" failed (${res.status}): ${text}`)
  }

  return res.json()
}

/**
 * Append text to a file. Downloads current content, appends, re-uploads.
 */
export async function dbxAppendFile(filename, text) {
  let existing = ''
  try {
    existing = await dbxReadFile(filename)
  } catch (err) {
    // file might not exist yet — start fresh
    if (!err.message.includes('not_found')) throw err
  }

  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : '\n'
  const updated = existing + prefix + text + '\n'

  await dbxUpload(filename, updated)
}
