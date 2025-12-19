import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import type { TimelineSequenceRef } from '../bytecode.ts'
import { compileTimelineNotation } from '../timeline/compiler.ts'
import { useTheme } from './theme.ts'
import {
  type CompiledTimeline,
  evalCompiledTimelineAtBeat,
  parseCompiledTimeline,
} from './timeline-history.ts'
import type { TimelineWindow } from './ui.tsx'

type MinimapScrollbarProps = {
  audioContext?: AudioContext | null
  bpmValue?: Float32Array
  globalSampleCount?: Int32Array
  timelineRefs?: TimelineSequenceRef[]
  seekToSample: (targetSampleCount: number) => void
  timelineWindowRef: React.RefObject<TimelineWindow>
}

const MINIMAP_PHRASE_COUNT = 128
const MINIMAP_PHRASE_SECONDS = 2
const MINIMAP_MINOR_STEP = 4
const MINIMAP_MAJOR_STEP = 16

export function MinimapScrollbar({
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  seekToSample,
  timelineWindowRef,
}: MinimapScrollbarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const timelineCacheRef = useRef<Map<number, {
    sequence: string
    width: number
    bpm: number
    tl: CompiledTimeline | null
    vByX: Float32Array
  }>>(new Map())

  const theme = useTheme()
  const colors = useMemo(() => {
    return [
      theme.colors.keyword,
      theme.colors.string,
      theme.colors.number,
      theme.colors.function,
      theme.colors.parameter,
      theme.colors.argument,
      theme.colors.comment,
      theme.colors.operator,
      theme.colors.punctuation,
    ]
  }, [theme])

  const currentSampleRef = useRef(0)

  const seekFromPointer = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || !audioContext) return

    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    if (width <= 0) return

    const relativeX = clientX - rect.left
    const clampedRatio = Math.max(0, Math.min(1, relativeX / width))
    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (MINIMAP_PHRASE_SECONDS * 60) / bpm
    const phraseLengthSeconds = MINIMAP_PHRASE_SECONDS * barLengthSeconds
    const totalSeconds = phraseLengthSeconds * MINIMAP_PHRASE_COUNT
    const totalSamples = Math.max(1, Math.floor(totalSeconds * audioContext.sampleRate))
    const targetSampleCount = Math.max(0, Math.floor(clampedRatio * totalSamples))
    currentSampleRef.current = targetSampleCount
    seekToSample(targetSampleCount)
  }, [audioContext, bpmValue, seekToSample])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    isDraggingRef.current = true
    seekFromPointer(event.clientX)
    const listener = (e: PointerEvent) => {
      handlePointerMove(e)
    }
    window.addEventListener('pointermove', listener)
    window.addEventListener('pointerup', () => {
      window.removeEventListener('pointermove', listener)
      isDraggingRef.current = false
    }, { once: true })
  }, [seekFromPointer])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isDraggingRef.current) return
    event.preventDefault()
    seekFromPointer(event.clientX)
  }, [seekFromPointer])

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio

    ctx.scale(pixelRatio, pixelRatio)

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (MINIMAP_PHRASE_SECONDS * 60) / bpm
    const phraseLengthSeconds = MINIMAP_PHRASE_SECONDS * barLengthSeconds
    const totalSeconds = phraseLengthSeconds * MINIMAP_PHRASE_COUNT
    const sampleRate = audioContext?.sampleRate ?? 44100
    const totalSamples = Math.max(1, Math.floor(totalSeconds * sampleRate))

    const windowData = timelineWindowRef.current
    const startRatio = Math.max(0, Math.min(1, windowData.windowStartTime / totalSeconds))
    const endRatio = Math.max(0, Math.min(1, windowData.windowEndTime / totalSeconds))
    const viewportWidth = Math.max(0, width * (endRatio - startRatio))

    // Timeline overlays across the whole minimap (0..totalSeconds).
    // Draw them before the viewport tint so the viewport remains readable.
    if (timelineRefs && timelineRefs.length > 0 && audioContext) {
      const chartTop = 18
      const chartHeight = Math.max(1, height - chartTop - 2)
      const beatsPerSecond = bpm / 60

      const seenSeqs = new Set<number>()
      let colorIndex = 0

      for (const ref of timelineRefs) {
        const seqIndex = ref.seqIndex
        if (seenSeqs.has(seqIndex)) continue
        seenSeqs.add(seqIndex)

        const cached = timelineCacheRef.current.get(seqIndex)
        const canUseCached = cached
          && cached.sequence === ref.sequence
          && cached.width === width
          && cached.bpm === bpm

        let tl = cached?.tl ?? null
        let vByX = cached?.vByX
        if (!canUseCached) {
          const compiled = compileTimelineNotation(ref.sequence)
          tl = parseCompiledTimeline(compiled.bytecode)
          vByX = new Float32Array(width + 1)

          if (tl) {
            for (let px = 0; px <= width; px++) {
              const tt = width > 0 ? px / width : 0
              const timeSeconds = tt * totalSeconds
              const beatAbs = timeSeconds * beatsPerSecond
              vByX[px] = evalCompiledTimelineAtBeat(tl, beatAbs)
            }
          }

          timelineCacheRef.current.set(seqIndex, {
            sequence: ref.sequence,
            width,
            bpm,
            tl,
            vByX,
          })
        }

        if (!tl || !vByX) continue

        const color = colors[colorIndex % colors.length]
        colorIndex++

        ctx.strokeStyle = color
        ctx.lineWidth = 1.35

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, chartTop, width, chartHeight)
        ctx.clip()
        ctx.beginPath()

        for (let px = 0; px <= width; px++) {
          const v = vByX[px]!
          const y = chartTop + (1 - v) * (chartHeight - 2) + 1
          if (px === 0) ctx.moveTo(px, y)
          else ctx.lineTo(px, y)
        }
        ctx.stroke()
        ctx.restore()
      }
    }

    if (viewportWidth > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.fillRect(width * startRatio, 0, viewportWidth, height)
    }

    for (let phraseIndex = 0; phraseIndex <= MINIMAP_PHRASE_COUNT; phraseIndex += MINIMAP_MINOR_STEP) {
      const x = (phraseIndex / MINIMAP_PHRASE_COUNT) * width
      const isMajor = phraseIndex % MINIMAP_MAJOR_STEP === 0
      // Draw a small phrase number above the major marker
      ctx.fillStyle = isMajor ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.35)'
      ctx.font = isMajor ? '8pt Inter' : '6pt Inter'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const phraseNumber = String(phraseIndex + 1)
      // place label a few pixels from the top-left of the marker
      ctx.fillText(phraseNumber, x + 5, 10)
      if (phraseIndex === 0 || phraseIndex === MINIMAP_PHRASE_COUNT) continue
      ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    if (!isDraggingRef.current) {
      currentSampleRef.current = globalSampleCount ? Math.max(0, Atomics.load(globalSampleCount, 0)) : 0
    }
    const currentRatio = currentSampleRef.current / totalSamples
    const playheadX = currentRatio * width + 1

    ctx.strokeStyle = 'rgba(255, 220, 0, 0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 220, 0, 0.2)'
    ctx.fillRect(Math.max(0, playheadX - 1.5), 0, 3, height)
  }, [audioContext, bpmValue, globalSampleCount, timelineRefs, timelineWindowRef])

  useEffect(() => {
    let frameId: number | null = null
    const render = () => {
      drawMinimap()
      frameId = requestAnimationFrame(render)
    }
    render()
    return () => {
      if (frameId != null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [drawMinimap])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const release = () => {
      isDraggingRef.current = false
    }
    window.addEventListener('pointerup', release)
    return () => {
      window.removeEventListener('pointerup', release)
    }
  }, [])

  return (
    <div className="w-full h-[9dvh] border border-gray-600 bg-gray-900 overflow-hidden touch-none flex flex-row">
      <button
        className="p-2 bg-gray-800 text-white"
        onPointerDown={() => {
          seekToSample(0)
        }}
      >
      </button>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
