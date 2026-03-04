import { listNotes, readNote } from '../services/notes.js'
import { classifyAndFormat } from '../services/llm.js'
import { transcribe } from '../services/transcribe.js'
import { config } from '../config.js'
import { capture as log } from '../helpers/logger.js'

const LANG_LABELS = { uk: '🇺🇦', en: '🇬🇧', ru: '🇷🇺', auto: '🌐' }
const DEFAULT_LANG = 'uk'

/**
 * Build inline keyboard for capture preview.
 * Text: [ Save ] [ Change file ] [ Cancel ]
 * Voice: [ Save ] [ 🗂️ ] [ 🇺🇦 ] [ Cancel ] — compact single row
 */
function captureKeyboard(isVoice = false, currentLang = DEFAULT_LANG) {
  if (!isVoice) {
    return { inline_keyboard: [[
      { text: '✓ Save', callback_data: 'note:confirm', style: 'success' },
      { text: 'Change file', callback_data: 'note:refile' },
      { text: '✗ Cancel', callback_data: 'note:cancel', style: 'danger' },
    ]] }
  }

  const langFlag = LANG_LABELS[currentLang] || '🌐'
  return { inline_keyboard: [[
    { text: '✓ Save', callback_data: 'note:confirm', style: 'success' },
    { text: '🗂️', callback_data: 'note:refile' },
    { text: langFlag, callback_data: 'note:lang' },
    { text: '✗ Cancel', callback_data: 'note:cancel', style: 'danger' },
  ]] }
}

/**
 * Handle text messages — classify, format, preview with confirm buttons.
 */
export const handleCapture = async (ctx) => {
  let message = ctx.message.text

  // voice messages are handled separately via handleVoice
  if (!message) return

  await processCapture(ctx, message)
}

/**
 * Handle voice messages — transcribe then capture.
 */
export const handleVoice = async (ctx) => {
  if (!config.togetherApiKey) {
    return ctx.reply('Voice transcription is not configured (missing TOGETHER_API_KEY).')
  }

  log.info('Voice message received, starting transcription')
  await ctx.sendChatAction('typing')

  const fileId = ctx.message.voice.file_id
  const fileLink = await ctx.telegram.getFileLink(fileId)
  const lang = DEFAULT_LANG
  const text = await transcribe(fileLink.href, { language: lang })

  // store voice info for retranscription
  ctx.session.voiceFileId = fileId
  ctx.session.voiceLang = lang

  // send transcription and track message ID for in-place edits
  let transcriptionMsg
  try {
    transcriptionMsg = await ctx.reply(`_${text}_`, { parse_mode: 'Markdown' })
  } catch (_) {
    transcriptionMsg = await ctx.reply(text)
  }
  ctx.session.transcriptionMsgId = transcriptionMsg.message_id

  await processCapture(ctx, text, { isVoice: true, lang })
}

/**
 * Core capture flow: read file styles → classify & format in one LLM call → preview.
 */
async function processCapture(ctx, message, { isVoice = false, lang = DEFAULT_LANG } = {}) {
  // Auto-dismiss previous pending note if exists
  const old = ctx.session.pendingNote
  if (old && old.previewMsgId) {
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, old.previewMsgId, undefined,
        '⏭ Superseded by new note.'
      )
    } catch (_) { /* message may already be gone */ }
    ctx.session.pendingNote = null
  }

  const noteFiles = await listNotes()
  if (noteFiles.length === 0) {
    return ctx.reply('No note files found. Add .md files to the notes directory first.')
  }

  await ctx.sendChatAction('typing')

  // read tail of each file for style reference (in parallel)
  const styleRefs = await Promise.all(
    noteFiles.map(async (file) => {
      try {
        const tail = await readNote(file, { tail: 50 })
        return `--- ${file} ---\n${tail}`
      } catch (_) {
        return `--- ${file} ---\n(empty)`
      }
    })
  )

  // single LLM call: classify and format
  const result = await classifyAndFormat({
    message,
    noteFiles,
    targetFileContent: styleRefs.join('\n\n'),
  })

  // store pending note in session
  ctx.session.pendingNote = {
    filename: result.target_file,
    content: result.formatted_entry,
    originalMessage: message,
    isVoice,
  }

  // send preview with inline buttons
  const preview = `\`${result.target_file}\`\n\n${result.formatted_entry}`

  let sent
  try {
    sent = await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: captureKeyboard(isVoice, lang) })
  } catch (_) {
    // fallback to plain text if markdown parsing fails
    sent = await ctx.reply(preview, { reply_markup: captureKeyboard(isVoice, lang) })
  }
  ctx.session.pendingNote.previewMsgId = sent.message_id
}
