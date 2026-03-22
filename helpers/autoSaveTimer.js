import { readNote, appendNote, writeNote } from '../services/notes.js'
import { capture as log } from './logger.js'

const timers = new Map()
const AUTOSAVE_DELAY = 20_000 // 20 seconds

/**
 * Schedule auto-save for a pending note after AUTOSAVE_DELAY.
 * Resets any existing timer for this chat.
 */
export function scheduleAutoSave(chatId, { telegram, session }) {
  cancelAutoSave(chatId)

  const timerId = setTimeout(async () => {
    timers.delete(chatId)
    const pending = session.pendingNote
    if (!pending) return

    log.info({ chatId, file: pending.filename }, 'Auto-save timer fired')

    try {
      const op = pending.operation || 'append'

      if (op === 'replace' || op === 'delete') {
        const fullContent = await readNote(pending.filename)
        if (!fullContent.includes(pending.oldContent)) {
          try {
            await telegram.sendMessage(chatId, `⚠️ Auto-save failed: content not found in ${pending.filename}.`)
          } catch (_) { /* best effort */ }
          session.pendingNote = null
          return
        }
        const updated = op === 'delete'
          ? fullContent.replace(pending.oldContent, '').replace(/\n{3,}/g, '\n\n').trim() + '\n'
          : fullContent.replace(pending.oldContent, pending.content)
        await writeNote(pending.filename, updated)
      } else {
        await appendNote(pending.filename, pending.content)
      }

      const label = op === 'delete' ? '⚡ Deleted from' : op === 'replace' ? '⚡ Updated in' : '⚡ Saved to'
      if (pending.previewMsgId) {
        try {
          await telegram.editMessageText(
            chatId, pending.previewMsgId, undefined,
            `${label} ${pending.filename}.`,
            { reply_markup: { inline_keyboard: [] } }
          )
        } catch (_) { /* best effort */ }
      }
      session.pendingNote = null
    } catch (err) {
      log.error({ err, chatId }, 'Auto-save timer failed')
      try {
        await telegram.sendMessage(chatId, `⚠️ Failed to auto-save note to ${pending?.filename}.`)
      } catch (_) { /* best effort */ }
    }
  }, AUTOSAVE_DELAY)

  timers.set(chatId, timerId)
}

/**
 * Cancel any pending auto-save timer for this chat.
 */
export function cancelAutoSave(chatId) {
  const existing = timers.get(chatId)
  if (existing) {
    clearTimeout(existing)
    timers.delete(chatId)
  }
}
