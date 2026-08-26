/**
 * Browser-side store for the pet-hermes client: the pet definition (atlas
 * geometry from /api/pet-hermes/pet) plus the chat transcript + panel state.
 * Written only through the store's actions; components read snapshots.
 * @module dsh-pet-hermes/client/pet-store
 */

import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { EngineStoreHandle, EngineStoreInstance } from '@deepseek-ai/dsh-client-runtime/client'

/** The pet definition the host serves (atlas geometry + tracks). */
export interface PetDefinition {
  id: string
  displayName: string
  renderer: 'sprite2d'
  atlasUrl: string
  cell: { width: number; height: number }
  columns: number
  frames: number[]
  tracks: Record<string, { durations: number[] }>
}

/** One line in the chat transcript (the browser owns the history). */
export interface PetChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** True while the assistant line is still streaming in. */
  pending?: boolean
}

/** Chat UI state. */
export interface PetChatState {
  open: boolean
  messages: PetChatMessage[]
  streaming: boolean
  hermesHealthy: boolean | null
  error: string | null
}

/** Client UI state. */
export interface PetHermesState {
  /** The pet definition; null before the first fetch. */
  definition: PetDefinition | null
  /** Whether the pet is visible. */
  visible: boolean
  /** The chat transcript + panel state. */
  chat: PetChatState
}

/** Store write set. */
export type PetHermesActions = {
  setDefinition: (draft: PetHermesState, definition: PetDefinition) => void
  setVisible: (draft: PetHermesState, visible: boolean) => void
  setChatOpen: (draft: PetHermesState, open: boolean) => void
  chatPushUser: (draft: PetHermesState, text: string) => void
  chatStartAssistant: (draft: PetHermesState) => void
  chatAppendDelta: (draft: PetHermesState, text: string) => void
  chatFinishAssistant: (draft: PetHermesState) => void
  chatError: (draft: PetHermesState, error: string) => void
  setChatHermes: (draft: PetHermesState, healthy: boolean | null) => void
  chatClear: (draft: PetHermesState) => void
}

/** Create the store handle (apply world only). */
export function createPetHermesStore(): EngineStoreHandle<PetHermesState, PetHermesActions> {
  return defineStore({
    init: (): PetHermesState => ({
      definition: null,
      visible: true,
      chat: {
        open: false,
        messages: [],
        streaming: false,
        hermesHealthy: null,
        error: null,
      },
    }),
    actions: {
      setDefinition: (draft, definition) => {
        draft.definition = definition
      },
      setVisible: (draft, visible) => {
        draft.visible = visible
      },
      setChatOpen: (draft, open) => {
        draft.chat.open = open
        if (!open) draft.chat.error = null
      },
      chatPushUser: (draft, text) => {
        draft.chat.error = null
        draft.chat.messages = [...draft.chat.messages, { role: 'user', content: text }]
      },
      chatStartAssistant: (draft) => {
        draft.chat.streaming = true
        draft.chat.error = null
        draft.chat.messages = [...draft.chat.messages, { role: 'assistant', content: '', pending: true }]
      },
      chatAppendDelta: (draft, text) => {
        const messages = draft.chat.messages
        const last = messages[messages.length - 1]
        if (last === undefined || last.role !== 'assistant') return
        draft.chat.messages = [...messages.slice(0, -1), { ...last, content: last.content + text }]
      },
      chatFinishAssistant: (draft) => {
        const messages = draft.chat.messages
        const last = messages[messages.length - 1]
        if (last !== undefined && last.role === 'assistant') {
          draft.chat.messages = [...messages.slice(0, -1), { role: 'assistant', content: last.content }]
        }
        draft.chat.streaming = false
      },
      chatError: (draft, error) => {
        draft.chat.error = error
        draft.chat.streaming = false
        const messages = draft.chat.messages
        const last = messages[messages.length - 1]
        if (last !== undefined && last.role === 'assistant' && last.pending && last.content === '') {
          draft.chat.messages = messages.slice(0, -1)
        }
      },
      setChatHermes: (draft, healthy) => {
        draft.chat.hermesHealthy = healthy
      },
      chatClear: (draft) => {
        draft.chat.messages = []
        draft.chat.error = null
      },
    },
  })
}

export type PetStoreInstance = EngineStoreInstance<PetHermesState, PetHermesActions>
