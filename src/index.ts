/**
 * dsh-pet-hermes — pet 2.0 (beta), a standalone Hermes-brained desktop pet for
 * the DSH web GUI. Independent of the original @linxin666/dsh-pet: it ships
 * its own (copied) whale-girl sprite assets, a minimal host registry that reads
 * them, the Hermes chat bridge, and a browser client that renders the sprite
 * plus a chat panel wired to a local Hermes Agent.
 *
 * Host half: registers /api/pet-hermes/* routes on the DSH web server:
 *   - GET  /api/pet-hermes/pet         → the pet definition (atlas URL + tracks)
 *   - GET  /api/pet-hermes/chat-status → Hermes liveness probe
 *   - POST /api/pet-hermes/chat        → forward the transcript to Hermes, stream NDJSON back
 *   - GET  /pet-hermes/<file>          → serve the bundled sprite assets
 *
 * The chat brain is a local Hermes Agent (OpenAI-compatible /v1/chat/completions);
 * the token is read on the host (never sent to the browser). See ./chat.ts.
 * @module dsh-pet-hermes
 */

import { existsSync, statSync, realpathSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, sep, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import {
  buildUpstreamMessages,
  forwardChat,
  hermesHealthy,
  isLoopbackEndpoint,
  resolveChatConfig,
  type ChatMessage,
  type PetChatConfig,
  type PetChatRawConfig,
} from './chat.ts'

/** Browser-facing base path of the pet-hermes API + asset routes. */
export const API_PREFIX = '/api/pet-hermes'
export const ASSET_PREFIX = '/pet-hermes'

/** The plugin's own root (the package dir), resolved from this module. */
function packageRoot(): string {
  // lib/index.js (built) or src/index.ts (source) — both sit one level under
  // the package root, so the root is the grandparent of this file.
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..')
}

/** The bundled pet assets directory (assets/pet). */
function assetsDir(): string {
  return join(packageRoot(), 'assets', 'pet')
}

/**
 * Read the bundled pet.json manifest once. Returns the sprite2d geometry the
 * browser needs to render the atlas (frames-per-row + per-track durations +
 * the browser URL of the spritesheet).
 */
interface PetDefinition {
  id: string
  displayName: string
  renderer: 'sprite2d'
  atlasUrl: string
  cell: { width: number; height: number }
  columns: number
  frames: number[]
  tracks: Record<string, { durations: number[] }>
}

let cachedDef: PetDefinition | undefined
function petDefinition(): PetDefinition {
  if (cachedDef !== undefined) return cachedDef
  const manifestFile = join(assetsDir(), 'pet.json')
  const raw = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    id: string
    displayName: string
    renderer: string
    sprite2d: {
      spritesheetPath: string
      frames: number[]
      tracks: Record<string, { durations: number[] }>
      cell?: { width?: number; height?: number }
    }
    columns?: number
  }
  // Atlas geometry. The bundled whale-refined pet.json does NOT carry cell/
  // columns, so fall back to the SAME defaults the original dsh-pet uses for
  // this sprite: DEFAULT_PET_CELL {width:192,height:208} and DEFAULT_PET_COLUMNS 8.
  // (An earlier beta wrongly hardcoded 128x128 / 9 columns, which scaled the
  // atlas to the wrong size and made frames drift left→right each step.)
  const cell = {
    width: raw.sprite2d.cell?.width ?? 192,
    height: raw.sprite2d.cell?.height ?? 208,
  }
  const columns = raw.columns ?? 8
  cachedDef = {
    id: raw.id,
    displayName: raw.displayName,
    renderer: 'sprite2d',
    atlasUrl: ASSET_PREFIX + '/' + raw.sprite2d.spritesheetPath,
    cell,
    columns,
    frames: raw.sprite2d.frames,
    tracks: raw.sprite2d.tracks,
  }
  return cachedDef
}

/** Narrow an unknown value to a chat history message, or undefined. */
function asChatMessage(value: unknown): ChatMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.role !== 'user' && record.role !== 'assistant') return undefined
  if (typeof record.content !== 'string') return undefined
  return { role: record.role, content: record.content }
}

/** Loopback fence: the pet-hermes API is local-only. */
function isLoopback(req: IncomingMessage): boolean {
  const remote = req.socket?.remoteAddress ? String(req.socket.remoteAddress) : ''
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
  res.end(JSON.stringify(body))
}

/** Read a bounded JSON body (null on empty/invalid/overflow). */
async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) { req.destroy(); return null }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try { return JSON.parse(text) } catch { return null }
}

/** GET /api/pet-hermes/pet — the pet definition for the browser. */
function petRoute(ctx: Context): WebRoute {
  return {
    kind: 'exact',
    path: API_PREFIX + '/pet',
    handler: (req, res) => {
      if (!isLoopback(req)) { writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' }); return }
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
      try {
        writeJson(res, 200, petDefinition())
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

/** POST /api/pet-hermes/chat — forward the transcript to Hermes, stream NDJSON back.
 *  Config is read PER REQUEST via getConfig() so edits to settings.yaml apply
 *  live without a DSH restart. */
function chatRoute(getConfig: () => PetChatConfig): WebRoute {
  return {
    kind: 'exact',
    path: API_PREFIX + '/chat',
    handler: (req, res) => {
      const config = getConfig()
      if (!isLoopback(req)) { writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' }); return }
      if (req.method !== 'POST') { writeJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
      if (!config.enabled) { writeJson(res, 409, { ok: false, error: 'chat-disabled' }); return }
      if (!isLoopbackEndpoint(config.endpoint)) { writeJson(res, 400, { ok: false, error: 'chat-endpoint-not-loopback' }); return }
      if (config.token === '') { writeJson(res, 409, { ok: false, error: 'chat-token-missing' }); return }
      void readJsonBody(req, 256 * 1024).then((parsed) => {
        const record = (typeof parsed === 'object' && parsed !== null) ? parsed as Record<string, unknown> : {}
        const rawHistory = Array.isArray(record.messages) ? record.messages : []
        const history: ChatMessage[] = []
        for (const entry of rawHistory) {
          const message = asChatMessage(entry)
          if (message !== undefined) history.push(message)
        }
        if (history.length === 0 || history[history.length - 1]!.role !== 'user') {
          writeJson(res, 400, { ok: false, error: 'chat-needs-user-message' })
          return
        }
        const messages = buildUpstreamMessages(config, history)
        res.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache',
          'x-accel-buffering': 'no',
        })
        const send = (obj: Record<string, unknown>): void => {
          if (res.writableEnded) return
          res.write(JSON.stringify(obj) + '\n')
        }
        let settled = false
        const finish = (obj: Record<string, unknown>): void => {
          if (settled) return
          settled = true
          send(obj)
          res.end()
        }
        forwardChat(config, messages, {
          onDelta: (text) => { send({ delta: text }) },
          onDone: (full) => { finish({ done: true, full }) },
          onError: (message) => { finish({ error: message }) },
        })
        req.on('close', () => { settled = true })
      }, (error) => {
        writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

/** GET /api/pet-hermes/chat-status — Hermes liveness probe (config read per request). */
function chatStatusRoute(getConfig: () => PetChatConfig): WebRoute {
  return {
    kind: 'exact',
    path: API_PREFIX + '/chat-status',
    handler: (req, res) => {
      const config = getConfig()
      if (!isLoopback(req)) { writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' }); return }
      if (req.method !== 'GET') { writeJson(res, 405, { ok: false, error: 'method-not-allowed' }); return }
      void hermesHealthy(config).then((healthy) => {
        writeJson(res, 200, { ok: true, enabled: config.enabled, healthy, endpoint: config.endpoint, model: config.model })
      }, () => {
        writeJson(res, 200, { ok: true, enabled: config.enabled, healthy: false, endpoint: config.endpoint, model: config.model })
      })
    },
  }
}

/**
 * Serve the bundled pet assets (spritesheet.webp, pet.json, previews/*).
 * Path: /pet-hermes/<file> — realpath containment keeps it inside assets/pet.
 */
function assetRoute(): WebRoute {
  const MIME: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.json': 'application/json; charset=utf-8',
  }
  return {
    kind: 'prefix',
    path: ASSET_PREFIX,
    handler: (req, res) => {
      if (!isLoopback(req)) { res.writeHead(403); res.end(); return }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return }
      let pathname: string
      try {
        pathname = new URL(req.url ?? '/', 'http://pet-hermes.local').pathname
      } catch {
        res.writeHead(400); res.end(); return
      }
      const rel = decodeURIComponent(pathname.slice(ASSET_PREFIX.length).replace(/^\/+/, ''))
      if (rel === '' || rel.includes('..')) { res.writeHead(400); res.end(); return }
      const base = assetsDir()
      const file = join(base, rel)
      // realpath containment: refuse symlinks escaping the assets dir.
      let resolved: string
      try {
        const realBase = realpathSync(base)
        resolved = realpathSync(file)
        if (resolved !== realBase && !resolved.startsWith(realBase + sep)) { res.writeHead(403); res.end(); return }
      } catch {
        res.writeHead(404); res.end(); return
      }
      try {
        if (!statSync(resolved).isFile()) { res.writeHead(404); res.end(); return }
      } catch {
        res.writeHead(404); res.end(); return
      }
      const ext = file.endsWith('.') ? file.slice(file.lastIndexOf('.')).toLowerCase() : ''
      void readFile(resolved).then((body) => {
        res.writeHead(200, {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'content-length': String(body.byteLength),
          'cache-control': 'no-cache',
        })
        if (req.method === 'HEAD') { res.end(); return }
        res.end(body)
      }, () => { res.writeHead(404); res.end() })
    },
  }
}

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'pet-hermes'

/** Services required before the pet-hermes can mount its surfaces. */
export const inject = ['webServer']

/** Settings namespace pet-hermes owns in settings.yaml (the `pet-hermes:` block). */
const SETTINGS_NS = 'pet-hermes'

/**
 * The settings.yaml surface for pet-hermes. Each field is optional with a
 * default (see chat.ts), so an empty/absent block resolves to the out-of-the-box
 * local-Hermes config. `token` is deliberately NOT a settings field: the key
 * stays in a file / env var (never written into settings.yaml, which is more
 * likely to be shared/committed). Edit `tokenFile` to point at a different key.
 */
function makeSettingsSchema() {
  return z.object({
    enabled: z.boolean().default(true),
    endpoint: z.string().default('http://127.0.0.1:8642'),
    model: z.string().default('hermes-agent'),
    // Empty by default = use the built-in default (token.txt at the plugin
    // root). Set an absolute path here to read the key from elsewhere.
    tokenFile: z.string().default(''),
    persona: z.string().default(''),
    // schemastery's number() has no .int() (that's a zod API) — .step(1) is the
    // integer constraint here (matches the original dsh-pet settings schema).
    maxHistory: z.number().step(1).min(1).max(200).default(20),
    timeoutMs: z.number().step(1).min(1000).max(600000).default(120000),
  })
}

type PetHermesSettings = {
  enabled: boolean
  endpoint: string
  model: string
  tokenFile: string
  persona: string
  maxHistory: number
  timeoutMs: number
}

/**
 * Register the pet-hermes routes + a settings.yaml section. The chat config is
 * resolved PER REQUEST from the live settings scope (so editing settings.yaml
 * applies without a DSH restart), falling back to the plugin's defaults.
 */
export function apply(ctx: Context, config: { chat?: PetChatRawConfig } = {}): void {
  // The authoritative chat config: current settings scope value (when present)
  // merged over the defaults. Read fresh on every request via this thunk.
  let current: () => PetHermesSettings = () => defaultSettings
  const defaultSettings: PetHermesSettings = {
    enabled: true,
    endpoint: 'http://127.0.0.1:8642',
    model: 'hermes-agent',
    tokenFile: '',
    persona: '',
    maxHistory: 20,
    timeoutMs: 120000,
  }
  const getConfig = (): PetChatConfig => {
    const s = current()
    return resolveChatConfig({
      enabled: s.enabled,
      endpoint: s.endpoint,
      model: s.model,
      // Empty tokenFile = fall back to the built-in default (token.txt at the
      // plugin root); a non-empty value points at the user's own key file.
      ...(s.tokenFile && s.tokenFile.trim() !== '' ? { tokenFile: s.tokenFile } : {}),
      // persona: empty in settings means "use the built-in whale-girl persona".
      ...(s.persona && s.persona.trim() !== '' ? { persona: s.persona } : {}),
      maxHistory: s.maxHistory,
      timeoutMs: s.timeoutMs,
    })
  }

  const routes: WebRoute[] = [
    petRoute(ctx),
    chatRoute(getConfig),
    chatStatusRoute(getConfig),
    assetRoute(),
  ]
  for (const route of routes) {
    ctx.webServer.register(route)
  }

  // Expose the config in settings.yaml under `pet-hermes:`. The composition
  // entry (defaults) is the base layer; while a settings service is attached,
  // the resolved scope wins. Editing the block live-updates getConfig().
  installSettingsSection(
    ctx,
    settingsNamespace(SETTINGS_NS),
    makeSettingsSchema(),
    defaultSettings,
    {
      setSource: (source) => { current = source },
      onChange: () => {
        // Nothing else to re-judge: getConfig() reads `current` per request, so
        // a committed settings change is picked up on the next chat call.
      },
    },
  )
}
