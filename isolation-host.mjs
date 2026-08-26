/**
 * Isolation verification host for dsh-pet-hermes (pet 2.0 beta) — loads the
 * WORKSPACE BUILD (lib/index.js) WITHOUT touching the real DSH install or the
 * original @linxin666/dsh-pet. It provides a stub cordis Context so the new
 * plugin's apply() registers its /api/pet-hermes/* routes, then serves them on
 * a real port so we can verify:
 *
 *   GET  /api/pet-hermes/pet         → pet definition (atlas + tracks)
 *   GET  /api/pet-hermes/chat-status → Hermes liveness
 *   POST /api/pet-hermes/chat        → forward to Hermes, stream NDJSON back
 *   GET  /pet-hermes/<file>          → the bundled sprite assets
 *
 * Run:  node isolation-host.mjs   →  http://127.0.0.1:8811
 */

import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const LIB = path.join(ROOT, 'lib')
const PORT = Number(process.env.PET_HERMES_VERIFY_PORT || 8811)
const HOST = '127.0.0.1'

// Stub cordis Context: the new plugin's apply() only needs webServer.register.
const routes = new Map()
const registered = []
const webServer = {
  register(route) {
    registered.push(route)
    if (route.kind === 'prefix') routes.set('prefix:' + route.path, route)
    else routes.set(route.path, route)
    return () => {
      if (route.kind === 'prefix') routes.delete('prefix:' + route.path)
      else routes.delete(route.path)
    }
  },
}
const ctx = {
  webServer,
  // installSettingsSection probes ctx.inject to check the settings service is
  // present; the isolation host has no settings service, so report "absent"
  // (null) — the section then falls back to the composition entry (defaults),
  // which is exactly what we want to verify the chat bridge against.
  inject: () => null,
  effect(fn, _label) {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  get: () => undefined,
  log: (...a) => console.log('[pet-hermes]', ...a),
  error: (...a) => console.error('[pet-hermes]', ...a),
}

// Load the workspace host half and run apply().
try {
  const mod = await import(pathToFileURL(path.join(LIB, 'index.js')).href)
  if (typeof mod.apply !== 'function') {
    console.error('lib/index.js did not export apply()')
    process.exit(1)
  }
  mod.apply(ctx, {})
  console.log('[isolation] dsh-pet-hermes apply() OK; registered routes:')
  for (const r of registered) console.log('   ', r.kind, r.path)
} catch (error) {
  console.error('[isolation] FAILED to load/run dsh-pet-hermes host:', error)
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0]

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      '<!doctype html><meta charset="utf-8"><title>pet 2.0 beta 隔离验证</title>' +
      '<body style="background:#05070f;color:#e6ebf8;font-family:monospace;padding:24px">' +
      '<h2>dsh-pet-hermes (pet 2.0 beta) · host 隔离验证</h2>' +
      '<p>已加载工作区 <code>lib/index.js</code>，注册 ' + registered.length + ' 条路由。原 dsh-pet 未触碰。</p>' +
      '<h3>测试</h3><pre>' +
      'curl http://' + HOST + ':' + PORT + '/api/pet-hermes/pet\n' +
      'curl http://' + HOST + ':' + PORT + '/api/pet-hermes/chat-status\n' +
      'curl -X POST http://' + HOST + ':' + PORT + '/api/pet-hermes/chat \\\n' +
      "  -H 'content-type: application/json' \\\n" +
      '  -d \'{"messages":[{"role":"user","content":"你好，你记得我吗？"}]}\'' +
      '</pre></body>'
    )
    return
  }

  const exact = routes.get(url)
  if (exact && exact.kind !== 'prefix') { exact.handler(req, res); return }
  for (const route of routes.values()) {
    if (route.kind === 'prefix' && url.startsWith(route.path)) { route.handler(req, res); return }
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found: ' + url)
})

server.listen(PORT, HOST, () => {
  console.log('[isolation] dsh-pet-hermes host-verify on http://' + HOST + ':' + PORT)
  console.log('[isolation] real DSH + original dsh-pet are NOT touched')
})
