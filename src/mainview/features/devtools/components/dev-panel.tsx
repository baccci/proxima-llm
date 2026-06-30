import { motion, useDragControls, useMotionValue } from 'motion/react'
import React from 'react'
import { Logo } from '@/components/logo'
import { useDevtoolsStore } from '../store/devtools.store'
import { AppearanceSection } from './sections/appearance-section'
import { CompactionSection } from './sections/compaction-section'

const MIN_VISIBLE = 48
const DEFAULT_POS = { x: 16, y: 80 }

function GripDots() {
  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {['a', 'b', 'c', 'd', 'e', 'f'].map((k) => (
        <span key={k} className="h-[2px] w-[2px] rounded-full bg-subtle" />
      ))}
    </div>
  )
}

function clampToViewport(pos: { x: number; y: number }): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - MIN_VISIBLE)
  const maxY = Math.max(0, window.innerHeight - MIN_VISIBLE)
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  }
}

export function DevPanel() {
  const isOpen = useDevtoolsStore((s) => s.isOpen)
  const toggle = useDevtoolsStore((s) => s.toggle)
  const position = useDevtoolsStore((s) => s.position)
  const setPosition = useDevtoolsStore((s) => s.setPosition)
  const constraintRef = React.useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  // Clamp the persisted position on mount — a window resized smaller between
  // sessions could otherwise strand the panel offscreen with no way back.
  const initial = React.useRef(clampToViewport(position)).current
  const x = useMotionValue(initial.x)
  const y = useMotionValue(initial.y)

  const handleDragStart = () => {
    document.body.style.userSelect = 'none'
  }

  const handleDragEnd = () => {
    document.body.style.userSelect = ''
    setPosition(clampToViewport({ x: x.get(), y: y.get() }))
  }

  const startDrag = (e: React.PointerEvent) => dragControls.start(e)

  const resetPosition = () => {
    x.set(DEFAULT_POS.x)
    y.set(DEFAULT_POS.y)
    setPosition(DEFAULT_POS)
  }

  return (
    <>
      <div ref={constraintRef} className="fixed inset-0 pointer-events-none" aria-hidden />
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={constraintRef}
        style={{ x, y, position: 'fixed', zIndex: 9999 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="select-none"
      >
        {isOpen ? (
          <div className="w-52 rounded-xl bg-black/90 border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle, not a keyboard control */}
            <div
              onPointerDown={startDrag}
              onDoubleClick={resetPosition}
              className="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing"
              title="Drag to move · double-click to reset"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-floating-foreground tracking-wide">
                <Logo width={12} />
                Dev Tools
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggle}
                className="text-white/40 hover:text-white text-xs leading-none cursor-pointer transition-colors"
                aria-label="Close dev panel"
              >
                ✕
              </button>
            </div>
            <CompactionSection />
            <AppearanceSection />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={toggle}
              className="w-9 h-9 rounded-full border border-subtle bg-background text-foreground shadow-lg flex items-center justify-center hover:brightness-105 cursor-pointer transition-[filter]"
              aria-label="Open dev panel"
            >
              <Logo width={20} />
            </button>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle, not a keyboard control */}
            <div
              onPointerDown={startDrag}
              onDoubleClick={resetPosition}
              title="Drag to move · double-click to reset"
              className="flex h-3.5 w-9 items-center justify-center gap-[3px] rounded-full border border-subtle bg-background shadow cursor-grab active:cursor-grabbing"
            >
              <GripDots />
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
