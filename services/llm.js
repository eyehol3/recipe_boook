import OpenAI from 'openai'
import { config } from '../config.js'
import { llm as log } from '../helpers/logger.js'

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.openrouterApiKey,
})

function nowKyiv() {
  return new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

async function chat(messages, { schema, model } = {}) {
  const params = {
    model: model || config.openrouterModel,
    messages,
  }
  if (schema) {
    params.response_format = {
      type: 'json_schema',
      json_schema: { name: schema.name, strict: true, schema: schema.schema },
    }
  }

  log.info({ model: params.model, schema: schema?.name || 'none' }, 'LLM request')
  const res = await client.chat.completions.create(params)
  const content = res.choices[0].message.content
  log.info('LLM response received')

  if (schema) {
    // strip code fences just in case
    const clean = content.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    return JSON.parse(clean)
  }

  return content
}

/**
 * Classify a user message into a note file and format the entry.
 * Returns { operation, target_file, formatted_entry, old_content, summary }
 */
export async function classifyAndFormat({ message, noteFiles, targetFileContent, isVoice = false }) {
  const now = nowKyiv()

  const transcriptNote = isVoice
    ? `\n\nIMPORTANT — VOICE TRANSCRIPT: This message was transcribed from a voice recording, NOT typed. The user may have made verbal self-corrections mid-sentence (e.g. "no wait, better like this", "actually, change that to…", "ні, краще отак"). Interpret the user's FINAL intent — discard earlier phrasing that was explicitly corrected. The user cannot edit before sending (unlike text), so treat corrections as part of the natural speech flow.\n`
    : ''

  const prompt = `You are a personal note-taking assistant. The user sent a message that should be saved to one of their note files.

Current timestamp (for reference only): ${now}

Available note files (with recent content for style reference):
${targetFileContent}

User's message:
"${message}"${transcriptNote}

First, determine what the user wants to do:
- "append" — add new content to a file (the default for new notes/ideas/entries)
- "replace" — modify or update existing content in a file (e.g. "change X to Y", "update the dal recipe to use almond milk instead of coconut", "mark the groceries todo as done")
- "delete" — remove existing content from a file (e.g. "delete the dal recipe", "remove the dentist appointment from todos")

Then determine the correct target file. For "replace" and "delete" operations, find the exact content in the file that should be changed.

FORMATTING RULES — follow these strictly:
- Study the EXISTING entries in the target file carefully. Reproduce the same structure: date format, separators (---, blank lines, etc.), indentation, line spacing.
- DATE FORMAT: Look at how dates appear in the target file (e.g. "2025-12-20 14:08") and use that exact same format. Do NOT use the raw timestamp above as-is — convert it to match the file's convention.
- ENTRY STRUCTURE: If existing entries are free-form paragraphs under a date header, write a free-form paragraph. Do NOT add bullet points (- or *) unless the file already uses them.
- Do NOT add any markdown formatting (headers, bold, etc.) unless the file already uses it.
- LANGUAGE: Preserve the original language of the user's message. Do not translate.
- Keep the user's content as-is. You are formatting the entry structure, not rewriting the message.

For "replace": old_content must be the EXACT text from the file that will be replaced (copy verbatim), and formatted_entry is the new text that replaces it.
For "delete": old_content must be the EXACT text from the file that will be removed, and formatted_entry should be an empty string "".
For "append": old_content should be an empty string "", and formatted_entry is the new entry.

Respond as JSON with exactly these fields:
{
  "operation": "append" | "replace" | "delete",
  "target_file": "filename.md",
  "formatted_entry": "new content (empty string for delete)",
  "old_content": "existing content being replaced/deleted (empty string for append)",
  "summary": "brief 1-line description of the change"
}`

  return chat([{ role: 'user', content: prompt }], {
    schema: {
      name: 'classify_and_format',
      schema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['append', 'replace', 'delete'] },
          target_file: { type: 'string' },
          formatted_entry: { type: 'string' },
          old_content: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['operation', 'target_file', 'formatted_entry', 'old_content', 'summary'],
        additionalProperties: false,
      },
    },
  })
}

/**
 * Stage 1: Extract relevant chunks from notes for the given question.
 * Uses the cheaper retrieval model.
 */
export async function extractRelevantChunks({ question, notesContent }) {
  const now = nowKyiv()
  const prompt = `You are a retrieval system. Given a user's question and their notes, extract ONLY the sections/lines that are relevant to answering the question.

Current date/time: ${now}

${notesContent}

User's question: "${question}"

Rules:
- Return only the relevant excerpts, each prefixed with its source filename (e.g. "from recipe_notes.md:").
- Copy text verbatim — do not paraphrase, reformat, or summarize.
- If nothing is relevant, respond with exactly: NO_RELEVANT_CONTENT
- Do not add any commentary or explanation — just the raw excerpts.`

  return chat([{ role: 'user', content: prompt }], { model: config.retrievalModel })
}

/**
 * Stage 2: Answer the question using pre-extracted relevant chunks.
 * Uses the main (larger) model.
 */
export async function answerFromChunks({ question, chunks }) {
  const now = nowKyiv()
  const prompt = `You are a personal note assistant. Answer the user's question using ONLY the excerpts from their notes provided below.

Current date/time: ${now}

${chunks}

User's question: "${question}"

Rules:
- Answer grounded in the provided excerpts only. Do not invent information.
- Use the same language as the question. If the user writes in Ukrainian, answer in Ukrainian.
- You may use Telegram-compatible Markdown: *bold*, _italic_, \`code\`. Avoid unsupported syntax like ## headers.
- Do not add preambles like "Based on your notes..." — answer the question directly.
- Reproduce the exact formatting from the source (e.g. if notes use "- [ ]" checkboxes, keep them as-is).
- Cite the source file when relevant (e.g. "recipe_notes.md").
- If the information is not in the excerpts, say so briefly.
- Be concise.`

  return chat([{ role: 'user', content: prompt }])
}
