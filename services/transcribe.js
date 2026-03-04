import { config } from '../config.js'
import { transcription as log } from '../helpers/logger.js'

/**
 * Transcribe audio using Together AI Whisper v3.
 * @param {string} fileUrl - URL of the audio file (from Telegram getFileLink)
 * @returns {string} Transcribed text
 */
export async function transcribe(fileUrl, { language = 'uk' } = {}) {
  log.info({ language }, 'Starting transcription')
  // download the file from Telegram
  const audioResponse = await fetch(fileUrl)
  const audioBuffer = await audioResponse.arrayBuffer()
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' })

  const form = new FormData()
  form.append('file', blob, 'voice.ogg')
  form.append('model', 'openai/whisper-large-v3')
  if (language !== 'auto') {
    form.append('language', language)
  }

  const res = await fetch('https://api.together.xyz/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.togetherApiKey}`,
    },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    log.error({ status: res.status }, 'Together AI transcription failed')
    throw new Error(`Together AI transcription failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  log.info('Transcription complete')
  return data.text
}
