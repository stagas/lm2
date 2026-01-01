import { SCROLL_SMOOTHING } from './constants.ts'
import { useEngineRuntimeStore } from './store.ts'

export function applySmoothing(target: number, value: number, crossover = 100) {
  const diff = value - target
  const isPlaying = useEngineRuntimeStore.getState().playbackState === 'running'
  return target
    + diff * SCROLL_SMOOTHING * (isPlaying && Math.abs(diff) > crossover ? 4 : (!isPlaying ? 1.8 : 1))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
