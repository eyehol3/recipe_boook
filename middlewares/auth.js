import { config } from '../config.js'

export const auth = (ctx, next) => {
  if (ctx.chat.id !== config.allowedChatId) {
    return // silently ignore unauthorized users
  }
  return next()
}
