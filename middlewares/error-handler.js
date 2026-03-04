import { bot as log } from '../helpers/logger.js'
import { mapError } from '../helpers/error-mapper.js'

export const errorHandler = async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    const { userMessage, isTransient } = mapError(err)

    // always log the full error server-side
    if (isTransient) {
      log.warn({ err }, 'Transient error')
    } else {
      log.error({ err }, 'Unhandled error')
    }

    // send user-friendly message (null = swallow silently)
    if (userMessage) {
      try {
        await ctx.reply(userMessage)
      } catch (_) {
        // can't even reply — ignore
      }
    }
  }
}
