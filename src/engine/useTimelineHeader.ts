import type { EditorHeader } from 'mini-code'
import { useEffect, useMemo, useRef } from 'react'
import { FUTURE_SECONDS, PAST_SECONDS, TIME_WINDOW_SECONDS } from '../../as/assembly/constants.ts'
import { PIANOROLL_KEY_WIDTH, SCROLL_SMOOTHING } from './constants.ts'
import { useEngineStore } from './store.ts'
import type { TimelineWindow } from './ui.tsx'
import { updatePredictedSampleCount } from './updatePredictedSampleCount.ts'
import { useSeekToSample } from './useSeekToSample.ts'
import { applySmoothing } from './util.ts'

export function useTimelineHeader() {
  const {
    audioContext,
    bpmValue,
    globalSampleCount,
    loop,
    setLoop,
    clearLoop,
  } = useEngineStore()

  const seekToSample = useSeekToSample()

  const timelineTimeRef = useRef<number | null>(null)
  const timelineLayoutRef = useRef({ viewX: 0, viewWidth: 0 })
  const timelineWindowRef = useRef<TimelineWindow>({
    windowStartTime: 0,
    windowEndTime: 0,
    timeSeconds: 0,
  })
  const isTimelineDraggingRef = useRef(false)
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const isCtrlDownRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') isCtrlDownRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') isCtrlDownRef.current = false
    }
    const onBlur = () => {
      isCtrlDownRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const timelineHeader = useMemo((): EditorHeader => {
    const getPointerTimeSeconds = (pointerX: number) => {
      if (!audioContext) return

      const layout = timelineLayoutRef.current
      const timelineWidth = Math.max(1, layout.viewWidth - PIANOROLL_KEY_WIDTH)
      const timelineStartX = layout.viewX + PIANOROLL_KEY_WIDTH
      const relativeX = pointerX - timelineStartX
      const clampedX = Math.max(0, Math.min(timelineWidth, relativeX))

      const windowStartTime = timelineWindowRef.current.windowStartTime
      const secondsPerPixel = TIME_WINDOW_SECONDS / timelineWidth
      const targetTimeSeconds = windowStartTime + clampedX * secondsPerPixel
      return targetTimeSeconds
    }

    const handleSeek = (pointerX: number) => {
      const targetTimeSeconds = getPointerTimeSeconds(pointerX)
      if (targetTimeSeconds == null || !audioContext) return
      const targetSampleCount = Math.max(0, Math.floor(targetTimeSeconds * audioContext.sampleRate))
      seekToSample(targetSampleCount)
    }

    const handleLoopBar = (pointerX: number) => {
      const targetTimeSeconds = getPointerTimeSeconds(pointerX)
      if (targetTimeSeconds == null || !audioContext) return

      const bpm = bpmValue?.[0] || 60
      const barLengthSeconds = (4 * 60) / bpm
      const barIndex = Math.max(0, Math.floor(targetTimeSeconds / barLengthSeconds))

      const startSeconds = barIndex * barLengthSeconds
      const endSeconds = startSeconds + barLengthSeconds

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
        seekToSample(startSample)
      }
    }

    return {
      height: 32,
      pointerDown: (x) => {
        if (isCtrlDownRef.current) {
          handleLoopBar(x)
          return
        }
        isTimelineDraggingRef.current = true
        handleSeek(x)
      },
      pointerMove: (x) => {
        if (!isTimelineDraggingRef.current) return
        handleSeek(x)
      },
      pointerUp: () => {
        isTimelineDraggingRef.current = false
      },
      render: (c, x, y, w, h, vx, vw) => {
        c.fillStyle = '#000'
        c.fillRect(x, y, w, h)
        timelineLayoutRef.current = { viewX: vx, viewWidth: vw }

        if (!audioContext || !bpmValue || !globalSampleCount) return

        const viewX = vx + PIANOROLL_KEY_WIDTH
        const viewW = vw
        const timelineW = Math.max(1, viewW - PIANOROLL_KEY_WIDTH)

        // Predict audible sample count (delegated to shared helper)
        const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
          predictedSampleCountRef,
          lastWallTimeRef,
          isFirstFrameRef,
        })
        if (!pred) return

        const nowSeconds = pred.timeSeconds

        let smoothed = timelineTimeRef.current
        if (smoothed == null) smoothed = nowSeconds
        else smoothed = applySmoothing(smoothed, nowSeconds)
        timelineTimeRef.current = smoothed
        const timeSeconds = smoothed

        const bpm = bpmValue[0] || 60
        const barLengthSeconds = (4 * 60) / bpm
        const windowStartTime = timeSeconds - PAST_SECONDS
        const windowEndTime = timeSeconds + FUTURE_SECONDS
        timelineWindowRef.current = { windowStartTime, windowEndTime, timeSeconds }

        const pixelsPerSecond = timelineW / TIME_WINDOW_SECONDS
        const playheadX = PAST_SECONDS * pixelsPerSecond

        c.save()
        c.translate(viewX, 0)
        c.beginPath()

        c.fillStyle = 'rgba(0, 0, 0, 0.25)'
        c.fillRect(0, y, viewW, h)

        const isLooping = loop ? Atomics.load(loop, 0) === 1 : false
        if (isLooping && loop) {
          const loopStart = Atomics.load(loop, 1)
          const loopEnd = Atomics.load(loop, 2)
          if (loopEnd > loopStart) {
            const startSeconds = loopStart / audioContext.sampleRate
            const endSeconds = loopEnd / audioContext.sampleRate
            const loopX1 = (startSeconds - windowStartTime) * pixelsPerSecond
            const loopX2 = (endSeconds - windowStartTime) * pixelsPerSecond
            const lx1 = Math.min(timelineW, loopX1)
            const lx2 = Math.min(timelineW, loopX2)
            const lw = Math.max(0, lx2 - lx1)
            if (lw > 0) {
              c.fillStyle = 'rgba(255, 220, 0, 0.16)'
              c.fillRect(lx1, y, lw, h)
              c.strokeStyle = 'rgba(255, 220, 0, 0.35)'
              c.lineWidth = 1
              c.strokeRect(lx1 + 0.5, y + 0.5, lw - 1, h - 1)
            }
          }
        }

        const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
        for (let barStart = firstBarStart; barStart < windowEndTime + barLengthSeconds; barStart += barLengthSeconds) {
          if (barStart < 0) continue
          const barIndex = Math.floor(barStart / barLengthSeconds)
          const barNumber = barIndex + 1
          const isPhraseStart = ((barNumber - 1) & 3) === 0

          const barX = (barStart - windowStartTime) * pixelsPerSecond

          c.strokeStyle = isPhraseStart ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.25)'
          c.lineWidth = isPhraseStart ? 1.5 : 1
          c.beginPath()
          c.moveTo(barX, y)
          c.lineTo(barX, y + h)
          c.stroke()

          c.fillStyle = isPhraseStart ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.75)'
          c.font = isPhraseStart ? 'bold 9pt Inter' : 'normal 8pt Inter'
          c.textAlign = 'left'
          c.textBaseline = 'middle'
          c.fillText(String(barNumber), barX + 4, y + 10)

          // Show time below the phrase number (formatted MM:SS) calculated from bar start seconds
          const t = Math.max(0, barStart)
          const mins = Math.floor(t / 60)
          const secs = Math.floor(t % 60)
          const timeLabel = mins + ':' + String(secs).padStart(2, '0')
          c.font = '7pt Inter'
          c.textBaseline = 'top'
          c.fillStyle = 'rgba(200,200,200,0.6)'
          c.fillText(timeLabel, barX + 4, y + 18.5)
        }

        c.strokeStyle = 'rgba(255, 220, 0, 0.9)'
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(playheadX, y)
        c.lineTo(playheadX, y + h)
        c.stroke()

        c.restore()
      },
    }
  }, [audioContext, bpmValue, clearLoop, globalSampleCount, loop, seekToSample, setLoop])

  return { timelineHeader, timelineWindowRef }
}
