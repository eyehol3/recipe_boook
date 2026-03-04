import { Telegraf, session } from 'telegraf'
import { config } from './config.js'
import { errorHandler, auth } from './middlewares/index.js'
import { registerRoutes } from './routes/index.js'

export const createBot = () => {
  const bot = new Telegraf(config.telegramToken)

  // middleware chain (order matters — follows LyAdminBot pattern)
  bot.use(errorHandler)
  bot.use(auth)
  bot.use(session({ defaultSession: () => ({}) }))

  // register all routes
  registerRoutes(bot)

  return bot
}
