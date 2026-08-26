/**
 * Pet-hermes chat panel — the conversation surface for the Hermes-brained pet.
 * The user types, the panel POSTs the transcript to /api/pet-hermes/chat (the
 * host forwards to a local Hermes Agent), and the streamed reply renders as a
 * typewriter bubble. State lives in the store's chat slice.
 * @module dsh-pet-hermes/client/PetChatPanel
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import clsx from 'clsx'
import type { PetChatMessage, PetChatState, PetStoreInstance } from './pet-store.ts'
import styles from './pet.module.css'

/** Props: store + transport + close callback. */
export interface PetChatPanelProps {
  store: PetStoreInstance
  chatSend: (messages: PetChatMessage[]) => Promise<void>
  /** The pet's CSS `right` inset (px) — the panel offsets from this to follow. */
  petRight: number
  /** The pet's CSS `bottom` inset (px) — the panel aligns its baseline to this. */
  petBottom: number
  /** The pet's rendered pixel width (the panel sits this far to the side). */
  spriteWidth: number
  onClose: () => void
}

/** Hard cap on transcript lines kept in the panel (the host trims too). */
const MAX_LINES = 50
/** Gap between the pet and the panel (px). */
const PANEL_GAP = 14
/** Panel width (px) — must match the CSS `.chatPanel` width. */
const PANEL_WIDTH = 300

export function PetChatPanel(props: PetChatPanelProps): ReactElement {
  const { store, chatSend, petRight, petBottom, spriteWidth, onClose } = props
  const chat: PetChatState = store.getSnapshot().chat

  // Follow the pet: place the panel to its LEFT by default (the pet hugs the
  // right edge, so left is the open space). If there isn't room on the left
  // (pet dragged near the left edge), flip to the RIGHT of the pet instead.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const spaceOnLeft = viewportW - petRight - spriteWidth - PANEL_GAP
  const placeLeft = spaceOnLeft >= PANEL_WIDTH
  const panelRight = placeLeft
    ? petRight + spriteWidth + PANEL_GAP
    : Math.max(0, petRight - PANEL_WIDTH - PANEL_GAP)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Keep the transcript pinned to the newest line as it streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  useEffect(() => {
    if (chat.open) inputRef.current?.focus()
  }, [chat.open])

  const send = (): void => {
    const text = input.trim()
    if (text === '' || chat.streaming) return
    const actions = store.actions
    const history: PetChatMessage[] = [...chat.messages, { role: 'user', content: text }].slice(-MAX_LINES)
    setInput('')
    actions.chatPushUser(text)
    actions.chatStartAssistant()
    void chatSend(history).then(() => {
      const snapshot = store.getSnapshot().chat
      if (snapshot.streaming) actions.chatFinishAssistant()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  const streaming = chat.streaming
  const hermesDown = chat.hermesHealthy === false

  return (
    <div
      className={styles.chatPanel}
      data-testid="pet-hermes-chat-panel"
      style={{ right: panelRight, bottom: petBottom }}
    >
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>鲸鱼娘 · Hermes</span>
        <span className={clsx(styles.chatStatus, hermesDown && styles.chatStatusDown)}>
          {hermesDown ? '大脑离线' : chat.hermesHealthy === true ? '在线' : '…'}
        </span>
        <button type="button" className={styles.chatClose} aria-label="关闭" title="关闭" onClick={onClose}>×</button>
      </div>

      <div className={styles.chatLog} ref={scrollRef}>
        {chat.messages.length === 0 && (
          <div className={styles.chatEmpty}>在这里输入，她会记得你告诉她的事情。</div>
        )}
        {chat.messages.map((message, index) => (
          <div
            key={index}
            className={clsx(
              styles.chatLine,
              message.role === 'user' ? styles.chatLineUser : styles.chatLinePet,
              message.pending && styles.chatLinePending,
            )}
          >
            <span className={styles.chatRole}>{message.role === 'user' ? '你' : '她'}</span>
            <span className={styles.chatText}>
              {message.content}
              {message.pending && <span className={styles.chatCursor}>▍</span>}
            </span>
          </div>
        ))}
        {chat.error !== null && <div className={styles.chatError}>{chat.error}</div>}
      </div>

      <div className={styles.chatInputRow}>
        <input
          ref={inputRef}
          className={styles.chatInput}
          type="text"
          value={input}
          placeholder="说点什么…（Enter 发送，Esc 关闭）"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          maxLength={500}
        />
        <button
          type="button"
          className={styles.chatSend}
          onClick={send}
          disabled={streaming || input.trim() === ''}
        >
          {streaming ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}
