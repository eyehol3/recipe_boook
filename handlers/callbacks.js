import { appendNote, listNotes, readNote } from '../services/notes.js'
import { classifyAndFormat } from '../services/llm.js'
import { transcribe } from '../services/transcribe.js'

const LANGUAGES = [
  { code: 'uk', label: '🇺🇦 Українська' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'auto', label: '🌐 Auto' },
]

const LANG_LABELS = { uk: '🇺🇦', en: '🇬🇧', ru: '🇷🇺', auto: '🌐' }

function captureKeyboard(isVoice = false, currentLang = 'uk') {
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
 * Handle "Save" button — append note to file.
 */
export const handleConfirm = async (ctx) => {
  const pending = ctx.session.pendingNote
  if (!pending) {
    return ctx.answerCbQuery('No pending note.')
  }

  await appendNote(pending.filename, pending.content)
  ctx.session.pendingNote = null

  await ctx.answerCbQuery('Saved!')
  await ctx.editMessageText(
    `${ctx.callbackQuery.message.text}\n\nSaved to ${pending.filename}.`
  )
}

/**
 * Handle "Cancel" button — discard pending note.
 */
export const handleCancel = async (ctx) => {
  ctx.session.pendingNote = null
  await ctx.answerCbQuery('Cancelled.')
  await ctx.editMessageText('Note cancelled.')
}

/**
 * Handle "Change file" button — show file picker.
 */
export const handleRefile = async (ctx) => {
  const pending = ctx.session.pendingNote
  if (!pending) {
    return ctx.answerCbQuery('No pending note.')
  }

  const files = await listNotes()
  const buttons = files.map(f => [{ text: f, callback_data: `refile:${f}` }])

  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup({ inline_keyboard: buttons })
}

/**
 * Handle file selection from refile picker.
 * Re-formats the note entry to match the new file's style.
 */
export const handleRefileSelect = async (ctx) => {
  const pending = ctx.session.pendingNote
  if (!pending) {
    return ctx.answerCbQuery('No pending note.')
  }

  const newFile = ctx.match[1]

  // same file selected — just restore keyboard, skip LLM call
  if (newFile === pending.filename) {
    await ctx.answerCbQuery()
    const isVoice = pending.isVoice || false
    const lang = ctx.session.voiceLang || 'uk'
    await ctx.editMessageReplyMarkup(captureKeyboard(isVoice, lang))
    return
  }

  await ctx.answerCbQuery(`Reformatting for ${newFile}...`)

  // read the new file's tail for style reference and re-format
  let styleRef = ''
  try {
    styleRef = await readNote(newFile, { tail: 50 })
  } catch (_) {
    // file might be new/empty
  }

  const noteFiles = await listNotes()
  const result = await classifyAndFormat({
    message: pending.originalMessage,
    noteFiles,
    targetFileContent: styleRef,
  })

  pending.filename = newFile
  pending.content = result.formatted_entry

  const isVoice = pending.isVoice || false
  const lang = ctx.session.voiceLang || 'uk'

  const previewText = `\`${newFile}\`\n\n${pending.content}`
  const markup = captureKeyboard(isVoice, lang)
  try {
    await ctx.editMessageText(previewText, { parse_mode: 'Markdown', reply_markup: markup })
  } catch (_) {
    await ctx.editMessageText(previewText, { reply_markup: markup })
  }
}

/**
 * Handle "Language" button — show language picker.
 */
export const handleLangPicker = async (ctx) => {
  const pending = ctx.session.pendingNote
  if (!pending) {
    return ctx.answerCbQuery('No pending note.')
  }

  const currentLang = ctx.session.voiceLang || 'uk'
  const buttons = LANGUAGES.map(({ code, label }) => {
    const marker = code === currentLang ? ' ✓' : ''
    return [{ text: `${label}${marker}`, callback_data: `lang:${code}` }]
  })

  await ctx.answerCbQuery()
  await ctx.editMessageReplyMarkup({ inline_keyboard: buttons })
}

/**
 * Handle language selection — retranscribe and re-process.
 */
export const handleLangSelect = async (ctx) => {
  const newLang = ctx.match[1]

  // same language — just restore capture keyboard
  if (newLang === ctx.session.voiceLang) {
    await ctx.answerCbQuery()
    await ctx.editMessageReplyMarkup(captureKeyboard(true, newLang))
    return
  }

  const voiceFileId = ctx.session.voiceFileId
  if (!voiceFileId) {
    return ctx.answerCbQuery('Voice file not available.')
  }

  await ctx.answerCbQuery(`Retranscribing (${LANG_LABELS[newLang] || newLang})...`)
  ctx.session.voiceLang = newLang

  const fileLink = await ctx.telegram.getFileLink(voiceFileId)
  const text = await transcribe(fileLink.href, { language: newLang })

  // edit transcription message in-place
  const chatId = ctx.chat.id
  const transcMsgId = ctx.session.transcriptionMsgId
  if (transcMsgId) {
    try {
      await ctx.telegram.editMessageText(chatId, transcMsgId, undefined, `_${text}_`, { parse_mode: 'Markdown' })
    } catch (_) {
      try {
        await ctx.telegram.editMessageText(chatId, transcMsgId, undefined, text)
      } catch (_2) { /* best effort */ }
    }
  }

  // re-classify with new transcription
  const noteFiles = await listNotes()
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

  const result = await classifyAndFormat({
    message: text,
    noteFiles,
    targetFileContent: styleRefs.join('\n\n'),
  })

  ctx.session.pendingNote = {
    filename: result.target_file,
    content: result.formatted_entry,
    originalMessage: text,
    isVoice: true,
    previewMsgId: ctx.session.pendingNote?.previewMsgId,
  }

  const preview = `\`${result.target_file}\`\n\n${result.formatted_entry}`

  // edit preview message in-place
  const markup = captureKeyboard(true, newLang)
  try {
    await ctx.editMessageText(preview, { parse_mode: 'Markdown', reply_markup: markup })
  } catch (_) {
    await ctx.editMessageText(preview, { reply_markup: markup })
  }
}