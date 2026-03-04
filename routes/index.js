import {
  handleStart,
  handleHelp,
  handleList,
  handleCapture,
  handleVoice,
  handleAsk,
  handleQuestionMark,
  handleConfirm,
  handleCancel,
  handleRefile,
  handleRefileSelect,
  handleLangPicker,
  handleLangSelect,
} from '../handlers/index.js'

export const registerRoutes = (bot) => {
  // commands
  bot.command('start', handleStart)
  bot.command('help', handleHelp)
  bot.command('list', handleList)
  bot.command('ask', handleAsk)

  // inline button callbacks
  bot.action('note:confirm', handleConfirm)
  bot.action('note:cancel', handleCancel)
  bot.action('note:refile', handleRefile)
  bot.action(/^refile:(.+)$/, handleRefileSelect)
  bot.action('note:lang', handleLangPicker)
  bot.action(/^lang:(.+)$/, handleLangSelect)

  // voice messages
  bot.on('voice', handleVoice)

  // catch-all text: check for ? prefix (retrieval) or treat as capture
  bot.on('text', async (ctx) => {
    const text = ctx.message.text

    // skip commands (already handled above)
    if (text.startsWith('/')) return

    // ? prefix → retrieval shortcut
    if (text.startsWith('?')) {
      const handled = await handleQuestionMark(ctx)
      if (handled) return
    }

    // default → note capture
    await handleCapture(ctx)
  })
}
