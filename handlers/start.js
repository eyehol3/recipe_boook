export const handleStart = (ctx) => {
  return ctx.reply(
    'Recipe Book bot.\n\n' +
    'Send me a note and I\'ll save it to the right file.\n' +
    'Use /ask or start with ? to query your notes.\n\n' +
    '/help for all commands.'
  )
}
