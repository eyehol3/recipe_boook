import { readNote, appendNote, writeNote } from '../services/notes.js'
import { capture as log } from './logger.js'

const timers = new Map()
const AUTOSAVE_DELAY = 20_000 // 20 seconds
const POLL_INTERVAL = 5_000   // check every 5s (Android throttles setTimeout)

/**
 * Schedule auto-save for a pending note after AUTOSAVE_DELAY.
 * Uses setInterval polling instead of setTimeout because Android aggressively
 * delays timers when the process is backgrounded (Termux).
 */
export function scheduleAutoSave(chatId, { telegram, session }) {
  cancelAutoSave(chatId)

  const deadline = Date.now() + AUTOSAVE_DELAY
  log.info({ chatId, delay: AUTOSAVE_DELAY }, 'Auto-save scheduled')

  const intervalId = setInterval(async () => {
    if (Date.now() < deadline) return // not yet

    clearInterval(intervalId)
    timers.delete(chatId)

    try {
      const pending = session.pendingNote
      if (!pending) {
        log.info({ chatId }, 'Auto-save fired but no pending note')
        return
      }

      log.info({ chatId, file: pending.filename, op: pending.operation }, 'Auto-save fired')

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
        } catch (editErr) {
          log.warn({ err: editErr, chatId }, 'Auto-save: editMessageText failed, sending fallback')
          try {
            await telegram.sendMessage(chatId, `${label} ${pending.filename}.`)
          } catch (_) { /* best effort */ }
        }
      }
      session.pendingNote = null
      log.info({ chatId }, 'Auto-save completed')
    } catch (err) {
      log.error({ err, chatId }, 'Auto-save failed')
      try {
        await telegram.sendMessage(chatId, `⚠️ Failed to auto-save note.`)
      } catch (_) { /* best effort */ }
    }
  }, POLL_INTERVAL)

  timers.set(chatId, intervalId)
}

/**
 * Cancel any pending auto-save timer for this chat.
 */
export function cancelAutoSave(chatId) {
  const existing = timers.get(chatId)
  if (existing) {
    clearInterval(existing)
    timers.delete(chatId)
  }
}
