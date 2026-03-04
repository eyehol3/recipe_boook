import { resolve } from 'path'

const required = (name) => {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return process.env[name]
}

export const config = {
  telegramToken: required('TELEGRAM_BOT_TOKEN'),
  allowedChatId: Number(required('ALLOWED_CHAT_ID')),
  openrouterApiKey: required('OPENROUTER_API_KEY'),
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview',
  retrievalModel: process.env.RETRIEVAL_MODEL || 'google/gemini-3-flash-preview',
  togetherApiKey: process.env.TOGETHER_API_KEY || '',
  notesDir: resolve(process.env.NOTES_DIR || './test_notes'),

  // Dropbox integration (optional — falls back to local fs if not set)
  dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
  dropboxAppSecret: process.env.DROPBOX_APP_SECRET || '',
  dropboxRefreshToken: process.env.DROPBOX_REFRESH_TOKEN || '',
  dropboxNotesPath: process.env.DROPBOX_NOTES_PATH || '/[md notes]/ongoing',
}
