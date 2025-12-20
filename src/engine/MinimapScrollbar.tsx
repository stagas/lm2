import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { MouseButton } from 'utils/mouse-buttons'
import type { TimelineLabel, TimelineSequenceRef } from '../bytecode.ts'
import { compileTimelineNotation } from '../timeline/compiler.ts'
import { useEngineStore } from './store.ts'
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
  timelineLabels?: TimelineLabel[]
  seekToSample: (targetSampleCount: number) => void
  timelineWindowRef: React.RefObject<TimelineWindow>
}

const MINIMAP_PHRASE_COUNT = 276
const MINIMAP_PHRASE_SECONDS = 2
const MINIMAP_MINOR_STEP = 4
const MINIMAP_MAJOR_STEP = 16

export function MinimapScrollbar({
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  timelineLabels,
  seekToSample,
  timelineWindowRef,
}: MinimapScrollbarProps) {
  const { loop, setLoop, clearLoop } = useEngineStore()

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

  const toggleLoopFromPointer = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || !audioContext) return

    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    if (width <= 0) return

    const relativeX = clientX - rect.left
    const clampedRatio = Math.max(0, Math.min(1, relativeX / width))

    const bpm = bpmValue?.[0] || 60
    const beatLengthSeconds = (MINIMAP_PHRASE_SECONDS * 60) / bpm
    const barLengthSeconds = MINIMAP_PHRASE_SECONDS * beatLengthSeconds

    const barIndex = Math.max(0, Math.min(MINIMAP_PHRASE_COUNT - 1, Math.floor(clampedRatio * MINIMAP_PHRASE_COUNT)))
    const barNumber = barIndex + 1
    const groupStartNumber = Math.floor((barNumber - 1) / 4) * 4 + 1
    const groupEndNumber = groupStartNumber + 4

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
  }, [audioContext, bpmValue, clearLoop, globalSampleCount, loop, seekToSample, setLoop])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()

    if (event.buttons & MouseButton.Right) {
      toggleLoopFromPointer(event.clientX)
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
  }, [seekFromPointer, toggleLoopFromPointer])

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

    if (viewportWidth > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.fillRect(width * startRatio, 0, viewportWidth, height)
    }

    const isLooping = loop ? Atomics.load(loop, 0) === 1 : false
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
          .map(l => l.bar - 1)
          .filter(barIndex => barIndex >= 0 && barIndex <= MINIMAP_PHRASE_COUNT),
      )).sort((a, b) => a - b)
      : []
    const hasLabels = labelStarts.length > 0
    let start = 0
    let labelStartIndex = 0

    for (let phraseIndex = 0; phraseIndex <= MINIMAP_PHRASE_COUNT; phraseIndex += MINIMAP_MINOR_STEP) {
      const x = (phraseIndex / MINIMAP_PHRASE_COUNT) * width + 1
      if (hasLabels) {
        while (labelStartIndex < labelStarts.length && labelStarts[labelStartIndex]! <= phraseIndex) {
          start = labelStarts[labelStartIndex]!
          labelStartIndex++
        }
      }
      const isMajor = hasLabels
        ? (phraseIndex - start) % MINIMAP_MAJOR_STEP === 0
        : phraseIndex % MINIMAP_MAJOR_STEP === 0
      // Draw a small phrase number above the major marker
      ctx.fillStyle = isMajor ? '#fff' : 'rgba(255, 255, 255, 0.35)'
      ctx.font = isMajor ? 'bold 6pt Inter' : '6pt Inter'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const phraseNumber = String(phraseIndex + 1)
      // place label a few pixels from the top-left of the marker
      ctx.fillText(phraseNumber, x + 2.25, 10)
      if (phraseIndex >= MINIMAP_PHRASE_COUNT - 4) continue
      ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    if (timelineLabels && timelineLabels.length > 0) {
      const defaultColor = 'rgba(255, 220, 0, 0.85)'
      const beatLengthSeconds = (60 * 4) / bpm
      const labelPositions: { x: number; color: string }[] = []
      for (const label of timelineLabels) {
        const labelSeconds = (label.bar - 1) * beatLengthSeconds
        if (labelSeconds < 0 || labelSeconds > totalSeconds) continue
        const x = (labelSeconds / totalSeconds) * width + 1
        const isMajor = labelSeconds % MINIMAP_MAJOR_STEP === 0
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

    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 220, 0, 0.2)'
    ctx.fillRect(Math.max(0, playheadX - 1.5), 0, 3, height)
  }, [audioContext, bpmValue, globalSampleCount, loop, timelineLabels, timelineRefs, timelineWindowRef])

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
    <div className="w-full h-full overflow-hidden touch-none flex flex-row">
      <button
        className="min-w-[17px] bg-neutral-800 text-white"
        onPointerDown={() => {
          const isLooping = loop ? Atomics.load(loop, 0) === 1 : false
          if (isLooping && loop) {
            const loopStartSamples = Atomics.load(loop, 1)
            seekToSample(loopStartSamples)
          }
          else {
            seekToSample(0)
          }
        }}
      >
        &nbsp;
      </button>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onContextMenu={e => e.preventDefault()}
        onPointerDown={handlePointerDown}
      />
    </div>
  )
}
