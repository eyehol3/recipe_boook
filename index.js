import 'dotenv/config'
import { createBot } from './bot.js'
import { bot as log } from './helpers/logger.js'

const bot = createBot()

bot.launch()
log.info('Bot started (polling mode)')

// graceful shutdown
process.once('SIGINT', () => {
  log.info('Received SIGINT, shutting down…')
  bot.stop('SIGINT')
})
process.once('SIGTERM', () => {
  log.info('Received SIGTERM, shutting down…')
  bot.stop('SIGTERM')
})
