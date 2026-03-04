/**
 * Map service errors to user-friendly Telegram messages.
 * Inspired by LyAdminBot's error-mapper pattern.
 *
 * Returns { userMessage, isTransient } so the error handler knows
 * whether the user needs to take action or just wait.
 */

const PATTERNS = [
  // ── External AI services ──
  {
    test: (msg) => /together\s*ai/i.test(msg) && /5\d\d/.test(msg),
    userMessage: '🔧 Transcription service (Together AI) returned a server error. This is on their side — try again in a minute.',
    isTransient: true,
  },
  {
    test: (msg) => /together\s*ai/i.test(msg) && /4\d\d/.test(msg),
    userMessage: '⚠️ Transcription service rejected the request. Check API key / quota.',
    isTransient: false,
  },
  {
    test: (msg) => /openrouter/i.test(msg) && /5\d\d/.test(msg),
    userMessage: '🔧 LLM service (OpenRouter) is having issues. Try again shortly.',
    isTransient: true,
  },
  {
    test: (msg) => /openrouter/i.test(msg) && /4\d\d/.test(msg),
    userMessage: '⚠️ LLM service rejected the request. Check API key / quota.',
    isTransient: false,
  },
  {
    test: (msg) => /openrouter|openai/i.test(msg) && /rate.?limit/i.test(msg),
    userMessage: '⏳ Rate-limited by the LLM provider. Wait a moment and try again.',
    isTransient: true,
  },

  // ── Telegram-specific ──
  {
    test: (msg) => /message is not modified/i.test(msg),
    // not really an error, just Telegram being strict
    userMessage: null, // swallow silently
    isTransient: true,
  },

  // ── Network / fetch ──
  {
    test: (msg) => /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg),
    userMessage: '🌐 Network issue — couldn\'t reach an external service. Try again.',
    isTransient: true,
  },

  // ── JSON parse (LLM returned garbage) ──
  {
    test: (msg) => /unexpected token|JSON/i.test(msg),
    userMessage: '🤖 The AI returned an unexpected format. Try again.',
    isTransient: true,
  },
]

/**
 * @param {Error} err
 * @returns {{ userMessage: string|null, isTransient: boolean }}
 */
export function mapError(err) {
  const msg = err.message || err.description || String(err)

  for (const pattern of PATTERNS) {
    if (pattern.test(msg)) {
      return { userMessage: pattern.userMessage, isTransient: pattern.isTransient }
    }
  }

  // unknown error — generic fallback
  return {
    userMessage: `Something went wrong.\n\n\`${truncate(msg, 200)}\``,
    isTransient: false,
  }
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str
}
