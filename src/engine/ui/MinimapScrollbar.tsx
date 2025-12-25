import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { MouseButton } from 'utils/mouse-buttons'
import { compileTimelineNotation } from '../../timeline/compiler.ts'
import type { TimelineLabel, TimelineSequenceRef } from '../bytecode/bytecode.ts'
import {
  type CompiledTimeline,
  evalCompiledTimelineAtBeat,
  parseCompiledTimeline,
} from '../dsp/timeline-history.ts'
import { useEngineRuntimeStore } from '../store.ts'
import type { TimelineWindow } from '../types.ts'
import { useTheme } from './theme.ts'
import { useRestartLoop } from './useRestartLoop.tsx'
import { useSeekToSampleImmediate } from './useSeekToSample.ts'

type MinimapScrollbarProps = {
  audioContext?: AudioContext | null
  bpmValue?: Float32Array
  globalSampleCount?: Int32Array
  timelineRefs?: TimelineSequenceRef[]
  timelineLabels?: TimelineLabel[]
  bars?: number
  zeroBased: boolean
  seekToSample: (targetSampleCount: number) => void
  timelineWindowRef: React.RefObject<TimelineWindow>
  canControlPlayback?: boolean
}

const DEFAULT_BARS = 128
const MINIMAP_MINOR_STEP = 4
const MINIMAP_MAJOR_STEP = 16
const BEATS_PER_BAR = 4

export function MinimapScrollbar({
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  timelineLabels,
  bars,
  zeroBased,
  seekToSample,
  timelineWindowRef,
  canControlPlayback = true,
}: MinimapScrollbarProps) {
  const { loop, setLoop, clearLoop, animationManager } = useEngineRuntimeStore()
  const seekToSampleImmediate = useSeekToSampleImmediate()
  const restartLoop = useRestartLoop()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const timelineCacheRef = useRef<Map<number, {
    sequence: string
    width: number
    bpm: number
    bars: number
    tl: CompiledTimeline | null
    vByX: Float32Array
  }>>(new Map())

  const theme = useTheme()

  const currentSampleRef = useRef(0)
  const barCount = Math.max(1, Math.floor(bars ?? DEFAULT_BARS))
  const canvasDimsRef = useRef({ width: 0, height: 0, pixelRatio: 1 })
  const isValidRef = useRef(false)

  const seekFromPointer = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || !audioContext || !isValidRef.current) return

    const { width } = canvasDimsRef.current
    if (width <= 0) return

    const rect = canvas.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const clampedRatio = Math.max(0, Math.min(1, relativeX / width))
    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (BEATS_PER_BAR * 60) / bpm
    const totalSeconds = barLengthSeconds * barCount
    const totalSamples = Math.max(1, Math.floor(totalSeconds * audioContext.sampleRate))
    const targetSampleCount = Math.max(0, Math.floor(clampedRatio * totalSamples))
    currentSampleRef.current = targetSampleCount
    seekToSample(targetSampleCount)
  }, [audioContext, barCount, bpmValue, seekToSample])

  const toggleLoopFromPointer = useCallback((clientX: number) => {
    if (!canControlPlayback) return
    const canvas = canvasRef.current
    if (!canvas || !audioContext || !isValidRef.current) return

    const { width } = canvasDimsRef.current
    if (width <= 0) return

    const rect = canvas.getBoundingClientRect()
    const relativeX = clientX - rect.left
    const clampedRatio = Math.max(0, Math.min(1, relativeX / width))

    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (BEATS_PER_BAR * 60) / bpm

    const barIndex = Math.max(0, Math.min(barCount - 1, Math.floor(clampedRatio * barCount)))
    const barNumber = barIndex + 1
    const groupStartNumber = Math.floor((barNumber - 1) / 4) * 4 + 1
    const groupEndNumber = Math.min(groupStartNumber + 4, barCount + 1)

    const startSeconds = (groupStartNumber - 1) * barLengthSeconds
    const endSeconds = (groupEndNumber - 1) * barLengthSeconds

    const startSample = Math.max(0, Math.floor(startSeconds * audioContext.sampleRate))
    const endSample = Math.max(0, Math.floor(endSeconds * audioContext.sampleRate))
    if (endSample <= startSample) return

    const isEnabled = loop ? Atomics.load(loop, 0) === 1 : false
    const currStart = isEnabled && loop ? Atomics.load(loop, 1) : 0
    const currEnd = isEnabled && loop ? Atomics.load(loop, 2) : 0

    if (isEnabled && currStart === startSample && currEnd === endSample) {
      clearLoop()
      return
    }

    setLoop(startSample, endSample)
    const currentSample = globalSampleCount ? Math.max(0, Atomics.load(globalSampleCount, 0)) : 0
    if (currentSample >= endSample) {
      currentSampleRef.current = startSample
      seekToSample(startSample)
    }
  }, [audioContext, barCount, bpmValue, canControlPlayback, clearLoop, globalSampleCount, loop, seekToSample, setLoop])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()

    if (event.buttons & MouseButton.Right) {
      if (canControlPlayback) toggleLoopFromPointer(event.clientX)
      return
    }

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
  }, [canControlPlayback, seekFromPointer, toggleLoopFromPointer])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isDraggingRef.current) return
    event.preventDefault()
    seekFromPointer(event.clientX)
  }, [seekFromPointer])

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !isValidRef.current) return

    const { width, height } = canvasDimsRef.current
    if (width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (BEATS_PER_BAR * 60) / bpm
    const totalSeconds = barLengthSeconds * barCount
    const sampleRate = audioContext?.sampleRate ?? 44100
    const totalSamples = Math.max(1, Math.floor(totalSeconds * sampleRate))

    const windowData = timelineWindowRef.current
    const startRatio = Math.max(0, Math.min(1, windowData.windowStartTime / totalSeconds))
    const endRatio = Math.max(0, Math.min(1, windowData.windowEndTime / totalSeconds))
    const viewportWidth = Math.max(0, width * (endRatio - startRatio))

    if (viewportWidth > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
      ctx.fillRect(width * startRatio, 0, viewportWidth, height)
    }

    const isLooping = canControlPlayback && loop ? Atomics.load(loop, 0) === 1 : false
    if (isLooping && loop) {
      const loopStartSamples = Atomics.load(loop, 1)
      const loopEndSamples = Atomics.load(loop, 2)
      if (loopEndSamples > loopStartSamples) {
        const loopStartSeconds = loopStartSamples / sampleRate
        const loopEndSeconds = loopEndSamples / sampleRate
        const loopStartRatio = Math.max(0, Math.min(1, loopStartSeconds / totalSeconds))
        const loopEndRatio = Math.max(0, Math.min(1, loopEndSeconds / totalSeconds))
        const lx = width * loopStartRatio + 1
        const lw = Math.max(0, width * (loopEndRatio - loopStartRatio))
        if (lw > 0) {
          ctx.fillStyle = '#ea580c88'
          ctx.fillRect(lx, 0, lw, height)
          // ctx.strokeStyle = '#ea580c'
          // ctx.lineWidth = 2
          // ctx.strokeRect(lx + 0.5, -2, lw - 1, height + 4)
        }
      }
    }

    const labelStarts = timelineLabels && timelineLabels.length > 0
      ? Array.from(new Set(
        timelineLabels
          .map(l => l.bar)
          .filter(barIndex => barIndex >= 0 && barIndex <= barCount),
      )).sort((a, b) => a - b)
      : []
    const hasLabels = labelStarts.length > 0
    let start = 0
    let labelStartIndex = 0

    for (let barIndex = 0; barIndex <= barCount; barIndex += MINIMAP_MINOR_STEP) {
      const x = (barIndex / barCount) * (width - 2)
      if (hasLabels) {
        while (labelStartIndex < labelStarts.length && labelStarts[labelStartIndex]! <= barIndex) {
          start = labelStarts[labelStartIndex]!
          labelStartIndex++
        }
      }
      const isMajor = hasLabels
        ? (barIndex - start) % MINIMAP_MAJOR_STEP === 0
        : barIndex % MINIMAP_MAJOR_STEP === 0
      // Draw a small phrase number above the major marker
      ctx.fillStyle = isMajor ? '#fff' : 'rgba(255, 255, 255, 0.35)'
      ctx.font = isMajor ? 'bold 6pt Outfit' : '6pt Outfit'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const phraseNumber = String(zeroBased ? barIndex : barIndex + 1)
      // place label a few pixels from the top-left of the marker
      ctx.fillText(phraseNumber, x + 5, 10)
      // if (barIndex >= barCount) continue
      ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    if (timelineLabels && timelineLabels.length > 0) {
      const defaultColor = 'rgba(255, 220, 0, 0.85)'
      const beatLengthSeconds = (60 * BEATS_PER_BAR) / bpm
      const labelPositions: { x: number; color: string }[] = []
      for (const label of timelineLabels) {
        const labelSeconds = (label.bar) * beatLengthSeconds
        if (labelSeconds < 0 || labelSeconds > totalSeconds) continue
        const x = (labelSeconds / totalSeconds) * width + 1
        const isMajor = (label.bar) % MINIMAP_MAJOR_STEP === 0
        const color = label.color || defaultColor
        // draw the vertical marker line
        ctx.strokeStyle = color
        ctx.lineWidth = isMajor ? 2 : 1.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
        // store position for tinting between labels
        labelPositions.push({ x, color })
      }

      // Fill (tint) the area between consecutive labels using their color at alpha 0.2
      if (labelPositions.length >= 2) {
        for (let i = 0; i < labelPositions.length - 1; i++) {
          const left = labelPositions[i]
          const right = labelPositions[i + 1]
          const fillX = left.x
          const fillW = Math.max(0, right.x - left.x)
          if (fillW <= 0) continue
          ctx.save()
          ctx.globalAlpha = 0.2
          ctx.fillStyle = left.color
          ctx.fillRect(fillX, 0, fillW, height)
          ctx.restore()
        }
      }
      // If there's a trailing label, fill from it to the end (outro)
      if (labelPositions.length >= 1) {
        const last = labelPositions[labelPositions.length - 1]
        const fillX = last.x
        const fillW = Math.max(0, width - fillX)
        if (fillW > 0) {
          ctx.save()
          ctx.globalAlpha = 0.2
          ctx.fillStyle = last.color
          ctx.fillRect(fillX, 0, fillW, height)
          ctx.restore()
        }
      }
    }

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
          && cached.bars === barCount

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
            bars: barCount,
            tl,
            vByX,
          })
        }

        if (!tl || !vByX) continue

        const color = ref.color || theme.colors.function
        if (!ref.color) colorIndex++

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

    if (!isDraggingRef.current) {
      currentSampleRef.current = globalSampleCount ? Math.max(0, Atomics.load(globalSampleCount, 0)) : 0
    }
    const currentRatio = currentSampleRef.current / totalSamples
    const playheadX = currentRatio * width + 1

    ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 220, 0, 0.2)'
    ctx.fillRect(Math.max(0, playheadX - 1.5), 0, 3, height)
  }, [
    audioContext,
    barCount,
    bpmValue,
    canControlPlayback,
    globalSampleCount,
    loop,
    timelineLabels,
    timelineRefs,
    timelineWindowRef,
    zeroBased,
  ])

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      const pixelRatio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0 && height > 0) {
        canvas.width = width * pixelRatio
        canvas.height = height * pixelRatio
        const ctx = canvas.getContext('2d')
        ctx?.scale(pixelRatio, pixelRatio)
        canvasDimsRef.current = { width, height, pixelRatio }
        isValidRef.current = true
      }
    })

    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!animationManager) return
    animationManager.register(drawMinimap)
    return () => {
      animationManager.unregister(drawMinimap)
    }
  }, [drawMinimap, animationManager])

  return (
    <div className="flex flex-row w-full h-full">
      <button
        className="min-w-[17px] w-[17px] bg-neutral-800 text-white"
        onPointerDown={() => {
          if (!canControlPlayback) {
            seekToSampleImmediate(0)
            return
          }
          void restartLoop()
        }}
      >
        &nbsp;
      </button>
      <canvas
        ref={canvasRef}
        className="w-[calc(100%-17px)] h-full touch-none"
        onContextMenu={e => e.preventDefault()}
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
