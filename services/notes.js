import { readdir, readFile, appendFile, stat, open } from 'fs/promises'
import { join } from 'path'
import { config } from '../config.js'
import { dbxListFiles, dbxReadFile, dbxAppendFile } from './dropbox.js'

const useDropbox = Boolean(config.dropboxRefreshToken)

// ── Public API (same interface regardless of backend) ──────────

export async function listNotes() {
  if (useDropbox) return dbxListFiles()

  const files = await readdir(config.notesDir)
  return files.filter(f => f.endsWith('.md'))
}

export async function readNote(filename, { tail } = {}) {
  let content

  if (useDropbox) {
    content = await dbxReadFile(filename)
  } else {
    const filePath = join(config.notesDir, filename)
    if (!filePath.startsWith(config.notesDir)) throw new Error('Invalid filename')
    content = await readFile(filePath, 'utf-8')
  }

  if (tail) {
    const lines = content.split('\n')
    return lines.slice(-tail).join('\n')
  }

  return content
}

export async function appendNote(filename, content) {
  if (useDropbox) return dbxAppendFile(filename, content)

  const filePath = join(config.notesDir, filename)
  if (!filePath.startsWith(config.notesDir)) throw new Error('Invalid filename')

  // check if file ends with newline
  let prefix = '\n'
  try {
    const stats = await stat(filePath)
    if (stats.size > 0) {
      const fh = await open(filePath, 'r')
      const buf = Buffer.alloc(1)
      await fh.read(buf, 0, 1, stats.size - 1)
      await fh.close()
      if (buf.toString() !== '\n') {
        prefix = '\n\n'
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  await appendFile(filePath, `${prefix}${content}\n`, 'utf-8')
}
