import { listNotes } from '../services/notes.js'

export const handleList = async (ctx) => {
  const files = await listNotes()

  if (files.length === 0) {
    return ctx.reply('No note files found.')
  }

  const list = files.map(f => `- ${f}`).join('\n')
  return ctx.reply(`Note files:\n\n${list}`)
}
