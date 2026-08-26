/**
 * Pet-hermes global entry — composes the floating sprite and the chat panel.
 * While visible it renders the PetSprite (a portal onto body); while hidden
 * it renders a fixed-position summon button so the pet can always come back.
 * The chat panel opens beside the sprite when the user taps the pet or the
 * chat hint.
 * @module dsh-pet-hermes/client/PetHermesEntry
 */

import { useCallback, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { PetStoreInstance } from './pet-store.ts'
import { PetSprite, type PetPosition } from './PetSprite.tsx'
import { PetChatPanel } from './PetChatPanel.tsx'
import styles from './pet.module.css'

export interface PetHermesEntryProps {
  store: PetStoreInstance
  chatSend: (messages: { role: 'user' | 'assistant'; content: string }[]) => Promise<void>
}

export function PetHermesEntry(props: PetHermesEntryProps): ReactElement {
  const { store, chatSend } = props
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { definition, visible, chat } = state
  // The pet's live anchor, reported by PetSprite as it is dragged. The chat
  // panel follows this so it stays beside the pet wherever it is dropped.
  const [petPos, setPetPos] = useState<PetPosition | null>(null)
  const handlePosition = useCallback((pos: PetPosition) => { setPetPos(pos) }, [])

  if (!visible) {
    return (
      <button
        type="button"
        className={styles.summon}
        style={{ position: 'fixed', right: 32, bottom: 56, zIndex: 2147483000 }}
        onClick={() => store.actions.setVisible(true)}
        data-testid="pet-hermes-summon"
      >
        🐋 召唤鲸鱼娘
      </button>
    )
  }

  if (definition === null) {
    // Definition not loaded yet (host route absent or in flight): a quiet
    // placeholder so the mount is visible during verification.
    return (
      <div
        className={styles.summon}
        style={{ position: 'fixed', right: 32, bottom: 56, zIndex: 2147483000, cursor: 'default' }}
        data-testid="pet-hermes-loading"
      >
        鲸鱼娘正在赶来…
      </div>
    )
  }

  const spriteWidth = Math.round((definition.cell.width * 160) / definition.cell.height)

  return (
    <span data-pet-hermes-dock data-testid="pet-hermes-dock">
      <PetSprite
        store={store}
        definition={definition}
        onOpenChat={() => store.actions.setChatOpen(true)}
        onHide={() => store.actions.setVisible(false)}
        onPositionChange={handlePosition}
        spriteWidth={spriteWidth}
      />
      {chat.open && petPos !== null && (
        <PetChatPanel
          store={store}
          chatSend={chatSend}
          petRight={petPos.right}
          petBottom={petPos.bottom}
          spriteWidth={spriteWidth}
          onClose={() => store.actions.setChatOpen(false)}
        />
      )}
    </span>
  )
}
