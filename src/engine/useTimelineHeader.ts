import type { EditorHeader } from 'mini-code'
import { useEffect, useMemo, useRef } from 'react'
import { MouseButton } from 'utils/mouse-buttons'
import { FUTURE_BARS, PAST_BARS, TIME_WINDOW_BARS } from '../../as/assembly/constants.ts'
import { PIANOROLL_KEY_WIDTH } from './constants.ts'
import { useEngineStore } from './store.ts'
import type { TimelineWindow } from './ui.tsx'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'
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
    timelineLabels,
    uiTimelineLabels,
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

  const timelineHeader = useMemo((): EditorHeader => {
    const activeLabels = (uiTimelineLabels?.length ?? 0) > 0 ? uiTimelineLabels : timelineLabels
    const labels = [...(activeLabels ?? [])].sort((a, b) => a.bar - b.bar)
    const defaultLabelColor = 'rgba(255, 220, 0, 0.9)'

    const getPointerTimeSeconds = (pointerX: number) => {
      if (!audioContext) return

      const layout = timelineLayoutRef.current
      const timelineWidth = Math.max(1, layout.viewWidth - PIANOROLL_KEY_WIDTH)
      const timelineStartX = layout.viewX + PIANOROLL_KEY_WIDTH
      const relativeX = pointerX - timelineStartX
      const clampedX = Math.max(0, Math.min(timelineWidth, relativeX))

      const bpm = bpmValue?.[0] || 60
      const barLengthSeconds = (4 * 60) / bpm
      const timeWindowSeconds = TIME_WINDOW_BARS * barLengthSeconds
      const windowStartTime = timelineWindowRef.current.windowStartTime
      const secondsPerPixel = timeWindowSeconds / timelineWidth
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

    const drawTint = (c: CanvasRenderingContext2D, viewX: number, tintW: number, y: number, h: number, startX: number,
      endX: number, color: string) =>
    {
      const start = Math.max(-viewX, Math.min(tintW, startX))
      const end = Math.max(0, Math.min(tintW, endX))
      const ww = Math.max(0, end - start)
      if (ww <= 0) return
      c.save()
      c.globalAlpha = 0.175
      c.fillStyle = color
      c.fillRect(start, y, ww, h)
      c.restore()
    }

    return {
      height: 40,
      pointerDown: (e, x) => {
        if (e.buttons & MouseButton.Right) {
          handleLoopBar(x)
          return
        }
        isTimelineDraggingRef.current = true
        handleSeek(x)
      },
      pointerMove: x => {
        if (!isTimelineDraggingRef.current) return
        handleSeek(x)
      },
      pointerUp: () => {
        isTimelineDraggingRef.current = false
      },
      render: (c, x, y, w, h, vx, vw) => {
        c.fillStyle = '#000c'
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
        const windowStartTime = timeSeconds - PAST_BARS * barLengthSeconds
        const windowEndTime = timeSeconds + FUTURE_BARS * barLengthSeconds
        timelineWindowRef.current = { windowStartTime, windowEndTime, timeSeconds }

        const timeWindowSeconds = TIME_WINDOW_BARS * barLengthSeconds
        const pixelsPerSecond = timelineW / timeWindowSeconds
        const playheadX = PAST_BARS * barLengthSeconds * pixelsPerSecond

        c.save()
        c.translate(viewX, 0)
        c.beginPath()

        // c.fillStyle = 'rgba(0, 0, 0, 0.25)'
        // c.fillRect(0, y, viewW, h)

        let lastLabelColor: string | undefined
        if (labels.length > 0) {
          const beatLengthSeconds = (60 * 4) / bpm
          const tintW = w

          const labelPositions: { x: number; color: string }[] = []
          let leftColor: string | undefined
          let leftX = 0

          for (let i = 0; i < labels.length; i++) {
            const label = labels[i]
            const color = label.color || defaultLabelColor
            const labelSeconds = (label.bar - 1) * beatLengthSeconds

            if (labelSeconds <= timeSeconds) lastLabelColor = color

            if (labelSeconds <= windowStartTime) {
              leftColor = color
              leftX = (labelSeconds - windowStartTime) * pixelsPerSecond
              continue
            }
            if (labelSeconds > windowEndTime) break
            const x = (labelSeconds - windowStartTime) * pixelsPerSecond
            labelPositions.push({ x, color })
          }

          // If there's a label starting offscreen-left, treat it as starting at x=0.
          if (leftColor) {
            labelPositions.unshift({ x: leftX, color: leftColor })
          }

          // Fill (tint) the area between consecutive labels
          if (labelPositions.length >= 2) {
            for (let i = 0; i < labelPositions.length - 1; i++) {
              const left = labelPositions[i]!
              const right = labelPositions[i + 1]!
              drawTint(c, viewX, tintW, y, h, left.x, right.x, left.color)
            }
          }

          // Fill trailing segment from the last label to the right edge
          if (labelPositions.length >= 1) {
            const last = labelPositions[labelPositions.length - 1]!
            drawTint(c, viewX, tintW, y, h, last.x, w, last.color)
          }
        }

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
              c.fillStyle = '#ea580c88'
              c.fillRect(lx1, y, lw, h)
              // c.strokeStyle = '#fff3'
              // c.lineWidth = 1
              // c.strokeRect(lx1 + 0.5, y + 0.5, lw - 1, h - 1)
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
          c.fillText(timeLabel, barX + 4, y + 18)
        }

        let playheadColor = lastLabelColor || 'rgba(255, 220, 0, 0.9)'

        if (labels.length > 0) {
          const beatLengthSeconds = (60 * 4) / bpm
          c.textAlign = 'left'
          c.textBaseline = 'bottom'
          c.font = '800 7.5pt Inter'
          for (let i = 0; i < labels.length; i++) {
            const label = labels[i]
            const labelSeconds = (label.bar - 1) * beatLengthSeconds
            let labelX = (labelSeconds - windowStartTime) * pixelsPerSecond
            let origLabelX = labelX
            labelX = Math.max(playheadX, labelX)

            // Check if next label would overlap, and if so, constrain this label's position
            if (i + 1 < labels.length) {
              const nextLabel = labels[i + 1]
              const nextLabelSeconds = (nextLabel.bar - 1) * beatLengthSeconds
              let nextLabelX = (nextLabelSeconds - windowStartTime) * pixelsPerSecond

              const text = label.text
              if (text) {
                let textWidth = 0
                text.split('').forEach(char => {
                  textWidth += c.measureText(char).width + 1.5
                })
                textWidth -= 1.5 // Adjust for the last character spacing

                // If text would extend past next label, constrain position
                if (labelX + 8 + textWidth > nextLabelX) {
                  labelX = Math.min(playheadX, nextLabelX - 8 - textWidth)
                }
              }
            }

            const color = label.color || defaultLabelColor

            c.strokeStyle = color
            c.lineWidth = 1.5

            if (origLabelX === labelX) {
              c.beginPath()
              c.moveTo(labelX, y)
              c.lineTo(labelX, y + h)
              c.stroke()
            }

            const text = label.text
            if (!text) continue

            const textX = labelX + 4
            const textY = y + h - 1

            c.fillStyle = color
            let x = textX
            text.split('').forEach(char => {
              c.fillText(char, x, textY)
              x += c.measureText(char).width + 1.5
            })
          }
        }

        c.strokeStyle = playheadColor
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(playheadX, y)
        c.lineTo(playheadX, y + h)
        c.stroke()

        c.restore()
      },
    }
  }, [audioContext, bpmValue, clearLoop, globalSampleCount, loop, seekToSample, setLoop, timelineLabels,
    uiTimelineLabels])

  return { timelineHeader, timelineWindowRef }
}
