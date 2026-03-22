import { listNotes, readNote, appendNote, writeNote } from '../services/notes.js'
import { classifyAndFormat } from '../services/llm.js'
import { transcribe } from '../services/transcribe.js'
import { config } from '../config.js'
import { capture as log } from '../helpers/logger.js'
import { scheduleAutoSave, cancelAutoSave } from '../helpers/autoSaveTimer.js'

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
 * Auto-save the current pending note to its file.
 * Edits the old preview to show a save confirmation and removes buttons.
 * Returns true on success, false on failure (keeps pendingNote intact on failure).
 */
async function autoSavePending(ctx) {
  const pending = ctx.session.pendingNote
  if (!pending) return true // no-op

  cancelAutoSave(ctx.chat.id)

  try {
    const op = pending.operation || 'append'

    if (op === 'replace' || op === 'delete') {
      const fullContent = await readNote(pending.filename)
      if (!fullContent.includes(pending.oldContent)) {
        try {
          await ctx.reply(`⚠️ Could not auto-save: content not found in ${pending.filename} (may have changed).`)
        } catch (_) { /* best effort */ }
        ctx.session.pendingNote = null
        return false
      }
      const updated = op === 'delete'
        ? fullContent.replace(pending.oldContent, '').replace(/\n{3,}/g, '\n\n').trim() + '\n'
        : fullContent.replace(pending.oldContent, pending.content)
      await writeNote(pending.filename, updated)
    } else {
      await appendNote(pending.filename, pending.content)
    }

    const label = op === 'delete' ? '⚡ Deleted from' : op === 'replace' ? '⚡ Updated in' : '⚡ Saved to'
    // Edit old preview to show save confirmation and remove buttons
    if (pending.previewMsgId) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, pending.previewMsgId, undefined,
          `${label} ${pending.filename}.`,
          { reply_markup: { inline_keyboard: [] } }
        )
      } catch (_) { /* best effort */ }
    }
    ctx.session.pendingNote = null
    return true
  } catch (err) {
    // Notify user, keep pendingNote intact
    try {
      await ctx.reply(`⚠️ Failed to auto-save note to ${pending.filename}. Your note was not lost.`)
    } catch (_) { /* best effort */ }
    return false
  }
}

/**
 * Handle text messages — classify, format, preview with confirm buttons.
 */
export const handleCapture = async (ctx) => {
  const message = ctx.message.text

  // voice messages are handled separately via handleVoice
  if (!message) return

  // Detect reply-to-preview: if the user replies to the current pending preview,
  // treat it as an edit (re-classify with new text, update preview in-place)
  const replyToId = ctx.message.reply_to_message?.message_id
  const pendingPreviewId = ctx.session.pendingNote?.previewMsgId
  if (replyToId && pendingPreviewId && replyToId === pendingPreviewId) {
    await processCapture(ctx, message, { editMode: true })
    return
  }

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

  // Detect reply-to-preview before sending transcription
  const replyToId = ctx.message.reply_to_message?.message_id
  const pendingPreviewId = ctx.session.pendingNote?.previewMsgId
  const isEditMode = !!(replyToId && pendingPreviewId && replyToId === pendingPreviewId)

  // send transcription and track message ID for in-place edits
  let transcriptionMsg
  try {
    transcriptionMsg = await ctx.reply(`_${text}_`, { parse_mode: 'Markdown' })
  } catch (_) {
    transcriptionMsg = await ctx.reply(text)
  }
  ctx.session.transcriptionMsgId = transcriptionMsg.message_id

  await processCapture(ctx, text, { isVoice: true, lang, editMode: isEditMode })
}

/**
 * Build preview text for the confirmation window.
 * For append: just show the new content.
 * For replace/delete: show a diff with old and new content.
 */
function buildPreview(result) {
  const header = `\`${result.target_file}\``

  if (result.operation === 'delete') {
    return `${header}\n\n━━ Removing ━━\n${result.old_content}`
  }

  if (result.operation === 'replace') {
    let preview = `${header}\n\n━━ Before ━━\n${result.old_content}\n\n━━ After ━━\n${result.formatted_entry}`
    return preview
  }

  // append (default)
  return `${header}\n\n${result.formatted_entry}`
}

/**
 * Core capture flow: read file styles → classify & format in one LLM call → preview.
 * If editMode is true, edits the existing preview in-place instead of sending a new message.
 */
async function processCapture(ctx, message, { isVoice = false, lang = DEFAULT_LANG, editMode = false } = {}) {
  if (editMode) {
    // Reply-to-edit: re-run classification with new text and update the preview in-place.
    // No auto-save or dismiss — the pending note is the one we're editing.
  } else {
    // Auto-save previous pending note if one exists, before processing the new message.
    const old = ctx.session.pendingNote
    if (old) {
      await autoSavePending(ctx)
    }
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
    isVoice,
  })

  const preview = buildPreview(result)
  const keyboard = captureKeyboard(isVoice, lang)

  if (editMode) {
    // Update pendingNote with new content + text
    const existingPreviewMsgId = ctx.session.pendingNote.previewMsgId
    ctx.session.pendingNote = {
      filename: result.target_file,
      content: result.formatted_entry,
      oldContent: result.old_content,
      operation: result.operation,
      originalMessage: message,
      isVoice,
      previewMsgId: existingPreviewMsgId,
    }
    // Edit preview in-place
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id, existingPreviewMsgId, undefined,
        preview,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      )
    } catch (_) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, existingPreviewMsgId, undefined,
          preview,
          { reply_markup: keyboard }
        )
      } catch (_2) { /* best effort */ }
    }
    scheduleAutoSave(ctx.chat.id, { telegram: ctx.telegram, session: ctx.session })
  } else {
    // store pending note in session
    ctx.session.pendingNote = {
      filename: result.target_file,
      content: result.formatted_entry,
      oldContent: result.old_content,
      operation: result.operation,
      originalMessage: message,
      isVoice,
    }
    // send preview with inline buttons
    let sent
    try {
      sent = await ctx.reply(preview, { parse_mode: 'Markdown', reply_markup: keyboard })
    } catch (_) {
      // fallback to plain text if markdown parsing fails
      sent = await ctx.reply(preview, { reply_markup: keyboard })
    }
    ctx.session.pendingNote.previewMsgId = sent.message_id
    scheduleAutoSave(ctx.chat.id, { telegram: ctx.telegram, session: ctx.session })
  }
}
