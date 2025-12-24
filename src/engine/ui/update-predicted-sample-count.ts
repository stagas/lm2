import { useEngineRuntimeStore } from '../store.ts'

export type PredictedSampleCountState = {
  predictedSampleCountRef: React.RefObject<number | null>
  lastWallTimeRef: React.RefObject<number | null>
  isFirstFrameRef: React.RefObject<boolean>
}

export function updatePredictedSampleCount(
  audioContext: AudioContext | undefined,
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined,
  state: PredictedSampleCountState,
  opts?: { isPlaying?: boolean },
): { sampleRate: number; sampleCount: number; timeSeconds: number } | null {
  if (!audioContext || !globalSampleCount) return null
  const isPlaying = opts?.isPlaying ?? (useEngineRuntimeStore.getState().playbackState === 'running')

  const sampleRate = audioContext.sampleRate

  const rawSampleCount = (Atomics.load(globalSampleCount, 0) >>> 0) as number
  const latencySeconds = (audioContext.outputLatency || 0) - (audioContext.baseLatency || 0)
  const latencySamples = latencySeconds * sampleRate
  const rawPlaybackPosition = rawSampleCount - (isPlaying ? latencySamples : 0)

  const nowSec = performance.now() / 1000
  const lastWall = state.lastWallTimeRef.current ?? nowSec
  const deltaTime = Math.max(0, nowSec - lastWall)
  state.lastWallTimeRef.current = nowSec

  let predicted = state.predictedSampleCountRef.current
  const isFirstFrame = state.isFirstFrameRef.current || predicted == null

  if (isFirstFrame || !isPlaying) {
    predicted = rawPlaybackPosition
    state.isFirstFrameRef.current = false
  }
  else {
    const drift = rawPlaybackPosition - (predicted ?? 0)
    if (Math.abs(drift) > sampleRate) {
      predicted = rawPlaybackPosition
    }
    else {
      predicted = (predicted ?? 0) + deltaTime * sampleRate
      if (Math.abs(drift) > 100) {
        const correctionSpeed = 0.05
        predicted += drift * correctionSpeed
      }
    }
  }

  predicted = Math.max(0, predicted ?? 0)
  state.predictedSampleCountRef.current = predicted

  const sampleCount = predicted
  const timeSeconds = sampleCount / sampleRate
  return { sampleRate, sampleCount, timeSeconds }
}
