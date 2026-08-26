/**
 * Pet-hermes sprite — renders the bundled whale-girl sprite2d atlas as a
 * fixed-position floating pet. Plays the active animation track (CSS
 * background-position frame stepping, driven by requestAnimationFrame) and
 * exposes the interaction surface: click to open the chat panel, a small
 * control to hide/show. Self-contained: reads the atlas geometry from the
 * store's definition (fetched from /api/pet-hermes/pet).
 * @module dsh-pet-hermes/client/PetSprite
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { PetDefinition, PetStoreInstance } from './pet-store.ts'
import styles from './pet.module.css'

/** The pet's on-screen anchor (CSS right/bottom insets, px). */
export interface PetPosition {
  right: number
  bottom: number
}

/** The 9 animation rows, in atlas order (matches pet.json `frames`). */
const ROW_ORDER = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
] as const

export interface PetSpriteProps {
  store: PetStoreInstance
  definition: PetDefinition
  onOpenChat: () => void
  onHide: () => void
  /** Report the pet's live anchor (right/bottom) so the chat panel can follow it. */
  onPositionChange?: (pos: PetPosition) => void
  /** The rendered sprite's pixel width (the panel offsets itself by this). */
  spriteWidth?: number
}

/** Background-position (px) of one frame within the scaled atlas. */
function framePosition(cell: { width: number; height: number }, row: number, col: number, scale: number): string {
  const x = -(col * cell.width * scale)
  const y = -(row * cell.height * scale)
  return x + 'px ' + y + 'px'
}

export function PetSprite(props: PetSpriteProps): ReactElement | null {
  const { store, definition, onOpenChat, onHide } = props
  const [position, setPosition] = useState<PetPosition>({ right: 32, bottom: 56 })
  const [anim, setAnim] = useState<string>('idle')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const spriteRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origRight: number; origBottom: number; moved: boolean } | null>(null)

  // Display size: scale the cell to a 160px-tall pet.
  const scale = 160 / definition.cell.height
  const cellW = definition.cell.width * scale
  const cellH = definition.cell.height * scale

  // Report the pet's live anchor + rendered size so the chat panel can follow
  // it. Fires on mount and whenever the pet is dragged (position changes).
  useEffect(() => {
    if (props.onPositionChange) props.onPositionChange({ ...position })
  }, [position, props.onPositionChange])

  // Frame loop: step through the active track's frames by its durations.
  useEffect(() => {
    const row = ROW_ORDER.indexOf(anim as (typeof ROW_ORDER)[number])
    if (row < 0) return
    const frames = definition.frames[row] ?? 1
    const durations = definition.tracks[anim]?.durations ?? [500]
    let frame = 0
    let elapsed = 0
    let last = performance.now()
    let raf = 0
    const tick = (): void => {
      const now = performance.now()
      const delta = now - last
      last = now
      elapsed += delta
      const duration = durations[frame % durations.length] ?? 500
      if (elapsed >= duration) {
        elapsed -= duration
        frame = (frame + 1) % frames
        const el = spriteRef.current
        if (el !== null) el.style.backgroundPosition = framePosition(definition.cell, row, frame, scale)
      }
      raf = requestAnimationFrame(tick)
    }
    // Set the first frame immediately.
    const el = spriteRef.current
    if (el !== null) el.style.backgroundPosition = framePosition(definition.cell, row, 0, scale)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anim, definition, scale])

  // Drifting idle motion: the pet gently bobs; occasionally flips direction.
  // (Kept minimal for the beta — no full wandering AI.)
  useEffect(() => {
    const timer = window.setInterval(() => {
      // Cycle a couple of ambient tracks so the pet feels alive.
      setAnim((current) => {
        if (current === 'idle') return Math.random() < 0.25 ? 'waving' : 'idle'
        return 'idle'
      })
    }, 6000)
    return () => window.clearInterval(timer)
  }, [])

  const onPointerDown = (e: React.PointerEvent): void => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origRight: position.right, origBottom: position.bottom, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current
    if (drag === null) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true
    setPosition({
      right: Math.max(0, drag.origRight - dx),
      bottom: Math.max(0, drag.origBottom - dy),
    })
  }
  const onPointerUp = (): void => {
    dragRef.current = null
  }
  const onClick = (): void => {
    // A drag still fires a trailing click; only open chat on a real tap.
    if (dragRef.current === null) onOpenChat()
  }

  const float = (
    <div
      ref={containerRef}
      className={styles.float}
      style={{ right: position.right, bottom: position.bottom }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className={styles.spriteWrap}>
        <div
          ref={spriteRef}
          className={styles.sprite}
          style={{
            width: cellW,
            height: cellH,
            backgroundImage: 'url(' + definition.atlasUrl + ')',
            backgroundSize: (definition.cell.width * definition.columns * scale) + 'px ' + (definition.cell.height * ROW_ORDER.length * scale) + 'px',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: framePosition(definition.cell, 0, 0, scale),
            cursor: 'grab',
          }}
          onPointerDown={onPointerDown}
          onClick={onClick}
          role="button"
          aria-label={definition.displayName}
        />
        <button
          type="button"
          className={styles.closeButton}
          aria-label="隐藏"
          title="隐藏"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onHide() }}
        >
          ×
        </button>
        {/* Chat affordance: a small speech bubble hint when hovering. */}
        <button
          type="button"
          className={styles.chatHint}
          aria-label="对话"
          title="和鲸鱼娘对话"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpenChat() }}
        >
          💬
        </button>
      </div>
    </div>
  )

  return createPortal(float, document.body)
}
