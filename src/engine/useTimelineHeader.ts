import type { EditorHeader } from 'mini-code'
import { useMemo, useRef } from 'react'
import { FUTURE_SECONDS, PAST_SECONDS, TIME_WINDOW_SECONDS } from '../../as/assembly/constants.ts'
import { PIANOROLL_KEY_WIDTH, SCROLL_SMOOTHING } from './constants.ts'
import { useEngineStore } from './store.ts'
import type { TimelineWindow } from './ui.tsx'

export function useTimelineHeader(seekToSample: (targetSampleCount: number) => void) {
  const {
    audioContext,
    bpmValue,
    globalSampleCount,
  } = useEngineStore()

  const timelineTimeRef = useRef<number | null>(null)
  const timelineLayoutRef = useRef({ viewX: 0, viewWidth: 0 })
  const timelineWindowRef = useRef<TimelineWindow>({
    windowStartTime: 0,
    windowEndTime: 0,
    timeSeconds: 0,
  })
  const isTimelineDraggingRef = useRef(false)

  const timelineHeader = useMemo((): EditorHeader => {
    const handleSeek = (pointerX: number) => {
      if (!audioContext) return

      const layout = timelineLayoutRef.current
      const timelineWidth = Math.max(1, layout.viewWidth - PIANOROLL_KEY_WIDTH)
      const timelineStartX = layout.viewX + PIANOROLL_KEY_WIDTH
      const relativeX = pointerX - timelineStartX
      const clampedX = Math.max(0, Math.min(timelineWidth, relativeX))

      const windowStartTime = timelineWindowRef.current.windowStartTime
      const secondsPerPixel = TIME_WINDOW_SECONDS / timelineWidth
      const targetTimeSeconds = windowStartTime + clampedX * secondsPerPixel
      const targetSampleCount = Math.max(0, Math.floor(targetTimeSeconds * audioContext.sampleRate))
      seekToSample(targetSampleCount)
    }

    return {
      height: 32,
      pointerDown: (x) => {
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

        const sampleRate = audioContext.sampleRate
        const sampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
        const nowSeconds = sampleCount / sampleRate
        let smoothed = timelineTimeRef.current
        if (smoothed == null) smoothed = nowSeconds
        else smoothed += (nowSeconds - smoothed) * SCROLL_SMOOTHING
        timelineTimeRef.current = smoothed
        const timeSeconds = smoothed

        const bpm = bpmValue[0] || 60
        const barLengthSeconds = (4 * 60) / bpm
        const windowStartTime = timeSeconds - PAST_SECONDS
        const windowEndTime = timeSeconds + FUTURE_SECONDS
        timelineWindowRef.current = { windowStartTime, windowEndTime, timeSeconds }

        const pixelsPerSecond = timelineW / TIME_WINDOW_SECONDS
        const playheadX = viewX + PAST_SECONDS * pixelsPerSecond

        c.save()
        c.beginPath()

        c.fillStyle = 'rgba(0, 0, 0, 0.25)'
        c.fillRect(viewX, y, viewW, h)

        const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
        for (let barStart = firstBarStart; barStart < windowEndTime + barLengthSeconds; barStart += barLengthSeconds) {
          if (barStart < 0) continue
          const barIndex = Math.floor(barStart / barLengthSeconds)
          const barNumber = barIndex + 1
          const isPhraseStart = ((barNumber - 1) & 3) === 0

          const barX = viewX + (barStart - windowStartTime) * pixelsPerSecond

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
  }, [audioContext, bpmValue, globalSampleCount, seekToSample])

  return { timelineHeader, timelineWindowRef }
}
