export const handleHelp = (ctx) => {
  return ctx.reply(
    'Commands:\n\n' +
    '/start — welcome\n' +
    '/help — this message\n' +
    '/list — show note files\n' +
    '/ask <question> — query your notes\n' +
    '?<question> — shortcut for /ask\n\n' +
    'Send any text or voice message to capture a note.'
  )
}
