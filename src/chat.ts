/**
 * Pet chat bridge (MVP) — the host-side forwarder between the browser's chat
 * panel and a local Hermes Agent API server (OpenAI-compatible
 * '/v1/chat/completions'). The pet's "brain" is Hermes: its long-term memory
 * and persona live in the Hermes process; the dsh-pet host only relays
 * messages and streams the reply back.
 *
 * Design (approach A, stateless from Hermes's perspective): the BROWSER owns
 * the conversation history (PetChatPanel keeps the transcript) and sends the
 * full `messages` array on every turn; the host appends a persona system
 * prompt, forwards to Hermes, and pipes the SSE stream (or a non-streaming
 * completion) back through onDelta/onDone callbacks the route wires to the
 * HTTP response as newline-delimited JSON.
 *
 * Security: the Hermes token is read on the host (never sent to the browser)
 * from an explicit config value, the DSH_PET_HERMES_TOKEN env var, or a key
 * file. The upstream endpoint must stay loopback (127.0.0.1 / localhost) — a
 * configured non-loopback endpoint is refused at request time.
 *
 * Degradation: when Hermes is unreachable the route answers a structured
 * error the client turns into a fallback bubble, so a dead Hermes never
 * breaks the pet itself.
 * @module @linxin666/dsh-pet/chat
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One chat turn as the browser sends it (OpenAI message shape). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Resolved chat bridge configuration (defaults applied). */
export interface PetChatConfig {
  /** Master switch; the route answers 409 when off. */
  enabled: boolean
  /** Hermes API server base, e.g. 'http://127.0.0.1:8642'. Must be loopback. */
  endpoint: string
  /** Model id the Hermes server exposes (see GET /v1/models). */
  model: string
  /** Bearer token for the Hermes API server. */
  token: string
  /** Persona system prompt prepended to every turn. */
  persona: string
  /** Hard cap on the forwarded history (messages), oldest dropped first. */
  maxHistory: number
  /** Per-request timeout (ms); the in-flight stream is aborted past it. */
  timeoutMs: number
}

/** Default endpoint: the local Hermes API server. */
export const DEFAULT_CHAT_ENDPOINT = 'http://127.0.0.1:8642'
/** Default model id Hermes exposes. */
export const DEFAULT_CHAT_MODEL = 'hermes-agent'
/** Default persona: a compact companion voice (whale-girl flavored). */
export const DEFAULT_CHAT_PERSONA =
  '你是用户的桌面鲸鱼娘伙伴，住在他的电脑右下角。用轻松、俏皮、简短的中文陪他聊天，' +
  '像会说话的小宠物：有温度、偶尔撒娇、记得他告诉你的事。回答尽量控制在两三句内，' +
  '除非他要求详细。不要自称 AI 助手或模型。'
/** Default history cap (messages) forwarded per turn. */
export const DEFAULT_CHAT_MAX_HISTORY = 20
/** Default per-request timeout (ms). */
export const DEFAULT_CHAT_TIMEOUT_MS = 120_000
/**
 * The Hermes API key lives by default in `token.txt` at the PLUGIN ROOT (next
 * to package.json / lib / assets) — a stable, predictable location that ships
 * with the install rather than an author-specific absolute path. First-time
 * users drop their key there; anyone who keeps it elsewhere points `tokenFile`
 * at their own path (settings.yaml) or uses the env var.
 *
 * Resolved at call time from this module's location: built, this file is
 * <root>/lib/chat.js, so the plugin root is one level up.
 */
export const DEFAULT_TOKEN_FILE_NAME = 'token.txt'
export function defaultTokenFile(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // Source (src/chat.ts) and built (lib/chat.js) are both one level under
    // the plugin root, so .. is the root in both cases.
    return join(here, '..', DEFAULT_TOKEN_FILE_NAME)
  } catch {
    // Fallback (e.g. bundled without a stable import.meta.url): cwd-relative.
    return join(process.cwd(), DEFAULT_TOKEN_FILE_NAME)
  }
}
/** Env var that overrides the token file (highest priority after explicit token). */
export const CHAT_TOKEN_ENV = 'DSH_PET_HERMES_TOKEN'

/** Raw config as the embedding application (or settings) may provide it. */
export interface PetChatRawConfig {
  enabled?: boolean
  endpoint?: string
  model?: string
  token?: string
  tokenFile?: string
  persona?: string
  maxHistory?: number
  timeoutMs?: number
}

/**
 * Read the Hermes token: the explicit config value wins, then the env var,
 * then the key file. Returns undefined when no source yields a token (the
 * route then answers a clear "not configured" error).
 */
export function resolveChatToken(raw: PetChatRawConfig): string | undefined {
  if (typeof raw.token === 'string' && raw.token.trim() !== '') return raw.token.trim()
  const env = process.env[CHAT_TOKEN_ENV]
  if (typeof env === 'string' && env.trim() !== '') return env.trim()
  const file = raw.tokenFile ?? defaultTokenFile()
  try {
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8').trim()
      if (text !== '') return text
    }
  } catch {
    // Unreadable key file: degrade to "not configured" at request time.
  }
  return undefined
}

/** Whether an endpoint URL points at the loopback interface. */
export function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
  } catch {
    return false
  }
}

/** Apply defaults to a raw chat config (token resolved at call time). */
export function resolveChatConfig(raw: PetChatRawConfig = {}): PetChatConfig {
  return {
    enabled: raw.enabled ?? true,
    endpoint: (raw.endpoint ?? DEFAULT_CHAT_ENDPOINT).replace(/\/+$/, ''),
    model: raw.model ?? DEFAULT_CHAT_MODEL,
    token: resolveChatToken(raw) ?? '',
    persona: raw.persona ?? DEFAULT_CHAT_PERSONA,
    maxHistory: raw.maxHistory ?? DEFAULT_CHAT_MAX_HISTORY,
    timeoutMs: raw.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS,
  }
}

/** The messages array to forward: persona first, then the trimmed history. */
export function buildUpstreamMessages(config: PetChatConfig, history: readonly ChatMessage[]): ChatMessage[] {
  const trimmed = history.length > config.maxHistory ? history.slice(history.length - config.maxHistory) : history
  const body: ChatMessage[] = []
  if (config.persona.trim() !== '') body.push({ role: 'system', content: config.persona })
  for (const message of trimmed) {
    if (message.content.trim() === '') continue
    body.push({ role: message.role, content: message.content })
  }
  return body
}

/** Stream callbacks the route wires to the HTTP response. */
export interface ChatStreamCallbacks {
  /** A reply chunk arrived (incremental text). */
  onDelta: (text: string) => void
  /** The reply finished (full text accumulated). */
  onDone: (full: string) => void
  /** A terminal error (network, HTTP, timeout, malformed stream). */
  onError: (message: string) => void
}

/**
 * Forward one turn to Hermes and stream the reply back through `cb`.
 * Always settles: exactly one of onDone/onError fires.
 */
export function forwardChat(
  config: PetChatConfig,
  messages: readonly ChatMessage[],
  cb: ChatStreamCallbacks,
): void {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  const body = JSON.stringify({
    model: config.model,
    messages,
    stream: true,
  })
  fetch(config.endpoint + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + config.token,
    },
    body,
    signal: controller.signal,
  }).then(async (upstream) => {
    if (!upstream.ok || upstream.body === null) {
      let detail = ''
      try {
        detail = (await upstream.text()).slice(0, 300)
      } catch {
        // keep detail empty
      }
      throw new Error('hermes ' + upstream.status + (detail === '' ? '' : ': ' + detail))
    }
    const reader = upstream.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let full = ''
    // Drain the SSE stream. Each 'data: {...}' line is an OpenAI chunk;
    // 'data: [DONE]' ends the stream. Tolerate a non-SSE JSON body by
    // falling back to a single-parse at EOF.
    const parseChunk = (line: string): void => {
      const payload = line.replace(/^data:\s*/, '').trim()
      if (payload === '' || payload === '[DONE]') return
      let json: unknown
      try {
        json = JSON.parse(payload)
      } catch {
        return
      }
      const record = (typeof json === 'object' && json !== null) ? json as Record<string, unknown> : {}
      const choices = Array.isArray(record.choices) ? (record.choices as Array<Record<string, unknown>>) : []
      for (const choice of choices) {
        const delta = (typeof choice.delta === 'object' && choice.delta !== null)
          ? (choice.delta as Record<string, unknown>).content
          : undefined
        if (typeof delta === 'string' && delta !== '') {
          full += delta
          cb.onDelta(delta)
        }
      }
    }
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline: number
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, '')
          buffer = buffer.slice(newline + 1)
          if (line.startsWith('data:')) parseChunk(line)
        }
      }
      const tail = buffer.trim()
      if (tail !== '' && !tail.startsWith('data:')) {
        // Non-SSE fallback: the body was a single JSON completion.
        const json: unknown = JSON.parse(tail)
        const record = (typeof json === 'object' && json !== null) ? json as Record<string, unknown> : {}
        const choices = Array.isArray(record.choices) ? (record.choices as Array<Record<string, unknown>>) : []
        for (const choice of choices) {
          const message = (typeof choice.message === 'object' && choice.message !== null)
            ? (choice.message as Record<string, unknown>).content
            : undefined
          if (typeof message === 'string' && message !== '') {
            full += message
            cb.onDelta(message)
          }
        }
      }
      cb.onDone(full)
    } catch (error) {
      cb.onError(error instanceof Error ? error.message : String(error))
    }
  }, (error: unknown) => {
    if (controller.signal.aborted) {
      cb.onError('hermes timeout after ' + Math.round(config.timeoutMs / 1000) + 's')
    } else {
      cb.onError(error instanceof Error ? error.message : String(error))
    }
  }).finally(() => {
    clearTimeout(timer)
  })
}

/**
 * Liveness probe (GET /health, no auth): the route uses it to give the client
 * a friendly "Hermes offline" bubble instead of a raw network error. Resolves
 * true when the server answers 200.
 */
export async function hermesHealthy(config: PetChatConfig): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(config.endpoint + '/health', { signal: controller.signal })
    clearTimeout(timer)
    return response.ok
  } catch {
    return false
  }
}
