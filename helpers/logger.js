/**
 * Lightweight logger with timestamps and module tags.
 * Inspired by LyAdminBot's logger pattern but without pino dependency.
 *
 * Usage:
 *   import { log } from '../helpers/logger.js'
 *   const logger = log.child('CAPTURE')
 *   logger.info('processing voice message')
 *   logger.error({ err }, 'transcription failed')
 */

function ts() {
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

function fmt(level, module, msg, extra) {
  const tag = module ? `[${module}]` : ''
  const base = `${ts()} ${level.toUpperCase().padEnd(5)} ${tag} ${msg}`
  if (extra && Object.keys(extra).length) {
    // if extra contains an Error, serialise it nicely
    const cleaned = { ...extra }
    if (cleaned.err instanceof Error) {
      cleaned.err = { message: cleaned.err.message, stack: cleaned.err.stack }
    }
    return `${base} ${JSON.stringify(cleaned)}`
  }
  return base
}

function createLogger(module = '') {
  return {
    info(msgOrCtx, msg) {
      if (typeof msgOrCtx === 'string') {
        console.log(fmt('info', module, msgOrCtx))
      } else {
        console.log(fmt('info', module, msg, msgOrCtx))
      }
    },
    warn(msgOrCtx, msg) {
      if (typeof msgOrCtx === 'string') {
        console.warn(fmt('warn', module, msgOrCtx))
      } else {
        console.warn(fmt('warn', module, msg, msgOrCtx))
      }
    },
    error(msgOrCtx, msg) {
      if (typeof msgOrCtx === 'string') {
        console.error(fmt('error', module, msgOrCtx))
      } else {
        console.error(fmt('error', module, msg, msgOrCtx))
      }
    },
    debug(msgOrCtx, msg) {
      if (process.env.LOG_LEVEL !== 'debug') return
      if (typeof msgOrCtx === 'string') {
        console.log(fmt('debug', module, msgOrCtx))
      } else {
        console.log(fmt('debug', module, msg, msgOrCtx))
      }
    },
    child(name) {
      return createLogger(module ? `${module}:${name}` : name)
    },
  }
}

export const log = createLogger()

// Pre-created module loggers
export const bot = log.child('BOT')
export const capture = log.child('CAPTURE')
export const llm = log.child('LLM')
export const transcription = log.child('TRANSCRIBE')
export const notes = log.child('NOTES')
