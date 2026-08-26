/**
 * dsh-pet-hermes client half — mounts the Hermes-brained pet as a global
 * floating surface (a React root on document.body, like the original pet),
 * fetches the pet definition from /api/pet-hermes/pet, renders the sprite,
 * and wires the chat panel to the /api/pet-hermes/chat bridge (SSE-style
 * NDJSON streamed reply).
 * @module dsh-pet-hermes/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createPetHermesStore, type PetChatMessage, type PetStoreInstance } from './pet-store.ts'
import { PetHermesEntry } from './PetHermesEntry.tsx'

/**
 * Services the client injects. Empty on purpose: the pet-hermes client is
 * self-contained — the store comes from importing
 * '@deepseek-ai/dsh-client-runtime/client' (a module, not an injectable
 * cordis service), fetch is same-origin, and React mounts via createRoot.
 * Declaring a service name DSH does not register (e.g. 'runtime') leaves the
 * entry pending and fails the whole web boot, so we inject nothing.
 */
export const inject: string[] = []

/** Re-exported for consumers typing against the client face. */
export type { PetStoreInstance, PetChatMessage } from './pet-store.ts'
export type { PetHermesEntryProps } from './PetHermesEntry.tsx'

/**
 * Send one chat turn to the host bridge and stream the reply into the store.
 * The host answers newline-delimited JSON: {'delta':text} chunks, then a
 * terminal {'done':true} or {'error':...}.
 */
async function sendChat(store: PetStoreInstance, messages: PetChatMessage[]): Promise<void> {
  const actions = store.actions
  try {
    const response = await fetch('/api/pet-hermes/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
    if (!response.ok || response.body === null) {
      let detail = ''
      try {
        const payload = (await response.json()) as { error?: string }
        detail = payload.error ?? ''
      } catch {
        // keep detail empty
      }
      actions.chatError(detail === '' ? 'chat ' + response.status : detail)
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line.trim() === '') continue
        let json: Record<string, unknown>
        try {
          json = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue
        }
        if (typeof json.delta === 'string') {
          actions.chatAppendDelta(json.delta)
        } else if (json.done === true) {
          actions.chatFinishAssistant()
          return
        } else if (typeof json.error === 'string') {
          actions.chatError(json.error)
          return
        }
      }
    }
    if (store.getSnapshot().chat.streaming) actions.chatFinishAssistant()
  } catch (error) {
    actions.chatError(error instanceof Error ? error.message : String(error))
  }
}

/** Probe Hermes liveness for the chat panel's status line. */
async function probeStatus(store: PetStoreInstance): Promise<void> {
  try {
    const response = await fetch('/api/pet-hermes/chat-status', {})
    if (!response.ok) return
    const payload = (await response.json()) as { healthy?: boolean; enabled?: boolean }
    store.actions.setChatHermes(payload.enabled === false ? false : payload.healthy === true)
  } catch {
    // Route absent (host not loaded) or network error: stay unknown.
  }
}

/**
 * Client plugin body: create one store instance, mount the global pet entry
 * on document.body via a React root, fetch the definition, probe Hermes.
 * The pet is host-global (no session dimension), so it mounts directly on
 * body — the same reason the original pet avoids a session-scoped slot.
 */
export function apply(ctx: ClientContext): void {
  void ctx // reserved for future slot/registry hooks
  const store: PetStoreInstance = createPetHermesStore().create()

  // Fetch the pet definition + probe Hermes liveness.
  void fetch('/api/pet-hermes/pet', {}).then((response) => {
    if (!response.ok) return
    return response.json()
  }).then((definition) => {
    if (definition && typeof definition === 'object') {
      store.actions.setDefinition(definition)
    }
  }, () => {
    // Host route absent (e.g. isolation without host): the entry renders a
    // placeholder so the pet still mounts for UI verification.
  })
  void probeStatus(store)

  // Mount the global entry on document.body (single React root).
  const container = document.createElement('div')
  container.dataset.dshPetHermesRoot = ''
  container.dataset.dshPlugin = 'pet-hermes'
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(createElement(PetHermesEntry, {
    store,
    chatSend: (messages: PetChatMessage[]) => sendChat(store, messages),
  }))

  // Tear down on context disposal (hot reload / fiber disposal).
  ctx.effect(() => () => {
    root.unmount()
    container.remove()
  }, 'pet-hermes: client lifecycle')
}
