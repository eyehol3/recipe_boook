import { listNotes, readNote } from '../services/notes.js'
import { extractRelevantChunks, answerFromChunks } from '../services/llm.js'

/**
 * Handle /ask <question> command.
 */
export const handleAsk = async (ctx) => {
  const question = ctx.message.text.replace(/^\/ask\s*/, '').trim()

  if (!question) {
    return ctx.reply('Usage: /ask <question>\nExample: /ask what lentil recipe did I try?')
  }

  await processRetrieval(ctx, question)
}

/**
 * Handle messages starting with ? as retrieval shortcut.
 */
export const handleQuestionMark = async (ctx) => {
  const question = ctx.message.text.slice(1).trim()
  if (!question) return false // not a question, let it fall through
  await processRetrieval(ctx, question)
  return true
}

/**
 * Core retrieval flow: read all notes → extract chunks → answer.
 */
async function processRetrieval(ctx, question) {
  const noteFiles = await listNotes()
  if (noteFiles.length === 0) {
    return ctx.reply('No note files found.')
  }

  await ctx.sendChatAction('typing')

  // read all note files
  const parts = []
  for (const file of noteFiles) {
    try {
      const content = await readNote(file)
      parts.push(`--- ${file} ---\n${content}`)
    } catch (_) {
      // skip files that can't be read
    }
  }

  if (parts.length === 0) {
    return ctx.reply('Could not read any note files.')
  }

  const notesContent = parts.join('\n\n')

  // stage 1: extract relevant chunks (cheap retrieval model)
  const chunks = await extractRelevantChunks({ question, notesContent })

  if (chunks.trim() === 'NO_RELEVANT_CONTENT') {
    return ctx.reply('Nothing relevant found in the notes.')
  }

  // stage 2: answer from chunks (main model)
  const answer = await answerFromChunks({ question, chunks })

  try {
    await ctx.reply(answer, { parse_mode: 'Markdown' })
  } catch (_) {
    // fallback to plain text if markdown parsing fails
    await ctx.reply(answer)
  }
}
